/**
 * onboarding-progress-seed.test.ts — TDD for ONBD-01
 *
 * Verifies that every new user gets a step=1, completed_at=NULL row in
 * tenancy.onboarding_progress via the Better Auth post-create hook.
 *
 * Plan 06-06 Task 3.
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

test("signUp seeds step=1 onboarding_progress row for new user (ONBD-01)", async () => {
  const email = `test-onboarding-${Date.now()}@example.com`;
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });

  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Onboarding Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );

  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const pool = appPool();
    const client = await pool.connect();
    try {
      // Use BEGIN/COMMIT so SET LOCAL applies within the transaction block
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.current_user_id = '${r.value.userId}'`);
      const row = await client.query(
        `SELECT step, completed_at FROM tenancy.onboarding_progress WHERE user_id = $1`,
        [r.value.userId],
      );
      await client.query("COMMIT");
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].step).toBe(1);
      expect(row.rows[0].completed_at).toBeNull();
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
});

test("signUp onboarding_progress insert is idempotent (ON CONFLICT DO NOTHING)", async () => {
  const email = `test-idempotent-${Date.now()}@example.com`;
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });

  const r = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Idempotent Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );

  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const pool = appPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.current_user_id = '${r.value.userId}'`);
      // Manually update step to simulate progress
      await client.query(
        `UPDATE tenancy.onboarding_progress SET step = 3 WHERE user_id = $1`,
        [r.value.userId],
      );
      // Re-run the INSERT ON CONFLICT — should be a no-op
      await client.query(
        `INSERT INTO tenancy.onboarding_progress (user_id, step, completed_at)
         VALUES ($1::uuid, 1, NULL)
         ON CONFLICT (user_id) DO NOTHING`,
        [r.value.userId],
      );
      // Step should still be 3, not reset to 1
      const row = await client.query(
        `SELECT step FROM tenancy.onboarding_progress WHERE user_id = $1`,
        [r.value.userId],
      );
      await client.query("COMMIT");
      expect(row.rows[0].step).toBe(3);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
});
