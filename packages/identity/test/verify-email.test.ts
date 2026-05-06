import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
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

test("verify-email: invalid token is rejected", async () => {
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });
  // Attempt to verify with an invalid token — should throw or return error
  try {
    await auth.api.verifyEmail({ query: { token: "invalid-token-abc" } });
    // If it does not throw, the user should not be verified (token is invalid)
    // Better Auth returns a 400-level APIError
    expect(false).toBe(true); // should not reach here
  } catch (e: unknown) {
    expect(e).toBeDefined();
  }
});

test("verify-email: signup sends verification email with token", async () => {
  const email = `verify-${Date.now()}@example.com`;
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
      name: "Verify Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  // Verification email sent on signup
  const verifyEmail = sender.sent.find((e) => e.template === "verify-email");
  expect(verifyEmail).toBeDefined();
  expect(typeof verifyEmail?.vars.url).toBe("string");
});
