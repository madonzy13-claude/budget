/**
 * email-change-hash.test.ts — Plan 10-03 (CRITICAL gotcha guard)
 *
 * The encrypted-PII columns: email_hash is a deterministic BLAKE2b(email) used by
 * the users_email_hash_uq UNIQUE index. Better Auth's changeEmail writes only the
 * PLAIN email column — so an email change MUST recompute email_hash, else the hash
 * still reflects the OLD address (broken uniqueness + stale lookup). The shared
 * recomputeEmailHash helper (used by BOTH create-after and update-after hooks) is
 * the fix; this real-Postgres test proves it.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withUserContext } from "@budget/platform";
import {
  createAuth,
  recomputeEmailHash,
} from "../src/adapters/persistence/better-auth";
import { DrizzleUserRepo } from "../src/adapters/persistence/user-repo";
import { signUp } from "../src/application/sign-up";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

async function readEmailHash(userId: string): Promise<Buffer> {
  const r = await withUserContext(UserId(userId), async (tx) => {
    const res = await tx.execute(
      sql`SELECT email_hash FROM identity.users WHERE id = ${userId}::uuid`,
    );
    return (res as { rows: Array<{ email_hash: Buffer }> }).rows[0]!.email_hash;
  });
  if (r.isErr()) throw r.error;
  return Buffer.from(r.value);
}

test("create-after seeds email_hash matching the signup email", async () => {
  const keyStore = new LibsodiumKeyStore(KEK);
  const auth = createAuth({ emailSender: new StdoutEmailSender(), keyStore });
  const email = `ech-${Date.now()}@example.com`;
  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Hash Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (!r.isOk()) return;
  const got = await readEmailHash(r.value.userId);
  const want = Buffer.from(await keyStore.emailHash(email));
  expect(got.equals(want)).toBe(true);
});

test("recomputeEmailHash makes email_hash match the NEW email after a change", async () => {
  const keyStore = new LibsodiumKeyStore(KEK);
  const auth = createAuth({ emailSender: new StdoutEmailSender(), keyStore });
  const repo = new DrizzleUserRepo();
  const email = `ech-old-${Date.now()}@example.com`;
  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Change Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (!r.isOk()) return;
  const userId = r.value.userId;

  // Simulate Better Auth's changeEmail confirm: it writes ONLY the plain email
  // column (+ flips email_verified) — the recompute is OUR responsibility.
  const newEmail = `ech-new-${Date.now()}@example.com`;
  const upd = await withUserContext(UserId(userId), async (tx) => {
    await tx.execute(
      sql`UPDATE identity.users SET email = ${newEmail}, email_verified = false WHERE id = ${userId}::uuid`,
    );
  });
  expect(upd.isOk()).toBe(true);

  // The update.after hook calls exactly this:
  await recomputeEmailHash(keyStore, UserId(userId), newEmail);

  // Plain-column truths
  const user = await repo.findById(UserId(userId));
  expect(user?.email).toBe(newEmail);
  expect(user?.emailVerified).toBe(false);
  expect(await repo.findByEmail(newEmail)).not.toBeNull();
  expect(await repo.findByEmail(email)).toBeNull();

  // The CRITICAL assertion: email_hash now matches the NEW email, not the old.
  const got = await readEmailHash(userId);
  expect(got.equals(Buffer.from(await keyStore.emailHash(newEmail)))).toBe(
    true,
  );
  expect(got.equals(Buffer.from(await keyStore.emailHash(email)))).toBe(false);
});
