import { describe, it, expect } from "vitest";
import { formatChartDate } from "../../src/lib/chart-date-format";

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

  it("formats an hourly/12h bucket 'YYYY-MM-DDTHH' as 'D Mon HH:00'", () => {
    expect(formatChartDate("2026-07-01T17", "en")).toBe("1 Jul 17:00");
    expect(formatChartDate("2026-07-15T00", "en")).toBe("15 Jul 00:00");
  });

  it("passes non-date labels through unchanged", () => {
    expect(formatChartDate("Groceries", "en")).toBe("Groceries");
    expect(formatChartDate(8, "en")).toBe("8");
  });
});
