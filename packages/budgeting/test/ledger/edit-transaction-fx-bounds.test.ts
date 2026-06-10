/**
 * edit-transaction-fx-bounds.test.ts — T-02-01 mitigation unit test.
 *
 * The PATCH re-FX path in `edit-transaction.ts` must reject FX rates outside
 * `0 < rate < 1e6` before persisting (mirrors create-transaction.ts:101-103).
 *
 * Threat: a corrupt or stale FX provider response could persist a 0/NaN/huge
 * rate and corrupt amount_converted_cents.
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

function makeOriginal(): TransactionRow {
  return {
    id: TX_ID,
    tenantId: TENANT_ID,
    budgetId: BUDGET_ID,
    categoryId: "55555555-5555-5555-5555-555555555555",
    date: "2026-05-01",
    amountOriginalCents: "10000",
    currencyOriginal: "USD",
    amountConvertedCents: "10000",
    fxRate: "1",
    fxAsOf: "2026-05-01",
    note: null,
    recurringRuleId: null,
    confirmedAt: new Date(),
    kind: "SPENDING",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as TransactionRow;
}

function buildDeps(rateFromProvider: string): {
  deps: EditTransactionDeps;
  updates: Array<Record<string, unknown>>;
} {
  const updates: Array<Record<string, unknown>> = [];
  const original = makeOriginal();

  const repo = {
    findById: async () => original,
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
      rateAsOf: async () => ({
        rate: rateFromProvider,
        provider: "stub",
        isStale: false,
      }),
    },
    getBudgetCurrency: async () => "USD",
  };

  return { deps, updates };
}

const baseInput: EditTransactionInput = {
  transactionId: TX_ID,
  tenantId: TENANT_ID,
  actorUserId: USER_ID,
  fields: { currencyOriginal: "EUR" }, // currency change → triggers FX path
};

describe("edit-transaction T-02-01 FX rate bounds", () => {
  test("rejects rate = 0", async () => {
    const { deps, updates } = buildDeps("0");
    const result = await editTransaction(deps)(baseInput);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/out of bounds/i);
    }
    expect(updates.length).toBe(0); // never persisted
  });

  test("rejects negative rate", async () => {
    const { deps, updates } = buildDeps("-0.5");
    const result = await editTransaction(deps)(baseInput);

    expect(result.isErr()).toBe(true);
    expect(updates.length).toBe(0);
  });

  test("rejects rate >= 1e6", async () => {
    const { deps, updates } = buildDeps("1000000");
    const result = await editTransaction(deps)(baseInput);

    expect(result.isErr()).toBe(true);
    expect(updates.length).toBe(0);
  });

  test("rejects NaN rate", async () => {
    const { deps, updates } = buildDeps("not-a-number");
    const result = await editTransaction(deps)(baseInput);

    expect(result.isErr()).toBe(true);
    expect(updates.length).toBe(0);
  });

  test("accepts rate within bounds (0.85) and locks the row to budget currency", async () => {
    const { deps, updates } = buildDeps("0.85");
    const result = await editTransaction(deps)(baseInput);

    expect(result.isOk()).toBe(true);
    expect(updates.length).toBe(1);
    // UAT-Phase6-Test7 retest #5: post-edit the row reads as a
    // budget-currency row (USD in this test). The user-chosen "EUR"
    // is consumed only to compute the converted amount; the persisted
    // shape carries the budget currency + an identity FX rate.
    expect(updates[0]?.currencyOriginal).toBe("USD");
    expect(updates[0]?.fxRate).toBe("1");
    expect(updates[0]?.amountOriginalCents).toBe("8500"); // 10000 * 0.85
    expect(updates[0]?.amountConvertedCents).toBe("8500");
  });
});
