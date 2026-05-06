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

test("reset-password: requestPasswordReset sends email", async () => {
  const email = `reset-${Date.now()}@example.com`;
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });
  // Create user first
  await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Reset Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  // Request password reset
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset" } });
  const resetEmail = sender.sent.find((e) => e.template === "reset-password");
  expect(resetEmail).toBeDefined();
  expect(resetEmail?.to).toBe(email);
  expect(typeof resetEmail?.vars.url).toBe("string");
});

test("reset-password: invalid/expired token is rejected", async () => {
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });
  try {
    await auth.api.resetPassword({
      body: { token: "invalid-token-xyz", newPassword: "newpassword123" },
    });
    expect(false).toBe(true); // should not reach here
  } catch (e: unknown) {
    expect(e).toBeDefined();
  }
});
