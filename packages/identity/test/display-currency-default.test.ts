/**
 * display-currency-default.test.ts — Phase 10 UAT gap
 *
 * Requirement: the global display currency must DEFAULT to the currency of the
 * user's first budget (written at budget creation), and stay USD/unset until
 * then — but only when the user has not already chosen one.
 *
 * Mechanism under test:
 *  - A fresh signup leaves display_currency NULL (no hard-coded "USD" default).
 *  - findById coalesces NULL -> "USD" so the UserDTO contract stays a string.
 *  - setDisplayCurrencyIfUnset(id, ccy) writes the currency ONLY when the column
 *    is still NULL (untouched) — it never clobbers a deliberate choice. This is
 *    what the budget-create route calls so the first budget seeds the default.
 *
 * Real Postgres (no mocking) per the project's integration-test rule.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender, UserId } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withUserContext } from "@budget/platform";
import { createAuth } from "../src/adapters/persistence/better-auth";
import { DrizzleUserRepo } from "../src/adapters/persistence/user-repo";

const KEK = "A".repeat(43) + "=";

beforeAll(async () => {
  process.env.BUDGET_KEK = KEK;
  process.env.BETTER_AUTH_SECRET = "test-secret-xxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.APP_URL = "http://localhost:3000";
  await startTestcontainer();
}, 120_000);

function newAuth() {
  const keyStore = new LibsodiumKeyStore(KEK);
  return createAuth({ emailSender: new StdoutEmailSender(), keyStore });
}

/** Sign up the way the web form does — WITHOUT a displayCurrency. */
async function signUpNoCurrency(auth: ReturnType<typeof createAuth>) {
  const email = `dcc-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const r = await auth.api.signUpEmail({
    body: { email, password: "changeme1234", name: "DCC Tester", locale: "en" },
  });
  return (r as { user: { id: string } }).user.id;
}

async function readDisplayCurrency(userId: string): Promise<string | null> {
  const r = await withUserContext(UserId(userId), async (tx) => {
    const res = await tx.execute(
      sql`SELECT display_currency FROM identity.users WHERE id = ${userId}::uuid`,
    );
    return (
      (res as unknown as { rows: Array<{ display_currency: string | null }> })
        .rows[0]?.display_currency ?? null
    );
  });
  if (r.isErr()) throw r.error;
  return r.value;
}

test("a fresh signup leaves display_currency NULL (no hard-coded USD default)", async () => {
  const userId = await signUpNoCurrency(newAuth());
  expect(await readDisplayCurrency(userId)).toBeNull();
});

test("findById coalesces a NULL display_currency to USD (DTO stays a string)", async () => {
  const repo = new DrizzleUserRepo();
  const userId = await signUpNoCurrency(newAuth());
  const dto = await repo.findById(UserId(userId));
  expect(dto?.display_currency).toBe("USD");
});

test("setDisplayCurrencyIfUnset seeds the currency when display_currency is NULL", async () => {
  const repo = new DrizzleUserRepo();
  const userId = await signUpNoCurrency(newAuth());
  await repo.setDisplayCurrencyIfUnset(UserId(userId), "EUR");
  expect(await readDisplayCurrency(userId)).toBe("EUR");
});

test("setDisplayCurrencyIfUnset NEVER overwrites an already-set currency", async () => {
  const repo = new DrizzleUserRepo();
  const userId = await signUpNoCurrency(newAuth());
  // First budget seeds EUR.
  await repo.setDisplayCurrencyIfUnset(UserId(userId), "EUR");
  // A later (second) budget in USD must NOT change the global display currency.
  await repo.setDisplayCurrencyIfUnset(UserId(userId), "USD");
  expect(await readDisplayCurrency(userId)).toBe("EUR");
});

test("setDisplayCurrencyIfUnset respects a deliberate manual choice", async () => {
  const repo = new DrizzleUserRepo();
  const userId = await signUpNoCurrency(newAuth());
  // User opens settings and picks GBP BEFORE creating any budget.
  await repo.updateDisplayCurrency(UserId(userId), "GBP");
  // Creating a EUR first budget must not clobber their choice.
  await repo.setDisplayCurrencyIfUnset(UserId(userId), "EUR");
  expect(await readDisplayCurrency(userId)).toBe("GBP");
});
