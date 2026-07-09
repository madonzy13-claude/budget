import { describe, it, expect } from "vitest";
import {
  chartCompactCents,
  withDayStartBaseline,
  pctAxisTick,
} from "../../src/lib/chart-format";

describe("pctAxisTick", () => {
  it("keeps sub-10% ticks distinct with one decimal (r30b: single small bar)", () => {
    // A lone ~0.9% bar auto-domains to [0, 0.9]; integer rounding collapsed the
    // ticks to a wall of "0%"/"1%". One decimal under 10% keeps them apart.
    expect(pctAxisTick(0)).toBe("0%");
    expect(pctAxisTick(0.225)).toBe("0.2%");
    expect(pctAxisTick(0.45)).toBe("0.5%");
    expect(pctAxisTick(0.675)).toBe("0.7%");
    expect(pctAxisTick(0.9)).toBe("0.9%");
  });

  it("uses whole numbers once the magnitude is big enough (≥10%)", () => {
    expect(pctAxisTick(10)).toBe("10%");
    expect(pctAxisTick(906.4)).toBe("906%");
  });

  it("handles negatives symmetrically", () => {
    expect(pctAxisTick(-1.8)).toBe("-1.8%");
    expect(pctAxisTick(-42)).toBe("-42%");
  });
});

describe("chartCompactCents", () => {
  it("compacts CENTS to K/M magnitudes (round 24 item 7)", () => {
    expect(chartCompactCents(100_000)).toBe("1K"); // $1,000
    expect(chartCompactCents(8_200_000)).toBe("82K"); // $82,000
    expect(chartCompactCents(100_000_000)).toBe("1M"); // $1,000,000
    expect(chartCompactCents(220_000)).toBe("2.2K"); // $2,200
    expect(chartCompactCents(0)).toBe("0");
  });

  it("never renders a currency symbol or code (round 24 item 5)", () => {
    for (const n of [100_000, 8_200_000, 100_000_000, 220_000]) {
      expect(chartCompactCents(n)).not.toMatch(/[$€£]|USD|PLN|UAH/);
    }
  });
});

describe("withDayStartBaseline", () => {
  it("prepends a flat previous-day baseline for a single point (item 9)", () => {
    const out = withDayStartBaseline([
      { label: "2026-07-01", real: 2200, planned: 1650 },
    ]);
    expect(out).toEqual([
      { label: "2026-06-30", real: 2200, planned: 1650 }, // day-start, same values
      { label: "2026-07-01", real: 2200, planned: 1650 },
    ]);
  });

  it("zeroKeys resets given keys to 0 at the baseline (round 25 item 4)", () => {
    // 'real' spend starts at 0 (no spending yet); 'planned' target holds flat.
    const out = withDayStartBaseline(
      [{ label: "2026-07-01", real: 2200, planned: 1650 }],
      ["real"],
    );
    expect(out).toEqual([
      { label: "2026-06-30", real: 0, planned: 1650 },
      { label: "2026-07-01", real: 2200, planned: 1650 },
    ]);
  });

  it("leaves a multi-point series untouched", () => {
    const rows = [
      { label: "2026-07-01", real: 10 },
      { label: "2026-07-02", real: 20 },
    ];
    expect(withDayStartBaseline(rows)).toBe(rows);
  });

  it("always=true prepends a 0-start to a MULTI-point series (cumulative ramps from 0, r31e)", () => {
    // A cumulative daily spend line must start from 0 at month start, not the
    // first day's total ($2,588). planned holds flat across the baseline.
    const out = withDayStartBaseline(
      [
        { label: "2026-07-01", real: 2588, planned: 1250 },
        { label: "2026-07-02", real: 2900, planned: 1250 },
      ],
      ["real"],
      true,
    );
    expect(out).toEqual([
      { label: "2026-06-30", real: 0, planned: 1250 },
      { label: "2026-07-01", real: 2588, planned: 1250 },
      { label: "2026-07-02", real: 2900, planned: 1250 },
    ]);
  });

  it("no-ops for an empty series or an unparseable label", () => {
    expect(withDayStartBaseline([])).toEqual([]);
    const bad = [{ label: "not-a-date", real: 5 }];
    expect(withDayStartBaseline(bad)).toBe(bad);
  });
});
