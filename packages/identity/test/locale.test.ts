import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { DrizzleUserRepo } from "../src/adapters/persistence/user-repo";
import { signUp } from "../src/application/sign-up";
import { updateLocale } from "../src/application/update-locale";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
});

test("signup with locale='pl' persists locale", async () => {
  const email = `locale-${Date.now()}@example.com`;
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
      name: "Locale Tester",
      locale: "pl",
      displayCurrency: "PLN",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    const user = await repo.findById(UserId(r.value.userId));
    expect(user).not.toBeNull();
    expect(user?.locale).toBe("pl");
  }
});

test("updateLocale persists new locale", async () => {
  const email = `locale-update-${Date.now()}@example.com`;
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
      name: "Locale Update Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    await updateLocale({ userRepo: repo }, UserId(r.value.userId), "uk");
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.locale).toBe("uk");
  }
});
