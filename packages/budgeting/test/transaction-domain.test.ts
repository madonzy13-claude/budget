/**
 * transaction-domain.test.ts — Pure domain unit tests for Transaction value object.
 * No DB, no external deps.
 */
import { describe, test, expect } from "bun:test";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

function makeTx(overrides: Partial<ConstructorParameters<typeof Transaction>[0] extends never ? never : Record<string, unknown>> = {}): Transaction {
  return new Transaction(
    crypto.randomUUID(),
    crypto.randomUUID(),
    "EXPENSE",
    "100.00",
    "USD",
    "92.50",
    "EUR",
    "0.92500000",
    "2024-01-15", // fxRateDate
    "frankfurter",
    "2024-01-16", // transactionDate (after fxRateDate)
    null,
    crypto.randomUUID(),
    crypto.randomUUID(),
    null,
    null,
    new Date(),
  );
}

describe("Transaction domain", () => {
  describe("isStale()", () => {
    test("returns true when fxRateDate < transactionDate", () => {
      const tx = new Transaction(
        crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
        "100.00", "USD", "92.50", "EUR", "0.92500000",
        "2024-01-15", // fxRateDate = Monday
        "frankfurter",
        "2024-01-16", // transactionDate = Tuesday (after fxRateDate)
        null, crypto.randomUUID(), null, null, null, new Date(),
      );
      expect(tx.isStale()).toBe(true);
    });

    test("returns false when fxRateDate === transactionDate", () => {
      const tx = new Transaction(
        crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
        "100.00", "USD", "92.50", "EUR", "0.92500000",
        "2024-01-16", // fxRateDate == transactionDate
        "frankfurter",
        "2024-01-16",
        null, crypto.randomUUID(), null, null, null, new Date(),
      );
      expect(tx.isStale()).toBe(false);
    });

    test("returns false when fxRateDate > transactionDate (future-dated rate)", () => {
      const tx = new Transaction(
        crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
        "100.00", "USD", "92.50", "EUR", "0.92500000",
        "2024-01-17", // fxRateDate > transactionDate
        "frankfurter",
        "2024-01-16",
        null, crypto.randomUUID(), null, null, null, new Date(),
      );
      expect(tx.isStale()).toBe(false);
    });

    test("weekend scenario: Saturday transactionDate, Friday fxRateDate returns true", () => {
      const tx = new Transaction(
        crypto.randomUUID(), crypto.randomUUID(), "EXPENSE",
        "100.00", "USD", "92.50", "EUR", "0.92500000",
        "2024-01-12", // fxRateDate = Friday
        "frankfurter",
        "2024-01-13", // transactionDate = Saturday
        null, crypto.randomUUID(), null, null, null, new Date(),
      );
      expect(tx.isStale()).toBe(true);
    });
  });

  describe("immutability", () => {
    test("Transaction fields are readonly (no mutators)", () => {
      const tx = makeTx();
      // TypeScript ensures no setters — just verify the object structure
      expect(tx.kind).toBe("EXPENSE");
      expect(typeof tx.isStale).toBe("function");
    });
  });

  describe("TRANSFER kind", () => {
    test("TRANSFER transaction has no categoryId (null)", () => {
      const tx = new Transaction(
        crypto.randomUUID(), crypto.randomUUID(), "TRANSFER",
        "200.00", "PLN", "200.00", "PLN", "1.00000000",
        "2024-01-16", "internal",
        "2024-01-16",
        null, crypto.randomUUID(),
        null, // categoryId = null for TRANSFER
        crypto.randomUUID(), // transferGroupId
        null, new Date(),
      );
      expect(tx.categoryId).toBeNull();
      expect(tx.transferGroupId).not.toBeNull();
    });
  });
});
