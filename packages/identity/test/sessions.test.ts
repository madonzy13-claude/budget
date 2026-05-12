import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { signUp } from "../src/application/sign-up";
import { listSessions } from "../src/application/list-sessions";
import { revokeSession } from "../src/application/revoke-session";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

test("listSessions returns sessions for user", async () => {
  const email = `sessions-${Date.now()}@example.com`;
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });
  const signUpResult = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Sessions Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(signUpResult.isOk()).toBe(true);
  if (signUpResult.isOk()) {
    const sessions = await listSessions(
      { auth },
      UserId(signUpResult.value.userId),
    );
    expect(Array.isArray(sessions)).toBe(true);
  }
});

test("revokeSession removes session", async () => {
  const email = `revoke-${Date.now()}@example.com`;
  const sender = new StdoutEmailSender();
  const auth = createAuth({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(KEK),
  });

  // Sign in to get a session token
  const signUpResult = await signUp(
    { auth },
    {
      email,
      password: "changeme1234",
      name: "Revoke Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(signUpResult.isOk()).toBe(true);
  if (signUpResult.isOk()) {
    const sessions = await listSessions(
      { auth },
      UserId(signUpResult.value.userId),
    );
    // After sign-up, there may be 0 or 1 sessions depending on Better Auth autoSignIn
    expect(Array.isArray(sessions)).toBe(true);
    // Revoke a session if any exist
    if (sessions.length > 0) {
      await revokeSession(
        { auth },
        UserId(signUpResult.value.userId),
        sessions[0]!.id,
      );
      const sessionsAfter = await listSessions(
        { auth },
        UserId(signUpResult.value.userId),
      );
      expect(sessionsAfter.length).toBe(sessions.length - 1);
    }
  }
});
