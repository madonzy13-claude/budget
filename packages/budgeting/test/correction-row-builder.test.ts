/**
 * correction-row-builder.test.ts — Unit tests for domain correction-row builder.
 * Pure domain tests — no Drizzle, no DB.
 * TDD RED: these tests fail until correction.ts is implemented.
 */
import { describe, test, expect } from "bun:test";
import { buildCorrectionRow, computeDiff } from "@budget/budgeting/src/domain/correction";
import type { TransactionRow } from "@budget/budgeting/src/ports/transaction-repo";

const baseRow: TransactionRow = {
  id: "00000000-0000-0000-0000-000000000001",
  tenantId: "00000000-0000-0000-0000-000000000002",
  kind: "EXPENSE",
  amountOrig: "100.00",
  currencyOrig: "USD",
  amountDefault: "92.50",
  currencyDefault: "EUR",
  fxRate: "0.9250",
  fxRateDate: "2026-05-08",
  fxProvider: "frankfurter",
  transactionDate: "2026-05-08",
  note: "Coffee",
  accountId: "00000000-0000-0000-0000-000000000003",
  categoryId: "00000000-0000-0000-0000-000000000004",
  transferGroupId: null,
  correctsId: null,
  balanceDeltaSign: -1,
};

describe("buildCorrectionRow", () => {
  test("sets new unique id different from original", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.id).not.toBe(baseRow.id);
    // UUID format check
    expect(corr.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("sets correctsId to original.id", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.correctsId).toBe(baseRow.id);
  });

  test("preserves tenant_id", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.tenantId).toBe(baseRow.tenantId);
  });

  test("preserves transfer_group_id (null)", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.transferGroupId).toBeNull();
  });

  test("preserves transfer_group_id (non-null for transfer leg)", () => {
    const transferRow: TransactionRow = {
      ...baseRow,
      kind: "TRANSFER",
      transferGroupId: "00000000-0000-0000-0000-000000000099",
    };
    const corr = buildCorrectionRow(transferRow, {}, "actor-1", new Date());
    expect(corr.transferGroupId).toBe("00000000-0000-0000-0000-000000000099");
  });

  test("preserves kind (immutable)", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.kind).toBe("EXPENSE");
  });

  test("preserves currencyDefault (workspace default, immutable)", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.currencyDefault).toBe("EUR");
  });

  test("applies changed amountOrig from edits", () => {
    const corr = buildCorrectionRow(baseRow, { amountOrig: "200.00" }, "actor-1", new Date());
    expect(corr.amountOrig).toBe("200.00");
  });

  test("carries forward unchanged fields when edits are empty", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.currencyOrig).toBe("USD");
    expect(corr.fxRate).toBe("0.9250");
    expect(corr.fxRateDate).toBe("2026-05-08");
    expect(corr.accountId).toBe(baseRow.accountId);
    expect(corr.note).toBe("Coffee");
    expect(corr.categoryId).toBe(baseRow.categoryId);
    expect(corr.transactionDate).toBe("2026-05-08");
    expect(corr.balanceDeltaSign).toBe(-1);
  });

  test("applies note change", () => {
    const corr = buildCorrectionRow(baseRow, { note: "Latte" }, "actor-1", new Date());
    expect(corr.note).toBe("Latte");
  });

  test("honors explicit null categoryId (transfer leg category change)", () => {
    const corr = buildCorrectionRow(baseRow, { categoryId: null }, "actor-1", new Date());
    expect(corr.categoryId).toBeNull();
  });

  test("honors explicit null note", () => {
    const corr = buildCorrectionRow(baseRow, { note: null }, "actor-1", new Date());
    expect(corr.note).toBeNull();
  });

  test("does not change categoryId when not in edits (undefined)", () => {
    const corr = buildCorrectionRow(baseRow, {}, "actor-1", new Date());
    expect(corr.categoryId).toBe(baseRow.categoryId);
  });

  test("correction row correctsId points to original.id", () => {
    // The correction row's correctsId points to original.id
    const corr = buildCorrectionRow(baseRow, {}, "actor-1");
    expect(corr.correctsId).toBe(baseRow.id);
  });

  test("applies FX fields when provided", () => {
    const corr = buildCorrectionRow(
      baseRow,
      { amountDefault: "85.00", fxRate: "0.8500", fxRateDate: "2026-05-10", fxProvider: "frankfurter" },
      "actor-1",
      new Date(),
    );
    expect(corr.amountDefault).toBe("85.00");
    expect(corr.fxRate).toBe("0.8500");
    expect(corr.fxRateDate).toBe("2026-05-10");
    expect(corr.fxProvider).toBe("frankfurter");
  });
});

describe("computeDiff", () => {
  test("returns empty diff when no edits", () => {
    const diff = computeDiff(baseRow, {});
    expect(Object.keys(diff)).toHaveLength(0);
  });

  test("returns only changed keys", () => {
    const diff = computeDiff(baseRow, { amountOrig: "200.00" });
    expect(Object.keys(diff)).toEqual(["amountOrig"]);
    expect(diff.amountOrig).toEqual({ before: "100.00", after: "200.00" });
  });

  test("includes note change", () => {
    const diff = computeDiff(baseRow, { note: "Latte" });
    expect(diff.note).toEqual({ before: "Coffee", after: "Latte" });
  });

  test("includes categoryId null change", () => {
    const diff = computeDiff(baseRow, { categoryId: null });
    expect(diff.categoryId).toEqual({ before: baseRow.categoryId, after: null });
  });

  test("does not include unchanged fields", () => {
    const diff = computeDiff(baseRow, { amountOrig: "100.00" }); // same value
    // Same value = no change
    expect(Object.keys(diff)).toHaveLength(0);
  });

  test("includes multiple changed fields", () => {
    const diff = computeDiff(baseRow, { amountOrig: "150.00", note: "Tea" });
    expect(Object.keys(diff)).toHaveLength(2);
    expect(diff.amountOrig).toEqual({ before: "100.00", after: "150.00" });
    expect(diff.note).toEqual({ before: "Coffee", after: "Tea" });
  });
});
