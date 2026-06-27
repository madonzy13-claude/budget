/**
 * auth-write-rls.test.ts — root-cause guard for two "looks like it worked but
 * didn't" auth bugs (Phase 10 UAT):
 *
 *   #1 reset-password / change-password returns success but the password never
 *      changes — login keeps working with the OLD password.
 *   #2 "sign out this session" / "sign out all other devices" returns success but
 *      the revoked device stays logged in.
 *
 * Both share ONE cause. Better Auth's Drizzle adapter runs on appPool() with NO
 * `app.current_user_id` GUC (it's an unauthenticated token flow for reset, and the
 * adapter never sets the GUC for revoke either). identity.accounts / identity.sessions
 * had FORCED RLS whose UPDATE+DELETE policies required that GUC, so Better Auth's
 * writes matched ZERO rows — a silent no-op that still returns {status:true}.
 *
 * These tests reproduce EXACTLY what Better Auth does: a contextless app_role
 * UPDATE on the credential row and DELETE on a session row. They are RED on the
 * owner-only policies and GREEN once UPDATE/DELETE also permit the GUC-empty
 * (Better Auth) path. We assert rowCount AND the persisted effect.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, appPool } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { signUp } from "../src/application/sign-up";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

async function newUser(): Promise<string> {
  const keyStore = new LibsodiumKeyStore(KEK);
  const auth = createAuth({ emailSender: new StdoutEmailSender(), keyStore });
  const email = `rls-${crypto.randomUUID()}@example.com`;
  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "RLS",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (!r.isOk()) throw new Error("signUp failed");
  return r.value.userId;
}

// A pooled app_role connection with the user-context GUC explicitly CLEARED —
// i.e. exactly the state Better Auth's adapter runs in.
async function contextless<T>(
  fn: (
    q: (
      s: string,
      p?: unknown[],
    ) => Promise<{
      rowCount: number | null;
      rows: Array<Record<string, unknown>>;
    }>,
  ) => Promise<T>,
): Promise<T> {
  const client = await appPool().connect();
  try {
    await client.query("SELECT set_config('app.current_user_id', '', false)");
    return await fn((s, p) => client.query(s, p as never[]) as never);
  } finally {
    client.release();
  }
}

test("#1 contextless app_role UPDATE on the credential password takes effect (reset/change password)", async () => {
  const userId = await newUser();
  await contextless(async (q) => {
    const res = await q(
      "UPDATE identity.accounts SET password = $2 WHERE user_id = $1 AND provider_id = 'credential'",
      [userId, "NEW_HASH_VALUE"],
    );
    expect(res.rowCount).toBe(1); // RED on owner-only policy: 0 rows
    const after = await q(
      "SELECT password FROM identity.accounts WHERE user_id = $1 AND provider_id = 'credential'",
      [userId],
    );
    expect(after.rows[0]?.password).toBe("NEW_HASH_VALUE");
  });
});

test("#2 contextless app_role DELETE on sessions takes effect (sign out / revoke)", async () => {
  const userId = await newUser();
  await contextless(async (q) => {
    await q(
      `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, now() + interval '1 day', now(), now())`,
      [crypto.randomUUID(), userId, crypto.randomUUID()],
    );
    const del = await q("DELETE FROM identity.sessions WHERE user_id = $1", [
      userId,
    ]);
    expect(del.rowCount ?? 0).toBeGreaterThanOrEqual(1); // RED on owner-only policy: 0
    const remaining = await q(
      "SELECT count(*)::int AS c FROM identity.sessions WHERE user_id = $1",
      [userId],
    );
    expect(remaining.rows[0]?.c).toBe(0);
  });
});

test("owner-scoping still holds: a DIFFERENT user's context cannot UPDATE my credential", async () => {
  const mine = await newUser();
  const other = await newUser();
  const client = await appPool().connect();
  try {
    // Impersonate `other` via the GUC — must NOT be able to touch `mine`.
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [
      other,
    ]);
    const res = await client.query(
      "UPDATE identity.accounts SET password = 'HACKED' WHERE user_id = $1 AND provider_id = 'credential'",
      [mine],
    );
    expect(res.rowCount).toBe(0); // RLS still blocks cross-user writes when a GUC is set
  } finally {
    await client.query("SELECT set_config('app.current_user_id', '', false)");
    client.release();
  }
});
