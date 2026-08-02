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
  it("MOVES a month's last reading to the boundary, then drops vertically", () => {
    const out = insertMonthResets([
      row("2026-06-10", 300),
      row("2026-06-20", 500),
      row("2026-07-05", 200),
    ]);
    // Four rows, not five: the reading is relocated, not copied. A copy gave the
    // month end two stops with the same numbers, and once the line was drawn to
    // the boundary the surviving stop sat where no line was left (user reports,
    // 260802: "extra tick", then "no tooltip is shown in the end").
    expect(out.map((r) => r.label)).toEqual([
      "2026-06-10",
      "2026-06-20",
      "2026-07-01",
      "2026-07-05",
    ]);
    // It keeps its own date and figures — it is still June's reading, drawn at
    // the moment June ends, so the line rises into the boundary with no stub.
    expect(out[1]!.real).toBe(500);
    expect(out[1]!.label).toBe("2026-06-20");
    expect(out[1]!.ts).toBe(Date.parse("2026-07-01T00:00:00Z") - 1);
    // And it is a READING, so the pointer stops on it and gets an answer.
    expect(out[1]!.reset).toBeFalsy();
    expect(out[1]!.drop).toBeFalsy();
    // Only the month's opening point is geometry: always zero, always silent.
    expect(out[2]!.real).toBe(0);
    expect(out[2]!.ts).toBe(Date.parse("2026-07-01T00:00:00Z"));
    expect([out[2]!.reset, out[2]!.drop]).toEqual([true, true]);
  });

  it("holds the plan bands and steps them square at the boundary", () => {
    const out = insertMonthResets([
      row("2026-06-20", 500, 100, 50),
      row("2026-07-05", 200, 400, 90),
    ]);
    const [close, open] = out;
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
      "2026-07-01",
      "2026-07",
    ]);
    // Each reset sits BEFORE its month's point, so the month draws as a rise
    // from zero rather than a slide out of the previous month.
    expect(out[2]!.ts).toBeLessThan(out[3]!.ts);
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
