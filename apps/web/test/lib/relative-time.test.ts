/**
 * relative-time.test.ts — human-readable "last spending added" timestamp.
 * Relative for the recent past, absolute (user-timezone) date beyond a week.
 */
import { describe, it, expect } from "vitest";
import { formatRelativeOrDate } from "../../src/lib/relative-time";

const NOW = new Date("2026-07-16T12:00:00Z");

function fmt(iso: string, locale = "en", tz = "Europe/Warsaw") {
  return formatRelativeOrDate(iso, locale, tz, NOW);
}

describe("formatRelativeOrDate", () => {
  it("seconds ago", () => {
    expect(fmt("2026-07-16T11:59:40Z")).toBe("20 seconds ago");
  });

  it("minutes ago", () => {
    expect(fmt("2026-07-16T11:35:00Z")).toBe("25 minutes ago");
  });

  it("hours ago", () => {
    expect(fmt("2026-07-16T07:00:00Z")).toBe("5 hours ago");
  });

  it("yesterday (numeric:auto day granularity)", () => {
    expect(fmt("2026-07-15T10:00:00Z")).toBe("yesterday");
  });

  it("older than a week → absolute date in the USER timezone", () => {
    // 2026-06-30 23:30 UTC = 2026-07-01 01:30 in Warsaw — the Warsaw date wins.
    expect(fmt("2026-06-30T23:30:00Z")).toBe("July 1, 2026");
  });

  it("localizes: Polish relative form", () => {
    expect(fmt("2026-07-16T11:35:00Z", "pl")).toBe("25 minut temu");
  });
});
