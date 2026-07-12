/**
 * get-overview-wealth.test.ts — Financial-Wealth section service.
 *
 * VALUE series: aggregated at the value bucket (1h ≤1mo, 12h ~3mo, 24h 6mo+),
 * last-in-bucket, live current point, and ZERO-FILLED across the whole range so the
 * chart spans [from,to]. grow/loss is measured over the DATA points only (not the
 * zero-fill). The % CHANGE (dynamics) chart uses a COARSER calendar bucket (day /
 * month / year), data-only steps. Per-type pie for the investments view.
 */
import { describe, test, expect } from "bun:test";
import {
  getOverviewWealth,
  type GetOverviewWealthDeps,
  type OverviewWealthDTO,
} from "@budget/budgeting/src/application/get-overview-wealth";

/** Jan has two rows (last-in-bucket for the monthly dynamics = 100000). */
function snapshotRepo(): GetOverviewWealthDeps["snapshotRepo"] {
  return {
    async seriesForRange() {
      return [
        {
          captured_at: new Date("2026-01-05T00:00:00Z"),
          capitalization_cents: 90000n,
          investment_value_cents: 45000n,
        },
        {
          captured_at: new Date("2026-01-31T00:00:00Z"),
          capitalization_cents: 100000n,
          investment_value_cents: 50000n,
        },
        {
          captured_at: new Date("2026-02-28T00:00:00Z"),
          capitalization_cents: 110000n,
          investment_value_cents: 55000n,
        },
      ];
    },
    async openingBefore() {
      return null;
    },
  };
}

function computeWealthNow(): GetOverviewWealthDeps["computeWealthNow"] {
  return async () => ({
    capitalization_cents: 108000n,
    investment_value_cents: 56000n,
    currency: "USD",
  });
}

function holdingsByType(): GetOverviewWealthDeps["holdingsByType"] {
  return {
    async valueByType() {
      return [
        { holding_type: "STOCK", value_cents: 36000n },
        { holding_type: "CRYPTO", value_cents: 20000n },
      ];
    },
  };
}

function deps(over?: Partial<GetOverviewWealthDeps>): GetOverviewWealthDeps {
  return {
    snapshotRepo: snapshotRepo(),
    computeWealthNow: computeWealthNow(),
    holdingsByType: holdingsByType(),
    metaReader: {
      async getBudgetMeta() {
        return { default_currency: "USD" };
      },
    },
    ...over,
  };
}

// ~3-month range → value bucket 12h, dynamics bucket monthly. live shares March.
const base = {
  tenantId: "b1",
  budgetId: "b1",
  from: "2026-01-01",
  to: "2026-03-31",
  now: () => new Date("2026-03-20T12:00:00Z"),
};

const run = async (over?: Partial<typeof base>): Promise<OverviewWealthDTO> =>
  (
    await getOverviewWealth(deps())({
      ...base,
      ...over,
      view: "capitalization",
    })
  )._unsafeUnwrap();

const valueAt = (dto: OverviewWealthDTO, label: string) =>
  dto.series.find((p) => p.label === label)?.value_cents;

describe("getOverviewWealth", () => {
  test("value + dynamics bucket sizes by span", async () => {
    const s1 = await run({ from: "2026-03-01", to: "2026-03-20" }); // 19 days
    expect(s1.bucket).toBe("1h");
    expect(s1.dynamicsBucket).toBe("daily");
    const s3 = await run(); // 89 days
    expect(s3.bucket).toBe("12h");
    expect(s3.dynamicsBucket).toBe("monthly");
    const s24 = await run({ from: "2025-01-01", to: "2026-03-20" }); // >1y
    expect(s24.bucket).toBe("24h");
    expect(s24.dynamicsBucket).toBe("yearly");
  });

  test("1M (daily) shows a bar for EVERY day via carry-forward, not just snapshot days (item 4)", async () => {
    // One snapshot on day 1, then nothing until the live point on day 5. The daily
    // dynamics must still show a bar per day (carry-forward = flat 0% on gap days),
    // not a single bar for the only day with a raw snapshot.
    const sparseRepo: GetOverviewWealthDeps["snapshotRepo"] = {
      async seriesForRange() {
        return [
          {
            captured_at: new Date("2026-03-01T00:00:00Z"),
            capitalization_cents: 100000n,
            investment_value_cents: 0n,
          },
        ];
      },
      async openingBefore() {
        return null;
      },
    };
    const liveRepo: GetOverviewWealthDeps["computeWealthNow"] = async () => ({
      capitalization_cents: 110000n,
      investment_value_cents: 0n,
      currency: "USD",
    });
    const dto = (
      await getOverviewWealth(
        deps({ snapshotRepo: sparseRepo, computeWealthNow: liveRepo }),
      )({
        ...base,
        from: "2026-03-01",
        to: "2026-03-05",
        now: () => new Date("2026-03-05T12:00:00Z"),
        view: "capitalization",
      })
    )._unsafeUnwrap();
    expect(dto.dynamicsBucket).toBe("daily");
    // A bar for every day except the first (no predecessor): 03-02 … 03-05.
    expect(dto.dynamics.map((d) => d.label)).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
    // Gap days carry the day-1 value (0%); the live jump on the last day is +10%.
    expect(dto.dynamics.map((d) => d.pct)).toEqual([0, 0, 0, 10]);
  });

  test("value series spans the whole range; carry-forward across gaps (item 5)", async () => {
    const dto = await run();
    // spans from the first bucket of `from` to the last bucket of `to`.
    expect(dto.series[0]!.label).toBe("2026-01-01T00");
    expect(dto.series[dto.series.length - 1]!.label).toBe("2026-03-31T12");
    // real snapshots land in their buckets; live overrides the current one.
    expect(valueAt(dto, "2026-01-31T00")).toBe("100000");
    expect(valueAt(dto, "2026-02-28T00")).toBe("110000");
    expect(valueAt(dto, "2026-03-20T12")).toBe("108000"); // live override
    // BEFORE the first snapshot (Jan 05) → 0; AFTER it, gaps carry the last value.
    expect(valueAt(dto, "2026-01-01T00")).toBe("0"); // pre-data → 0
    expect(valueAt(dto, "2026-02-01T00")).toBe("100000"); // gap → carried from Jan 31
  });

  test("grow/loss over the DATA points only, not the zero-fill (D-15)", async () => {
    const dto = await run();
    expect(dto.grow.delta_cents).toBe("18000"); // 108000 − 90000 (first real value)
    expect(dto.grow.delta_pct).toBeCloseTo(20.0, 5); // 18000 / 90000
    // No opening → the chart starts at the zero-fill (series[0] = 0). FW growth is
    // measured from that $0 chart edge: full amount, undefined % (r30b user choice —
    // "measure from the $0 edge" so the number matches what the chart draws).
    expect(dto.grow_from_open.delta_cents).toBe("108000"); // 108000 − 0 (chart start)
    expect(dto.grow_from_open.delta_pct).toBeNull();
  });

  test("dynamics at the coarser (monthly) bucket, data-only steps (D-16)", async () => {
    const dto = await run();
    expect(dto.dynamics.map((d) => d.label)).toEqual(["2026-02", "2026-03"]);
    expect(dto.dynamics[0]!.pct).toBeCloseTo(10.0, 5); // Jan 100000 → Feb 110000
    expect(dto.dynamics[1]!.pct).toBeCloseTo(-1.818181, 4); // Feb 110000 → Mar live 108000
    // GEOMETRIC mean of the two step returns (compounding): ×1.10 then ×0.98182
    // over 2 periods → (1.10 · 0.98182)^(1/2) − 1 = √1.08 − 1 ≈ 3.923% (NOT 4.09%).
    const geom =
      (Math.pow((1 + 10 / 100) * (1 + -1.818181 / 100), 1 / 2) - 1) * 100;
    expect(dto.monthly_avg_grow_pct).toBeCloseTo(geom, 3);
  });

  test("zero-start: delta_pct null and the 0→x step is skipped from the mean", async () => {
    const zeroRepo: GetOverviewWealthDeps["snapshotRepo"] = {
      async seriesForRange() {
        return [
          {
            captured_at: new Date("2026-01-31T00:00:00Z"),
            capitalization_cents: 0n,
            investment_value_cents: 0n,
          },
          {
            captured_at: new Date("2026-02-28T00:00:00Z"),
            capitalization_cents: 50000n,
            investment_value_cents: 0n,
          },
        ];
      },
      async openingBefore() {
        return null;
      },
    };
    const liveZero: GetOverviewWealthDeps["computeWealthNow"] = async () => ({
      capitalization_cents: 60000n,
      investment_value_cents: 0n,
      currency: "USD",
    });
    const dto = (
      await getOverviewWealth(
        deps({ snapshotRepo: zeroRepo, computeWealthNow: liveZero }),
      )({ ...base, view: "capitalization" })
    )._unsafeUnwrap();
    expect(dto.grow.delta_pct).toBeNull(); // start 0
    // Jan→Feb step is 0→50000 (null, skipped); Feb→Mar 50000→60000 = +20.
    expect(dto.dynamics[0]!.pct).toBeNull();
    expect(dto.monthly_avg_grow_pct).toBeCloseTo(20.0, 5);
  });

  test("investments view: series uses investment_value_cents + per-type pie (D-18)", async () => {
    const dto = (
      await getOverviewWealth(deps())({ ...base, view: "investments" })
    )._unsafeUnwrap();
    expect(dto.view).toBe("investments");
    expect(valueAt(dto, "2026-01-31T00")).toBe("50000");
    expect(valueAt(dto, "2026-02-28T00")).toBe("55000");
    expect(valueAt(dto, "2026-03-20T12")).toBe("56000"); // live
    expect(dto.pie).toEqual([
      { holding_type: "STOCK", value_cents: "36000" },
      { holding_type: "CRYPTO", value_cents: "20000" },
    ]);
  });

  test("capitalization view: pie is null (D-18)", async () => {
    const dto = await run();
    expect(dto.pie).toBeNull();
  });

  test("CONTIGUOUS opening seeds the first in-range dynamics bucket (item 4)", async () => {
    // A snapshot in the IMMEDIATELY-PRECEDING bucket (last December) — contiguous
    // with the first in-range month (Jan), so the first bar is a true per-period
    // change, not dropped for lack of a predecessor.
    const withOpening: GetOverviewWealthDeps["snapshotRepo"] = {
      ...snapshotRepo(),
      async openingBefore() {
        return {
          captured_at: new Date("2025-12-31T00:00:00Z"),
          capitalization_cents: 80000n,
          investment_value_cents: 40000n,
        };
      },
    };
    const dto = (
      await getOverviewWealth(deps({ snapshotRepo: withOpening }))({
        ...base,
        view: "capitalization",
      })
    )._unsafeUnwrap();
    // carry-forward: leading buckets show the opening value, not 0 (r24 item 2).
    expect(valueAt(dto, "2026-01-01T00")).toBe("80000");
    // dynamics NOW includes Jan — seeded by the contiguous Dec opening (item 4).
    expect(dto.dynamics.map((d) => d.label)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(dto.dynamics[0]!.pct).toBeCloseTo(25.0, 5); // Dec 80000 → Jan 100000
    expect(dto.dynamics[1]!.pct).toBeCloseTo(10.0, 5); // Jan 100000 → Feb 110000
  });

  test("a NON-contiguous (far-back) opening does NOT seed dynamics — no giant jump bar (r28 item 1)", async () => {
    // An opening 7 months back (a stale seed, not the previous month). Seeding it
    // would draw a giant Jun→Jan bar that swamps the real per-period changes, so the
    // first in-range bucket (Jan) stays without a predecessor and steps start at Feb.
    const withStaleOpening: GetOverviewWealthDeps["snapshotRepo"] = {
      ...snapshotRepo(),
      async openingBefore() {
        return {
          captured_at: new Date("2025-06-30T00:00:00Z"),
          capitalization_cents: 80000n,
          investment_value_cents: 40000n,
        };
      },
    };
    const dto = (
      await getOverviewWealth(deps({ snapshotRepo: withStaleOpening }))({
        ...base,
        view: "capitalization",
      })
    )._unsafeUnwrap();
    // carry-forward still seeds leading buckets from the opening (r24 item 2)…
    expect(valueAt(dto, "2026-01-01T00")).toBe("80000");
    // …but the dynamics do NOT — Jan has no (contiguous) predecessor, so no jump bar.
    expect(dto.dynamics.map((d) => d.label)).toEqual(["2026-02", "2026-03"]);
    expect(dto.dynamics[0]!.pct).toBeCloseTo(10.0, 5); // Jan 100000 → Feb 110000
  });

  test("grow_from_open anchors on the opening (chart start); grow stays first-real (r30 item 2)", async () => {
    // The Financial-Wealth section growth must AGREE with its area chart, which
    // starts at the carried opening value. So grow_from_open anchors on the opening
    // (value entering the range = "since month start"). The hero card's day P/L still
    // reads `grow` (first-real baseline) and must NOT move.
    const withOpening: GetOverviewWealthDeps["snapshotRepo"] = {
      ...snapshotRepo(),
      async openingBefore() {
        return {
          captured_at: new Date("2025-12-31T00:00:00Z"),
          capitalization_cents: 80000n,
          investment_value_cents: 40000n,
        };
      },
    };
    const dto = (
      await getOverviewWealth(deps({ snapshotRepo: withOpening }))({
        ...base,
        view: "capitalization",
      })
    )._unsafeUnwrap();
    // hero P/L (grow) unchanged: first real in-range (90000) → live (108000).
    expect(dto.grow.delta_cents).toBe("18000");
    expect(dto.grow.delta_pct).toBeCloseTo(20.0, 5);
    // FW growth anchors on the opening (80000 = the chart's leftmost point) → live.
    expect(dto.grow_from_open.delta_cents).toBe("28000"); // 108000 − 80000
    expect(dto.grow_from_open.delta_pct).toBeCloseTo(35.0, 5); // 28000 / 80000
  });
});
