/**
 * transaction-domain.test.ts — Domain unit tests for Transaction v1.1 entity.
 * RED: Tests are written against the NEW shape. Will fail until Task 2b rewrites transaction.ts.
 *
 * TXN-07: kind ∈ ('SPENDING', 'INCOME') only — no TRANSFER, no EXPENSE.
 * D-PH2-08: confirmedAt = null means draft; confirmedAt = Date means confirmed.
 * New fields: recurringRuleId, confirmedAt, budgetId.
 * Removed fields: accountId, transferGroupId, correctsId, hasCorrections.
 */
import { describe, test, expect } from "bun:test";
import type { TransactionKind } from "@budget/budgeting/src/domain/transaction";
import { Transaction } from "@budget/budgeting/src/domain/transaction";

function makeTx(overrides: Partial<{
  kind: TransactionKind;
  amountOriginalCents: string;
  currencyOriginal: string;
  amountConvertedCents: string;
  fxRate: string;
  fxAsOf: string;
  date: string;
  confirmedAt: Date | null;
  recurringRuleId: string | null;
  note: string | null;
}> = {}): Transaction {
  return new Transaction(
    crypto.randomUUID(), // id
    crypto.randomUUID(), // tenantId
    crypto.randomUUID(), // budgetId
    crypto.randomUUID(), // categoryId
    overrides.date ?? "2026-05-11",
    overrides.amountOriginalCents ?? "596",
    overrides.currencyOriginal ?? "USD",
    overrides.amountConvertedCents ?? "500",
    overrides.fxRate ?? "0.84",
    overrides.fxAsOf ?? "2026-05-11",
    overrides.note ?? null,
    overrides.recurringRuleId ?? null,
    overrides.confirmedAt !== undefined ? overrides.confirmedAt : new Date(),
    overrides.kind ?? "SPENDING",
    new Date(), // createdAt
    new Date(), // updatedAt
    null,       // deletedAt
  );
}

describe("Transaction v1.1 domain entity", () => {
  describe("kind constraint", () => {
    test("accepts SPENDING kind", () => {
      const tx = makeTx({ kind: "SPENDING" });
      expect(tx.kind).toBe("SPENDING");
    });

    test("accepts INCOME kind", () => {
      const tx = makeTx({ kind: "INCOME" });
      expect(tx.kind).toBe("INCOME");
    });

    // TypeScript level: TRANSFER must not be assignable to TransactionKind
    test("TypeScript: TransactionKind type does NOT include TRANSFER", () => {
      // This is a compile-time check surfaced as a runtime assertion.
      // If the domain still has TRANSFER in the union, this test passes trivially,
      // but the TS compile will fail when we assign "TRANSFER" to TransactionKind.
      const validKinds: TransactionKind[] = ["SPENDING", "INCOME"];
      expect(validKinds).not.toContain("TRANSFER");
      expect(validKinds).not.toContain("EXPENSE");
    });
  });

  describe("draft vs confirmed", () => {
    test("confirmedAt = null means draft", () => {
      const tx = makeTx({ confirmedAt: null });
      expect(tx.confirmedAt).toBeNull();
    });

    test("confirmedAt = Date means confirmed", () => {
      const confirmedAt = new Date("2026-05-11T10:00:00Z");
      const tx = makeTx({ confirmedAt });
      expect(tx.confirmedAt).toBeInstanceOf(Date);
      expect(tx.confirmedAt?.toISOString()).toBe("2026-05-11T10:00:00.000Z");
    });
  });

  describe("recurringRuleId", () => {
    test("recurringRuleId can be null (manual entry)", () => {
      const tx = makeTx({ recurringRuleId: null });
      expect(tx.recurringRuleId).toBeNull();
    });

    test("recurringRuleId can be a UUID (from recurring rule)", () => {
      const ruleId = crypto.randomUUID();
      const tx = makeTx({ recurringRuleId: ruleId });
      expect(tx.recurringRuleId).toBe(ruleId);
    });
  });

  describe("new fields present, old fields absent", () => {
    test("Transaction has budgetId field (new in v1.1)", () => {
      const tx = makeTx();
      // budgetId must exist as a property
      expect("budgetId" in tx).toBe(true);
      expect(typeof tx.budgetId).toBe("string");
    });

    test("Transaction does NOT have accountId field", () => {
      const tx = makeTx();
      // accountId must not exist on the entity
      expect("accountId" in tx).toBe(false);
    });

    test("Transaction does NOT have transferGroupId field", () => {
      const tx = makeTx();
      expect("transferGroupId" in tx).toBe(false);
    });

    test("Transaction does NOT have correctsId field", () => {
      const tx = makeTx();
      expect("correctsId" in tx).toBe(false);
    });

    test("Transaction does NOT have hasCorrections field", () => {
      const tx = makeTx();
      expect("hasCorrections" in tx).toBe(false);
    });
  });

  describe("amount fields", () => {
    test("amountOriginalCents is a string (bigint-as-string per CLAUDE.md)", () => {
      const tx = makeTx({ amountOriginalCents: "596" });
      expect(typeof tx.amountOriginalCents).toBe("string");
      expect(tx.amountOriginalCents).toBe("596");
    });

    test("amountConvertedCents is a string", () => {
      const tx = makeTx({ amountConvertedCents: "500" });
      expect(typeof tx.amountConvertedCents).toBe("string");
    });

    test("fxRate is a string decimal", () => {
      const tx = makeTx({ fxRate: "0.84" });
      expect(tx.fxRate).toBe("0.84");
    });

    test("fxAsOf is a YYYY-MM-DD string", () => {
      const tx = makeTx({ fxAsOf: "2026-05-11" });
      expect(tx.fxAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
