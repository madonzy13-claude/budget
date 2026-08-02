/**
 * month-reset.test.ts — the per-month reset point (260801).
 *
 * Each month is its own cycle: at the boundary the SPEND drops to zero and the
 * next month starts again from there. The plan bands do NOT reset — they are a
 * step function, holding the old month's limit right up to the boundary and
 * stepping SQUARE (vertically, at one x) to the new one.
 */
import { describe, it, expect } from "vitest";
import { insertMonthResets } from "../../src/lib/month-reset";

const row = (label: string, real: number, needs = 100, wants = 50) => ({
  label,
  ts: Date.parse(`${label.length === 7 ? `${label}-28` : label}T00:00:00Z`),
  real,
  needs,
  wants,
});

describe("insertMonthResets", () => {
  it("holds the spend to the boundary, then drops it vertically", () => {
    const out = insertMonthResets([
      row("2026-06-10", 300),
      row("2026-06-20", 500),
      row("2026-07-05", 200),
    ]);
    expect(out.map((r) => r.label)).toEqual([
      "2026-06-10",
      "2026-06-20",
      "2026-06-20",
      "2026-07-01",
      "2026-07-05",
    ]);
    // The closing point carries JUNE's running total, so the line stays flat
    // until the boundary and the fall to zero is a vertical at ONE x.
    expect(out[2]!.real).toBe(500);
    expect(out[3]!.real).toBe(0);
    expect(out[3]!.ts).toBe(Date.parse("2026-07-01T00:00:00Z"));
    // Only the vertical is the reset line; the flat hold before it is spending.
    expect(out[2]!.drop).toBeFalsy();
    // The hold still describes the month it came FROM, and sits a moment before
    // the boundary, so hovering the end of a month reads that month's date and
    // numbers (user report: the last point of a month could not be tapped).
    expect(out[2]!.label).toBe("2026-06-20");
    expect(out[2]!.ts).toBe(Date.parse("2026-07-01T00:00:00Z") - 1);
    expect(out[3]!.drop).toBe(true);
    expect([out[2]!.reset, out[3]!.reset]).toEqual([true, true]);
    // The hold REPEATS the reading before it, so it must not answer the pointer
    // as well: hovering the end of a month stopped twice on the same date with
    // the same numbers — one tick too many (user report, 260802). The month's
    // OPENING point is a reading of its own and still answers.
    expect(out[2]!.hold).toBe(true);
    expect(out[3]!.hold).toBeFalsy();
  });

  it("holds the plan bands and steps them square at the boundary", () => {
    const out = insertMonthResets([
      row("2026-06-20", 500, 100, 50),
      row("2026-07-05", 200, 400, 90),
    ]);
    const [, close, open] = out;
    // The closing point keeps JUNE's limits and the opening point carries JULY's
    // — both at the same x, so the band steps vertically instead of sliding.
    expect([close!.needs, close!.wants]).toEqual([100, 50]);
    expect([open!.needs, open!.wants]).toEqual([400, 90]);
    // A single millisecond apart: square on screen, but the closing point keeps
    // its own month's date for the tooltip.
    expect(open!.ts - close!.ts).toBe(1);
  });

  it("puts a monthly bucket's reset at the start of its month", () => {
    const out = insertMonthResets([row("2026-06", 900), row("2026-07", 400)]);
    expect(out.map((r) => r.label)).toEqual([
      "2026-06-01",
      "2026-06",
      "2026-06",
      "2026-07-01",
      "2026-07",
    ]);
    // Each reset sits BEFORE its month's point, so the month draws as a rise
    // from zero rather than a slide out of the previous month.
    expect(out[3]!.ts).toBeLessThan(out[4]!.ts);
  });

  it("opens a monthly bucket's FIRST month at zero spend, full plan", () => {
    // A monthly point is a month-END value, so without a leading point the first
    // month would only ever be drawn dropping out of the range.
    const out = insertMonthResets([row("2026-06", 900, 700, 200)]);
    expect(out.map((r) => r.label)).toEqual(["2026-06-01", "2026-06"]);
    expect(out[0]!.reset).toBe(true);
    expect(out[0]!.real).toBe(0);
    // The plan is flat across the month — it does not ramp up from zero.
    expect([out[0]!.needs, out[0]!.wants]).toEqual([700, 200]);
  });

  it("leaves a single month alone", () => {
    const rows = [row("2026-06-10", 300), row("2026-06-20", 500)];
    expect(insertMonthResets(rows)).toEqual(rows);
  });

  it("never opens a daily range with a reset", () => {
    const out = insertMonthResets([row("2026-06-01", 0)]);
    expect(out).toHaveLength(1);
  });
});
