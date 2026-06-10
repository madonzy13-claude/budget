import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { DrizzleUserRepo } from "../src/adapters/persistence/user-repo";
import { signUp } from "../src/application/sign-up";
import { updateProviderPrefs } from "../src/application/update-provider-prefs";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

test("updateProviderPrefs sets preferred_llm_provider", async () => {
  const email = `prefs-llm-${Date.now()}@example.com`;
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
      name: "LLM Prefs Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    await updateProviderPrefs({ userRepo: repo }, UserId(r.value.userId), {
      llm: "claude_haiku",
    });
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.preferred_llm_provider).toBe("claude_haiku");
    expect(user?.preferred_stt_provider).toBeNull();
  }
});

test("updateProviderPrefs sets preferred_stt_provider independently", async () => {
  const email = `prefs-stt-${Date.now()}@example.com`;
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
      name: "STT Prefs Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    await updateProviderPrefs({ userRepo: repo }, UserId(r.value.userId), {
      stt: "groq",
    });
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.preferred_stt_provider).toBe("groq");
  }
});

test("updateProviderPrefs round-trips both providers", async () => {
  const email = `prefs-both-${Date.now()}@example.com`;
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
      name: "Both Prefs Tester",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(r.isOk()).toBe(true);
  if (r.isOk()) {
    const repo = new DrizzleUserRepo();
    await updateProviderPrefs({ userRepo: repo }, UserId(r.value.userId), {
      llm: "groq",
      stt: "browser",
    });
    const user = await repo.findById(UserId(r.value.userId));
    expect(user?.preferred_llm_provider).toBe("groq");
    expect(user?.preferred_stt_provider).toBe("browser");
  }
});
