import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { DrizzleUserRepo } from "../src/adapters/persistence/user-repo";
import { signUp } from "../src/application/sign-up";
import { updateDisplayCurrency } from "../src/application/update-display-currency";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

test("user.display_currency is independent of workspace, defaults to USD", async () => {
  const email = `currency-${Date.now()}@example.com`;
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
      name: "Currency Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.display_currency).toBe("USD");
  }
});

test("user with display_currency='EUR' has EUR even with no workspaces", async () => {
  const email = `currency-eur-${Date.now()}@example.com`;
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
      name: "EUR Tester",
      locale: "en",
      displayCurrency: "EUR",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.display_currency).toBe("EUR");
  }
});

test("updateDisplayCurrency persists new currency", async () => {
  const email = `currency-update-${Date.now()}@example.com`;
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
      name: "Update Currency Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    await updateDisplayCurrency(
      { userRepo: repo },
      UserId(r.value.userId),
      "GBP",
    );
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.display_currency).toBe("GBP");
  }
});
