/**
 * chart-month-end-label.test.ts — tooltip label for a MONTHLY chart point.
 *
 * A monthly bucket carries the month's value as of its last day, so the tooltip
 * should name that day even though the axis only has room for "Jul 2026"
 * (260801 user request). The running month stops at today — its point cannot
 * describe days that haven't happened.
 */
import { describe, it, expect } from "vitest";
import { monthEndLabel } from "../../src/lib/chart-month-end-label";

describe("monthEndLabel", () => {
  it("expands a past month to its last day", () => {
    expect(monthEndLabel("2026-06", "2026-08-01")).toBe("2026-06-30");
    expect(monthEndLabel("2026-07", "2026-08-01")).toBe("2026-07-31");
    expect(monthEndLabel("2026-02", "2026-08-01")).toBe("2026-02-28");
  });

  it("knows leap Februaries", () => {
    expect(monthEndLabel("2028-02", "2028-08-01")).toBe("2028-02-29");
  });

  it("stops the RUNNING month at today", () => {
    expect(monthEndLabel("2026-08", "2026-08-01")).toBe("2026-08-01");
    expect(monthEndLabel("2026-08", "2026-08-14")).toBe("2026-08-14");
  });

  it("leaves a future month at its last day", () => {
    expect(monthEndLabel("2026-12", "2026-08-01")).toBe("2026-12-31");
  });

  it("passes a day-level label straight through", () => {
    expect(monthEndLabel("2026-07-14", "2026-08-01")).toBe("2026-07-14");
  });

  it("passes anything unrecognised through untouched", () => {
    expect(monthEndLabel("whatever", "2026-08-01")).toBe("whatever");
  });
});
