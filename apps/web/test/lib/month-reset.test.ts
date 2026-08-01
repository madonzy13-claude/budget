/**
 * month-reset.test.ts — the per-month reset point (260801).
 *
 * Each month is its own cycle: at the boundary the plan bands and the spend line
 * both drop to zero, and the new month starts again from there. Without the
 * explicit zero row the two months are joined by one sliding segment, which is
 * what made a month read as continuing the previous month's total.
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
  it("drops to zero at every month boundary", () => {
    const out = insertMonthResets([
      row("2026-06-10", 300),
      row("2026-06-20", 500),
      row("2026-07-05", 200),
    ]);
    expect(out.map((r) => r.label)).toEqual([
      "2026-06-10",
      "2026-06-20",
      "2026-07-01",
      "2026-07-05",
    ]);
    const reset = out[2]!;
    expect(reset.reset).toBe(true);
    expect([reset.real, reset.needs, reset.wants]).toEqual([0, 0, 0]);
    expect(reset.ts).toBe(Date.parse("2026-07-01T00:00:00Z"));
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

  it("opens a monthly bucket's FIRST month at zero too", () => {
    // A monthly point is a month-END value, so without a leading zero the first
    // month would only ever be drawn dropping out of the range.
    const out = insertMonthResets([row("2026-06", 900)]);
    expect(out.map((r) => r.label)).toEqual(["2026-06-01", "2026-06"]);
    expect(out[0]!.reset).toBe(true);
  });

  it("leaves a single month alone", () => {
    const rows = [row("2026-06-10", 300), row("2026-06-20", 500)];
    expect(insertMonthResets(rows)).toEqual(rows);
  });

  it("never opens the range with a reset", () => {
    const out = insertMonthResets([row("2026-06-01", 0)]);
    expect(out).toHaveLength(1);
  });
});
