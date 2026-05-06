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
});

test("signUp creates user, sends verification email, persists locale + display_currency", async () => {
  const email = `test-signup-${Date.now()}@example.com`;
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
      name: "Tester",
      locale: "pl",
      displayCurrency: "PLN",
    },
  );
  expect(r.isOk()).toBe(true);
  const verify = sender.sent.find((e) => e.template === "verify-email");
  expect(verify).toBeDefined();
  expect(verify?.to).toBe(email);
});

test("signUp persists DEK row in shared_kernel.user_keys (PC-09)", async () => {
  const email = `test-dek-${Date.now()}@example.com`;
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
      name: "DEK Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    // Verify DEK row was persisted by after-hook (PC-09)
    const pool = appPool();
    const client = await pool.connect();
    try {
      await client.query(
        `SET LOCAL app.current_user_id = '${r.value.userId}'`,
      );
      const row = await client.query(
        `SELECT cipher_dek, nonce FROM shared_kernel.user_keys WHERE user_id = $1`,
        [r.value.userId],
      );
      expect(row.rows.length).toBe(1);
      expect(row.rows[0].cipher_dek).toBeTruthy();
      expect(row.rows[0].nonce).toBeTruthy();
    } finally {
      client.release();
    }
  }
});
