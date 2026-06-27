/**
 * auth-write-rls.test.ts — root-cause guard for two "looks like it worked but
 * didn't" auth bugs (Phase 10 UAT):
 *
 *   #1 reset-password / change-password returns success but the password never
 *      changes — login keeps working with the OLD password.
 *   #2 "sign out this session" / "sign out all other devices" returns success but
 *      the revoked device stays logged in.
 *
 * Both share ONE cause. Better Auth's Drizzle adapter writes identity.accounts /
 * identity.sessions with NO app.current_user_id GUC (reset is an unauthenticated
 * token flow; revoke never sets it either). Those tables have FORCED RLS whose
 * UPDATE+DELETE policies required that GUC, so Better Auth's writes matched ZERO
 * rows — a silent no-op that still returns {status:true}.
 *
 * The fix scopes a bypass to Better Auth's DEDICATED pool, whose connections carry
 * `app.better_auth=on` (betterAuthPool). These tests prove:
 *   - a betterAuthPool connection CAN UPDATE the credential / DELETE the session
 *     (the bug fix), AND
 *   - an ordinary contextless app_role connection (no marker, no user GUC) is STILL
 *     blocked (no fail-open escape hatch for arbitrary queries / SQLi), AND
 *   - a DIFFERENT user's context still cannot touch my row.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, appPool, betterAuthPool } from "@budget/platform";
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

test("betterAuthPool connections carry the app.better_auth marker (set at startup)", async () => {
  const c = await betterAuthPool().connect();
  try {
    const r = await c.query(
      "SELECT current_setting('app.better_auth', true) AS m",
    );
    expect(r.rows[0]?.m).toBe("on");
  } finally {
    c.release();
  }
});

test("#1 Better Auth (marked pool) UPDATE on the credential password takes effect", async () => {
  const userId = await newUser();
  const c = await betterAuthPool().connect();
  try {
    const res = await c.query(
      "UPDATE identity.accounts SET password = $2 WHERE user_id = $1 AND provider_id = 'credential'",
      [userId, "NEW_HASH_VALUE"],
    );
    expect(res.rowCount).toBe(1); // RED on owner-only policy: 0 rows
    const after = await c.query(
      "SELECT password FROM identity.accounts WHERE user_id = $1 AND provider_id = 'credential'",
      [userId],
    );
    expect(after.rows[0]?.password).toBe("NEW_HASH_VALUE");
  } finally {
    c.release();
  }
});

test("#2 Better Auth (marked pool) DELETE on sessions takes effect", async () => {
  const userId = await newUser();
  const c = await betterAuthPool().connect();
  try {
    await c.query(
      `INSERT INTO identity.sessions (id, user_id, token, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, now() + interval '1 day', now(), now())`,
      [crypto.randomUUID(), userId, crypto.randomUUID()],
    );
    const del = await c.query(
      "DELETE FROM identity.sessions WHERE user_id = $1",
      [userId],
    );
    expect(del.rowCount ?? 0).toBeGreaterThanOrEqual(1); // RED on owner-only policy: 0
    const remaining = await c.query(
      "SELECT count(*)::int AS c FROM identity.sessions WHERE user_id = $1",
      [userId],
    );
    expect(remaining.rows[0]?.c).toBe(0);
  } finally {
    c.release();
  }
});

test("SECURITY: an ordinary contextless app_role connection (no marker) CANNOT write the credential", async () => {
  const userId = await newUser();
  const c = await appPool().connect();
  try {
    await c.query("SELECT set_config('app.current_user_id', '', false)"); // no user context
    // appPool has NO app.better_auth marker → the bypass must NOT apply.
    const marker = await c.query(
      "SELECT current_setting('app.better_auth', true) AS m",
    );
    expect(marker.rows[0]?.m === "on").toBe(false);
    const res = await c.query(
      "UPDATE identity.accounts SET password = 'HACKED' WHERE user_id = $1 AND provider_id = 'credential'",
      [userId],
    );
    expect(res.rowCount).toBe(0); // blocked — no fail-open escape hatch
  } finally {
    c.release();
  }
});

test("SECURITY: a DIFFERENT user's context cannot UPDATE my credential", async () => {
  const mine = await newUser();
  const other = await newUser();
  const c = await appPool().connect();
  try {
    await c.query("SELECT set_config('app.current_user_id', $1, false)", [
      other,
    ]);
    const res = await c.query(
      "UPDATE identity.accounts SET password = 'HACKED' WHERE user_id = $1 AND provider_id = 'credential'",
      [mine],
    );
    expect(res.rowCount).toBe(0);
  } finally {
    await c.query("SELECT set_config('app.current_user_id', '', false)");
    c.release();
  }
});
