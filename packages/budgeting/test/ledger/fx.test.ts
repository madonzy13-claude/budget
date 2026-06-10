/**
 * ledger/fx.test.ts — FX-related ledger tests.
 * Weekend scenario: Saturday transactionDate, Friday fxAsOf → isStale=true.
 * Uses v1.1 Transaction constructor (fxAsOf, budgetId, categoryId, kind SPENDING|INCOME).
 */
import { describe, test, expect } from "bun:test";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

function makeTx(
  fxAsOf: string,
  date: string,
  kind: "SPENDING" | "INCOME" = "SPENDING",
): Transaction {
  return new Transaction(
    crypto.randomUUID(), // id
    crypto.randomUUID(), // tenantId
    crypto.randomUUID(), // budgetId
    crypto.randomUUID(), // categoryId
    date, // date (transaction date)
    "10000", // amountOriginalCents
    "USD", // currencyOriginal
    "9250", // amountConvertedCents
    "0.92500000", // fxRate
    fxAsOf, // fxAsOf
    null, // note
    null, // recurringRuleId
    new Date(), // confirmedAt
    kind, // kind
    new Date(), // createdAt
    new Date(), // updatedAt
    null, // deletedAt
  );
}

describe("Ledger FX tests", () => {
  test("weekend scenario: Saturday transaction with Friday FX rate is stale", () => {
    // Friday 2024-01-12, Saturday 2024-01-13
    const tx = makeTx("2024-01-12", "2024-01-13");

    expect(tx.isStale()).toBe(true);
    expect(tx.fxAsOf).toBe("2024-01-12");
    expect(tx.date).toBe("2024-01-13");
  });

  test("same-day rate is not stale", () => {
    const tx = makeTx("2024-01-15", "2024-01-15");
    expect(tx.isStale()).toBe(false);
  });

  test("Monday transaction with prior Friday rate is stale", () => {
    const tx = makeTx("2024-01-12", "2024-01-15", "INCOME");
    expect(tx.isStale()).toBe(true);
  });
});
