/**
 * ledger/fx.property.test.ts — Property-based tests for Transaction.isStale().
 * Uses fast-check to generate random (fxRateDate, transactionDate) pairs.
 */
import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

function makeIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

describe("Transaction.isStale() property tests", () => {
  test("isStale() === (fxRateDate < transactionDate) for any date pair", () => {
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
          const fxRateDate = makeIsoDate(fxYear, fxMonth, fxDay);
          const transactionDate = makeIsoDate(txYear, txMonth, txDay);

          const tx = new Transaction(
            crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
            "100.00", "USD", "92.50", "EUR", "0.92500000",
            fxRateDate,
            "frankfurter",
            transactionDate,
            null, crypto.randomUUID(), null, null, null, new Date(),
          );

          const expectedStale = fxRateDate < transactionDate;
          expect(tx.isStale()).toBe(expectedStale);
        },
      ),
      { numRuns: 200 },
    );
  });

  test("same fxRateDate and transactionDate is never stale", () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
        }),
        ({ year, month, day }) => {
          const date = makeIsoDate(year, month, day);
          const tx = new Transaction(
            crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
            "100.00", "USD", "92.50", "EUR", "0.92500000",
            date, "frankfurter", date,
            null, crypto.randomUUID(), null, null, null, new Date(),
          );
          expect(tx.isStale()).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
