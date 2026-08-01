import { describe, it, expect } from "vitest";
import {
  formatChartDate,
  formatChartTimestamp,
} from "../../src/lib/chart-date-format";

describe("formatChartDate", () => {
  it("formats a monthly bucket as 'Mon YYYY' (round 16 item 5)", () => {
    expect(formatChartDate("2026-02", "en")).toBe("Feb 2026");
  });

  it("formats a daily bucket as 'D Mon YYYY'", () => {
    expect(formatChartDate("2026-02-12", "en")).toBe("12 Feb 2026");
    // day is not zero-padded
    expect(formatChartDate("2026-02-07", "en")).toBe("7 Feb 2026");
  });

  it("localizes the month name", () => {
    // UK short month for February — Intl gives "лют." (with trailing dot)
    expect(formatChartDate("2026-02", "uk")).toMatch(/2026/);
    expect(formatChartDate("2026-02", "uk")).not.toBe("2026-02");
  });

  it("collapses an hourly/12h bucket 'YYYY-MM-DDTHH' to its DATE (no time)", () => {
    expect(formatChartDate("2026-07-01T17", "en")).toBe("1 Jul 2026");
    expect(formatChartDate("2026-07-15T00", "en")).toBe("15 Jul 2026");
  });

  it("passes non-date labels through unchanged", () => {
    expect(formatChartDate("Groceries", "en")).toBe("Groceries");
    expect(formatChartDate(8, "en")).toBe("8");
  });
});

describe("formatChartTimestamp", () => {
  const ts = Date.parse("2026-03-31T00:00:00Z");

  it("names the day for a daily axis", () => {
    expect(formatChartTimestamp(ts, "en", "day")).toBe("31 Mar 2026");
  });

  it("names only the month for ranges past 3M (260801 user request)", () => {
    expect(formatChartTimestamp(ts, "en", "month")).toBe("Mar 2026");
  });

  it("reads the timestamp in UTC, where the chart's points are placed", () => {
    // A month-END point must not roll into the next month on a west-of-UTC box.
    expect(
      formatChartTimestamp(Date.parse("2026-01-31T00:00:00Z"), "en", "month"),
    ).toBe("Jan 2026");
  });

  it("is empty for a non-finite timestamp", () => {
    expect(formatChartTimestamp(NaN, "en", "day")).toBe("");
  });
});
