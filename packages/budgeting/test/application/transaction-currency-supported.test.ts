/**
 * transaction-currency-supported.test.ts — review WR-03. A transaction in a
 * currency outside the supported set could be stored whenever write-time FX
 * happened to succeed; after a later budget or category currency change with
 * no history for that pair, fx_convert returned NULL and the payment silently
 * fell out of every total. Same rule as budgets and categories: refuse it.
 */
import { describe, test, expect } from "bun:test";
import { createTransaction, CurrencyNotSupportedError } from "../../src/application/create-transaction";
import { editTransaction } from "../../src/application/edit-transaction";

const fx = { rateAsOf: async () => ({ rate: "1", provider: "t", isStale: false }) };

describe("Transaction currency", () => {
  test("create refuses a currency outside the supported set", async () => {
    const r = await createTransaction({
      transactionRepo: { create: async () => { throw new Error("must not write"); } } as never,
      fxProvider: fx,
      getBudgetCurrency: async () => "PLN",
    })({
      date: "2026-11-04", categoryId: "c", amountOriginalCents: 500, currencyOriginal: "JPY",
      budgetId: "b", tenantId: "b", actorUserId: "u",
    } as never);
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr()).toBeInstanceOf(CurrencyNotSupportedError);
  });

  test("edit refuses switching to one", async () => {
    const r = await editTransaction({
      transactionRepo: {
        findById: async () => ({
          id: "t1", budgetId: "b", currencyOriginal: "PLN", date: "2026-11-04",
          amountOriginalCents: "500", categoryId: "c", kind: "SPENDING",
        }),
        update: async () => { throw new Error("must not write"); },
      } as never,
      fxProvider: fx,
      getBudgetCurrency: async () => "PLN",
    })({ transactionId: "t1", tenantId: "b", actorUserId: "u", fields: { currencyOriginal: "JPY" } });
    expect(r.isErr()).toBe(true);
    expect(r._unsafeUnwrapErr()).toBeInstanceOf(CurrencyNotSupportedError);
  });
});
