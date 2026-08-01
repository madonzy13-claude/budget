/**
 * chart-timestamp.test.ts — chart label → epoch ms (260801).
 *
 * The x-axis was categorical, so every point got the same width: the 1-day step
 * from 31 Jul to a running 1 Aug looked as wide as the 30 days before it. Plotting
 * points at their real timestamps makes the spacing proportional to time.
 */
import { describe, it, expect } from "vitest";
import { labelToTimestamp } from "../../src/lib/chart-timestamp";

const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("labelToTimestamp", () => {
  it("uses the day itself for a daily label", () => {
    expect(labelToTimestamp("2026-07-14", "2026-08-01")).toBe(at("2026-07-14"));
  });

  it("uses the month END for a completed month", () => {
    expect(labelToTimestamp("2026-06", "2026-08-01")).toBe(at("2026-06-30"));
    expect(labelToTimestamp("2026-02", "2026-08-01")).toBe(at("2026-02-28"));
  });

  it("clamps the RUNNING month to today — a month one day old is one day wide", () => {
    expect(labelToTimestamp("2026-08", "2026-08-01")).toBe(at("2026-08-01"));
    expect(labelToTimestamp("2026-08", "2026-08-14")).toBe(at("2026-08-14"));
  });

  it("keeps a future month at its last day", () => {
    expect(labelToTimestamp("2026-12", "2026-08-01")).toBe(at("2026-12-31"));
  });

  it("returns NaN for an unparseable label", () => {
    expect(Number.isNaN(labelToTimestamp("whatever", "2026-08-01"))).toBe(true);
  });
});
