/**
 * investment-return.test.ts — P/L % everywhere in the investments views is the
 * INVESTMENT RETURN (261102, user): what the invested money earned. Each step
 * earns its P/L change on the value held before it, and steps chain, so a
 * deposit is never a gain and its timing never skews the %.
 *
 * The user's case: 10 Dec 2025 → 2 Nov 2026, P/L 373.8k → 460.8k with 49.6k
 * added on ~882k — the tooltip said +17.7% (÷ contributions at start), the
 * header +9.7% (÷ start + added); the real return is ~9.6%.
 */
import { describe, it, expect } from "vitest";
import { cumulativeReturnPct, investChangeBars } from "@/lib/investment-return";

const pt = (label: string, value: number, pl: number) => ({ label, value, pl });

describe("cumulativeReturnPct", () => {
  it("a deposit is not a gain", () => {
    const pts = [pt("d1", 1000, 0), pt("d2", 1100, 100), pt("d3", 6100, 100)];
    expect(cumulativeReturnPct(pts).at(-1)).toBeCloseTo(10, 9);
  });

  it("chains: +10% then +10% is +21%, whenever the deposit came", () => {
    const pts = [
      pt("d1", 1000, 0),
      pt("d2", 1100, 100), // +10% on 1000
      pt("d3", 11100, 100), // 10,000 deposited
      pt("d4", 12210, 1210), // +1,110 = +10% on 11,100
    ];
    expect(cumulativeReturnPct(pts).at(-1)).toBeCloseTo(21, 9);
  });

  it("starts at 0 and skips steps with nothing invested before them", () => {
    const pts = [pt("d1", 0, 0), pt("d2", 1000, 0), pt("d3", 1050, 50)];
    const cum = cumulativeReturnPct(pts);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBe(0);
    expect(cum[2]).toBeCloseTo(5, 9);
  });
});

describe("investChangeBars", () => {
  // Two months; month B starts from A's last point.
  const pts = [
    pt("2026-01-01", 1000, 0),
    pt("2026-01-15", 1100, 100), // +10%
    pt("2026-02-01", 2100, 100), // +1000 deposited
    pt("2026-02-20", 2310, 310), // +210 on 2100 = +10%
  ];
  const month = (l: string) => l.slice(0, 7);

  it("each period's P/L % is the return of the steps ending in it", () => {
    const { rows } = investChangeBars(pts, month);
    expect(rows.map((r) => r.label)).toEqual(["2026-01", "2026-02"]);
    expect(rows[0]!.pl).toBeCloseTo(10, 9);
    expect(rows[1]!.pl).toBeCloseTo(10, 9);
    expect(rows[1]!.plDelta).toBe(210);
  });

  it("periods chain exactly into the range return; the average compounds to it", () => {
    const { rows, avg } = investChangeBars(pts, month);
    const chained = rows.reduce((f, r) => f * (1 + r.pl / 100), 1);
    expect((chained - 1) * 100).toBeCloseTo(
      cumulativeReturnPct(pts).at(-1)!,
      9,
    );
    expect(avg.pl).toBeCloseTo(10, 9); // (1.1 × 1.1)^(1/2) − 1
  });

  it("Total and Contributions measure from where the period started", () => {
    const { rows } = investChangeBars(pts, month);
    // Feb starts at Jan's last point: value 1100, P/L 100, contributed 1000.
    expect(rows[1]!.totalDelta).toBe(1210);
    expect(rows[1]!.total).toBeCloseTo(110, 9);
    expect(rows[1]!.contribDelta).toBe(1000);
    expect(rows[1]!.contrib).toBeCloseTo(100, 9);
  });

  it("no points → no bars", () => {
    expect(investChangeBars([], month).rows).toEqual([]);
  });

  // "All" (261106): the first and the running year are partial; each counts
  // for the share of it the points cover, in both the % and the amount.
  it("year bars: partial years count for the part the data covers", () => {
    const pts = [
      pt("2023-10-01", 1000, 0),
      pt("2023-12-31", 1100, 100),
      pt("2024-12-31", 1210, 210),
      pt("2025-12-31", 1331, 331),
      pt("2026-07-02", 1464.1, 464.1),
    ];
    const { rows, avg, avgDelta } = investChangeBars(pts, (l) => l.slice(0, 4));
    // 2023: 1 Oct → 31 Dec; 2026: 1 Jan → 2 Jul, both days whole.
    const years = 92 / 365 + 1 + 1 + 183 / 365;
    expect(avg.pl).toBeCloseTo((Math.pow(1.1 ** 4, 1 / years) - 1) * 100, 6);
    const sum = rows.reduce((s, r) => s + r.plDelta, 0);
    expect(avgDelta.pl).toBe(Math.round(sum / years));
  });

  it("less than a year of data is not stretched into one", () => {
    const pts = [pt("2026-05-01", 1000, 0), pt("2026-07-02", 1100, 100)];
    const { avg, avgDelta } = investChangeBars(pts, (l) => l.slice(0, 4));
    expect(avg.pl).toBeCloseTo(10, 9);
    expect(avgDelta.pl).toBe(100);
  });
});

