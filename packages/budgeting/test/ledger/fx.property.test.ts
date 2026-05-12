/**
 * ledger/fx.property.test.ts — Property-based tests for Transaction.isStale().
 * Uses fast-check to generate random (fxAsOf, date) pairs.
 * Uses v1.1 Transaction constructor.
 */
import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

function makeIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function makeTx(fxAsOf: string, date: string): Transaction {
  return new Transaction(
    crypto.randomUUID(), // id
    crypto.randomUUID(), // tenantId
    crypto.randomUUID(), // budgetId
    crypto.randomUUID(), // categoryId
    date, // date
    "10000", // amountOriginalCents
    "USD", // currencyOriginal
    "9250", // amountConvertedCents
    "0.92500000", // fxRate
    fxAsOf, // fxAsOf
    null, // note
    null, // recurringRuleId
    new Date(), // confirmedAt
    "SPENDING", // kind
    new Date(), // createdAt
    new Date(), // updatedAt
    null, // deletedAt
  );
}

describe("Transaction.isStale() property tests", () => {
  test("isStale() === (fxAsOf < date) for any date pair", () => {
    fc.assert(
      fc.property(
        // Generate two random dates in 2020-2030
        fc.record({
          fxYear: fc.integer({ min: 2020, max: 2030 }),
          fxMonth: fc.integer({ min: 1, max: 12 }),
          fxDay: fc.integer({ min: 1, max: 28 }),
          txYear: fc.integer({ min: 2020, max: 2030 }),
          txMonth: fc.integer({ min: 1, max: 12 }),
          txDay: fc.integer({ min: 1, max: 28 }),
        }),
        ({ fxYear, fxMonth, fxDay, txYear, txMonth, txDay }) => {
          const fxAsOf = makeIsoDate(fxYear, fxMonth, fxDay);
          const transactionDate = makeIsoDate(txYear, txMonth, txDay);

          const tx = makeTx(fxAsOf, transactionDate);

          const expectedStale = fxAsOf < transactionDate;
          expect(tx.isStale()).toBe(expectedStale);
        },
      ),
      { numRuns: 200 },
    );
  });

  test("same fxAsOf and date is never stale", () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
        }),
        ({ year, month, day }) => {
          const date = makeIsoDate(year, month, day);
          const tx = makeTx(date, date);
          expect(tx.isStale()).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
