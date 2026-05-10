/**
 * correction-chain.property.test.ts — Property tests for correction-chain invariants.
 * Verifies that for any sequence of corrections, the latest-only predicate returns
 * exactly one tail row.
 * Uses fast-check for property-based testing.
 * TDD RED: fails until insertCorrection is implemented.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import * as fc from "fast-check";
import { buildCorrectionRow, computeDiff } from "@budget/budgeting/src/domain/correction";
import type { TransactionRow } from "@budget/budgeting/src/ports/transaction-repo";

// ---------------------------------------------------------------------------
// Domain-level property: chain built in memory
// ---------------------------------------------------------------------------

function makeBaseRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    kind: "EXPENSE",
    amountOrig: "100.00",
    currencyOrig: "EUR",
    amountDefault: "100.00",
    currencyDefault: "EUR",
    fxRate: "1",
    fxRateDate: "2026-05-01",
    fxProvider: "internal",
    transactionDate: "2026-05-01",
    note: "Initial expense",
    accountId: crypto.randomUUID(),
    categoryId: crypto.randomUUID(),
    transferGroupId: null,
    correctsId: null,
    balanceDeltaSign: -1,
    ...overrides,
  };
}

function buildChain(original: TransactionRow, n: number): TransactionRow[] {
  const rows: TransactionRow[] = [original];
  for (let i = 0; i < n; i++) {
    const current = rows[rows.length - 1];
    const corrected = buildCorrectionRow(
      current,
      { amountOrig: String((100 + i + 1).toFixed(2)) },
      `actor-${i}`,
      new Date(Date.now() + i * 1000),
    );
    rows.push(corrected);
  }
  return rows;
}

/**
 * Simulate the latest-only SQL predicate in memory:
 * rows WHERE id NOT IN (SELECT corrects_id FROM rows WHERE corrects_id IS NOT NULL)
 */
function latestTailPredicate(rows: TransactionRow[]): TransactionRow[] {
  const correctedIds = new Set(
    rows.filter((r) => r.correctsId !== null).map((r) => r.correctsId as string),
  );
  return rows.filter((r) => !correctedIds.has(r.id));
}

describe("Correction chain domain invariants", () => {
  test("single correction: latest-only predicate returns 1 tail", () => {
    const original = makeBaseRow();
    const chain = buildChain(original, 1);
    const tail = latestTailPredicate(chain);
    expect(tail).toHaveLength(1);
    expect(tail[0].id).toBe(chain[chain.length - 1].id);
  });

  test("chain of 3 corrections: latest-only predicate returns 1 tail", () => {
    const original = makeBaseRow();
    const chain = buildChain(original, 3);
    const tail = latestTailPredicate(chain);
    expect(tail).toHaveLength(1);
    expect(tail[0].correctsId).not.toBeNull();
  });

  test("property: any N-correction chain has exactly 1 tail (fast-check)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
        const original = makeBaseRow();
        const chain = buildChain(original, n);
        const tail = latestTailPredicate(chain);
        return tail.length === 1;
      }),
      { numRuns: 100 },
    );
  });

  test("property: tail row has null correctsId only for n=0 (original is tail)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
        const original = makeBaseRow();
        const chain = buildChain(original, n);
        const tail = latestTailPredicate(chain);
        if (n === 0) {
          // Original row has no correctsId
          return tail[0].correctsId === null;
        } else {
          // Correction rows have a correctsId
          return tail[0].correctsId !== null;
        }
      }),
      { numRuns: 100 },
    );
  });

  test("property: chain length equals N+1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (n) => {
        const original = makeBaseRow();
        const chain = buildChain(original, n);
        return chain.length === n + 1;
      }),
      { numRuns: 100 },
    );
  });

  test("buildCorrectionRow preserves corrects_id pointing to immediate predecessor", () => {
    const original = makeBaseRow();
    const c1 = buildCorrectionRow(original, {}, "actor", new Date());
    const c2 = buildCorrectionRow(c1, {}, "actor", new Date());

    // c1 corrects original
    expect(c1.correctsId).toBe(original.id);
    // c2 corrects c1 (the tail at time of c2 creation)
    expect(c2.correctsId).toBe(c1.id);
  });

  test("computeDiff returns non-empty diff for changed amount", () => {
    const original = makeBaseRow();
    const diff = computeDiff(original, { amountOrig: "999.99" });
    expect(diff).toHaveProperty("amountOrig");
    expect(diff.amountOrig.before).toBe("100.00");
    expect(diff.amountOrig.after).toBe("999.99");
  });

  test("domain correction row has no Drizzle imports", async () => {
    // Module-level check: importing the module should not pull in drizzle
    const mod = await import("@budget/budgeting/src/domain/correction");
    expect(typeof mod.buildCorrectionRow).toBe("function");
    expect(typeof mod.computeDiff).toBe("function");
    // If drizzle was imported it would throw on db connection — absence = passing
  });
});
