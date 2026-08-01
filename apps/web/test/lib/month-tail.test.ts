/**
 * month-tail.test.ts — give the RUNNING month its full width (260801).
 *
 * With a time-proportional axis a month one day old is a 1%-wide sliver: its
 * plan band and its spend are invisible, and the chart looks like it ends in a
 * stray vertical (user screenshot). Carrying the plan to the month's last day
 * gives the month its real slot; the spend line still stops at today.
 */
import { describe, it, expect } from "vitest";
import { appendRunningMonthTail } from "../../src/lib/month-tail";

const row = (label: string, ts: string, real: number) => ({
  label,
  ts: Date.parse(`${ts}T00:00:00Z`),
  real,
  needs: 400,
  wants: 100,
});

describe("appendRunningMonthTail", () => {
  it("carries the plan to the end of the running month", () => {
    const rows = [row("2026-08-01", "2026-08-01", 1200)];
    const out = appendRunningMonthTail(rows, "2026-08-01");
    expect(out).toHaveLength(2);
    const tail = out[1]!;
    expect(tail.ts).toBe(Date.parse("2026-08-31T00:00:00Z"));
    expect([tail.needs, tail.wants]).toEqual([400, 100]);
    // No spend is claimed for days that haven't happened.
    expect(tail.real).toBeNull();
    // Geometry only: no tick, no tooltip.
    expect(tail.reset).toBe(true);
  });

  it("leaves a finished month alone", () => {
    const rows = [row("2026-07-31", "2026-07-31", 900)];
    expect(appendRunningMonthTail(rows, "2026-08-01")).toEqual(rows);
  });

  it("does nothing when the last point already sits on the month end", () => {
    const rows = [row("2026-08-31", "2026-08-31", 900)];
    expect(appendRunningMonthTail(rows, "2026-08-31")).toEqual(rows);
  });

  it("is a no-op for an empty series", () => {
    expect(appendRunningMonthTail([], "2026-08-01")).toEqual([]);
  });
});
