/**
 * ledger/fx.test.ts — FX-related ledger tests.
 * Weekend scenario: Saturday transactionDate, Friday fxRateDate → isStale=true.
 */
import { describe, test, expect } from "bun:test";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

describe("Ledger FX tests", () => {
  test("weekend scenario: Saturday transaction with Friday FX rate is stale", () => {
    // Friday 2024-01-12, Saturday 2024-01-13
    const tx = new Transaction(
      crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
      "100.00", "USD", "92.50", "EUR", "0.92500000",
      "2024-01-12", // fxRateDate = Friday
      "frankfurter",
      "2024-01-13", // transactionDate = Saturday (markets closed, rate is from Friday)
      null, crypto.randomUUID(), null, null, null, new Date(),
    );

    expect(tx.isStale()).toBe(true);
    expect(tx.fxRateDate).toBe("2024-01-12");
    expect(tx.transactionDate).toBe("2024-01-13");
  });

  test("same-day rate is not stale", () => {
    const tx = new Transaction(
      crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
      "100.00", "USD", "92.50", "EUR", "0.92500000",
      "2024-01-15", // fxRateDate == transactionDate
      "frankfurter",
      "2024-01-15",
      null, crypto.randomUUID(), null, null, null, new Date(),
    );
    expect(tx.isStale()).toBe(false);
  });

  test("Monday transaction with prior Friday rate is stale", () => {
    const tx = new Transaction(
      crypto.randomUUID(), crypto.randomUUID(), "INCOME",
      "500.00", "GBP", "590.00", "EUR", "1.18000000",
      "2024-01-12", // Friday
      "frankfurter",
      "2024-01-15", // Monday
      null, crypto.randomUUID(), null, null, null, new Date(),
    );
    expect(tx.isStale()).toBe(true);
  });
});
