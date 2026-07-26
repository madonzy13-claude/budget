import { describe, it, expect } from "bun:test";
import { getAggregateWealthTrend } from "../src/application/get-aggregate-wealth-trend";

const deps = {
  getAggPrefsForUser: async () =>
    new Map([
      ["b1", { ownership_share_pct: 100, include_in_aggregation: true }],
      ["b2", { ownership_share_pct: 50, include_in_aggregation: true }],
    ]),
  listForUser: async () => [
    { id: "b1", default_currency: "USD" },
    { id: "b2", default_currency: "EUR" },
  ],
  getWealthForBudget: async ({ budgetId }: { budgetId: string }) =>
    budgetId === "b1"
      ? {
          currency: "USD",
          series: [
            { label: "Jan", value_cents: 100000n },
            { label: "Feb", value_cents: 120000n },
          ],
        }
      : { currency: "EUR", series: [{ label: "Feb", value_cents: 200000n }] }, // b2 missing Jan → forward-fill 0
  displayCurrencyReader: { getDisplayCurrency: async () => "USD" },
  fxProvider: {
    rateAsOf: async (from: string) => ({
      rate: from === "EUR" ? "1.10" : "1.00",
      provider: "t",
      isStale: false,
    }),
  },
  now: () => new Date("2026-07-17T00:00:00Z"),
};

describe("getAggregateWealthTrend", () => {
  it("sums included budgets per label at today's rate × share, forward-filling gaps", async () => {
    const out = await getAggregateWealthTrend(deps as any)({
      userId: "u1",
      range: "6M",
      includeIds: ["b1", "b2"],
    });
    // Jan: b1 100000 (×1.0) + b2 missing→0 = 100000
    // Feb: b1 120000 + b2 200000×1.10×0.5 = 120000 + 110000 = 230000
    expect(out.series).toEqual([
      { label: "Jan", value_cents: "100000" },
      { label: "Feb", value_cents: "230000" },
    ]);
    expect(out.display_currency).toBe("USD");
  });

  it("trims the leading run of zero buckets and measures growth from the first real value", async () => {
    const zeroLead = {
      ...deps,
      getAggPrefsForUser: async () =>
        new Map([["b1", { ownership_share_pct: 100, include_in_aggregation: true }]]),
      listForUser: async () => [{ id: "b1", default_currency: "USD" }],
      getWealthForBudget: async () => ({
        currency: "USD",
        series: [
          { label: "2023", value_cents: 0n },
          { label: "2024", value_cents: 0n },
          { label: "2025", value_cents: 100000n },
          { label: "2026", value_cents: 120000n },
        ],
      }),
    };
    const out = await getAggregateWealthTrend(zeroLead as any)({
      userId: "u1",
      range: "All",
      includeIds: ["b1"],
    });
    // Leading zero buckets (before any value) are dropped → chart starts at 2025.
    expect(out.series).toEqual([
      { label: "2025", value_cents: "100000" },
      { label: "2026", value_cents: "120000" },
    ]);
    // Growth measured from the first REAL value (100000 → 120000 = +20%), not the
    // zero lead (which would give delta ÷ 0 → +0.0%).
    expect(out.grow.delta_cents).toBe("20000");
    expect(out.grow.delta_pct).toBeCloseTo(20, 5);
  });

  it("excludes budgets not in includeIds", async () => {
    const out = await getAggregateWealthTrend(deps as any)({
      userId: "u1",
      range: "6M",
      includeIds: ["b1"],
    });
    expect(out.series).toEqual([
      { label: "Jan", value_cents: "100000" },
      { label: "Feb", value_cents: "120000" },
    ]);
  });
});
