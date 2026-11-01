/**
 * edit-transaction-currency-lock.test.ts — UAT-Phase6-Test7 retest #5.
 *
 * After a user changes a transaction's currency to a value that differs
 * from the budget's default, the persisted row should LOCK to the
 * budget currency: `currencyOriginal` becomes the budget currency and
 * `amountOriginalCents` becomes the converted value. The row reads as
 * "this is a budget-currency transaction" — the original-currency
 * detail isn't preserved (intentional UX trade-off the user asked for).
 *
 * Prior behavior left `currencyOriginal` set to the user's new (non-
 * budget) selection and only converted `amountConvertedCents` — the
 * grid then showed the converted amount alongside the foreign code,
 * which the user found confusing.
 */
import { describe, test, expect } from "bun:test";
import {
  editTransaction,
  type EditTransactionDeps,
  type EditTransactionInput,
} from "@budget/budgeting/src/application/edit-transaction";
import type {
  TransactionRepo,
  TransactionRow,
} from "@budget/budgeting/src/ports/transaction-repo";

const TX_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const BUDGET_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "44444444-4444-4444-4444-444444444444";

function makeOriginal(currency = "USD"): TransactionRow {
  return {
    id: TX_ID,
    tenantId: TENANT_ID,
    budgetId: BUDGET_ID,
    categoryId: "55555555-5555-5555-5555-555555555555",
    date: "2026-05-01",
    amountOriginalCents: "10000",
    currencyOriginal: currency,
    amountConvertedCents: "10000",
    fxRate: "1",
    fxAsOf: "2026-05-01",
    note: null,
    scheduledPaymentId: null,
    confirmedAt: new Date(),
    kind: "SPENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as TransactionRow;
}

function buildDeps(
  budgetCurrency: string,
  rate: string,
  originalCurrency = "USD",
): {
  deps: EditTransactionDeps;
  updates: Array<Record<string, unknown>>;
} {
  const updates: Array<Record<string, unknown>> = [];
  const original = makeOriginal(originalCurrency);

  const repo = {
    findById: async () => ({
      ...original,
      // Subsequent findById (after update) reflects the persisted patch
      // by merging the most recent updateInPlace payload onto original.
      ...(updates[updates.length - 1] ?? {}),
    }),
    updateInPlace: async (
      _id: string,
      fields: Record<string, unknown>,
    ): Promise<void> => {
      updates.push(fields);
    },
    insert: async () => {},
    softDelete: async () => {},
    insertCorrection: async () => {
      throw new Error("unused");
    },
  } as unknown as TransactionRepo;

  const deps: EditTransactionDeps = {
    transactionRepo: repo,
    fxProvider: {
      rateAsOf: async () => ({ rate, provider: "stub", isStale: false }),
    },
    getBudgetCurrency: async () => budgetCurrency,
  };

  return { deps, updates };
}

describe("edit-transaction keeps the chosen currency (R6, user — was the UAT-Phase6-Test7 lock)", () => {
  test("EUR budget + user changes currency USD → PLN: row stays PLN, converted at the date's rate", async () => {
    // R6 (user): a spending in another currency shows in that currency with
    // the budget-currency figure underneath — so the row keeps PLN and its
    // own amount, and the converted figure + rate follow the date.
    const { deps, updates } = buildDeps("EUR", "0.21", "USD");
    const input: EditTransactionInput = {
      transactionId: TX_ID,
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      fields: { currencyOriginal: "PLN" },
    };
    const result = await editTransaction(deps)(input);
    expect(result.isOk()).toBe(true);
    expect(updates.length).toBe(1);
    const patch = updates[0]!;
    expect(patch.currencyOriginal).toBe("PLN");
    expect(patch.amountOriginalCents).toBe("10000");
    expect(patch.amountConvertedCents).toBe("2100");
    expect(patch.fxRate).toBe("0.21");
  });

  test("EUR budget + user picks EUR (same as budget): rate=1, no conversion", async () => {
    const { deps, updates } = buildDeps("EUR", "1", "USD");
    const input: EditTransactionInput = {
      transactionId: TX_ID,
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      fields: { currencyOriginal: "EUR" },
    };
    const result = await editTransaction(deps)(input);
    expect(result.isOk()).toBe(true);
    expect(updates.length).toBe(1);
    expect(updates[0]!.currencyOriginal).toBe("EUR");
    expect(updates[0]!.fxRate).toBe("1");
  });
});
