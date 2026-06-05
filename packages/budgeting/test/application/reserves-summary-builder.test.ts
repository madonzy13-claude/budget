/**
 * reserves-summary-builder.test.ts — the NEW pure DTO shaper (05-12).
 *
 * Asserts buildReservesSummaryDto projects a ReservePositionsResult onto the
 * reserve/used/overspent rows + internal/userDefined/surplus/direction totals,
 * with NO walletShare% / actual / mismatch keys.
 */
import { describe, it, expect } from "bun:test";
import { buildReservesSummaryDto } from "../../src/application/reserves-summary-builder";
import type { ReservePositionsResult } from "../../src/application/get-reserve-positions";

const G = "Grocery";
const H = "Housing";
const X = "Excluded";

function positions(): ReservePositionsResult {
  return {
    positions: new Map([
      [
        G,
        {
          categoryId: G,
          reserveCents: 130000n,
          usedCents: 140000n,
          overspentCents: 0n,
          byMonth: new Map(),
        },
      ],
      [
        H,
        {
          categoryId: H,
          reserveCents: 80000n,
          usedCents: 60000n,
          overspentCents: 0n,
          byMonth: new Map(),
        },
      ],
    ]),
    internalCents: 210000n,
    userDefinedCents: 300000n,
    surplusCents: 90000n,
    direction: "WITHDRAW",
  };
}

const cats = [
  { id: G, name: "Grocery", reserveExcluded: false },
  { id: H, name: "Housing", reserveExcluded: false },
  { id: X, name: "Excluded", reserveExcluded: true },
];

describe("buildReservesSummaryDto", () => {
  it("maps positions to reserve/used/overspent rows + internal/surplus totals", () => {
    const dto = buildReservesSummaryDto({
      positions: positions(),
      categories: cats,
      budgetCurrency: "EUR",
      disabled: false,
    });

    expect(dto.rows).toHaveLength(2);
    const g = dto.rows.find((r) => r.categoryId === G)!;
    expect(g.name).toBe("Grocery");
    expect(g.reserveCents).toBe("130000");
    expect(g.usedCents).toBe("140000");
    expect(g.overspentCents).toBe("0");

    expect(dto.totals.internalCents).toBe("210000");
    expect(dto.totals.userDefinedCents).toBe("300000");
    expect(dto.totals.surplusCents).toBe("90000");
    expect(dto.totals.direction).toBe("WITHDRAW");
    expect(dto.totals.disabled).toBe(false);
    expect(dto.totals.budgetCurrency).toBe("EUR");
  });

  it("excluded categories become name-only rows (reserve hidden)", () => {
    const dto = buildReservesSummaryDto({
      positions: positions(),
      categories: cats,
      budgetCurrency: "EUR",
      disabled: false,
    });
    expect(dto.excludedRows).toHaveLength(1);
    const x = dto.excludedRows[0];
    expect(x.categoryId).toBe(X);
    expect(x.reserveCents).toBe("0");
    expect(x.usedCents).toBe("0");
    expect(x.overspentCents).toBe("0");
  });

  it("emits NO walletShare / actual / mismatch keys", () => {
    const dto = buildReservesSummaryDto({
      positions: positions(),
      categories: cats,
      budgetCurrency: "EUR",
      disabled: false,
    });
    const rowKeys = Object.keys(dto.rows[0]);
    expect(rowKeys).not.toContain("walletSharePercent");
    expect(rowKeys).not.toContain("walletShareAmountCents");
    expect(rowKeys).not.toContain("reserveBalanceCents");
    const totalKeys = Object.keys(dto.totals);
    expect(totalKeys).not.toContain("mismatchCents");
    expect(totalKeys).not.toContain("totalCategoryReservesCents");
    expect(totalKeys).not.toContain("totalReserveWalletAmountCents");
  });

  it("missing position for a listed category → zeroed row (no throw)", () => {
    const dto = buildReservesSummaryDto({
      positions: {
        positions: new Map(),
        internalCents: 0n,
        userDefinedCents: 0n,
        surplusCents: 0n,
        direction: "NONE",
      },
      categories: [{ id: G, name: "Grocery", reserveExcluded: false }],
      budgetCurrency: "PLN",
      disabled: false,
    });
    expect(dto.rows[0].reserveCents).toBe("0");
    expect(dto.totals.direction).toBe("NONE");
    expect(dto.totals.budgetCurrency).toBe("PLN");
  });
});
