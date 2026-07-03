/**
 * overview-range.test.ts — the "current month" (and every today-relative range)
 * must roll over in the USER's timezone, not UTC (r31 item 1). At 23:30 UTC on the
 * last day of a month, a Tokyo user is already in the next month.
 */
import { describe, it, expect } from "vitest";
import { Temporal } from "temporal-polyfill";
import { todayInTz, resolveRange } from "@/lib/overview-range";

const boundary = Temporal.Instant.from("2026-06-30T23:30:00Z");

describe("todayInTz", () => {
  it("rolls the date in the user's timezone, not UTC", () => {
    expect(todayInTz("UTC", boundary).toString()).toBe("2026-06-30");
    expect(todayInTz("Asia/Tokyo", boundary).toString()).toBe("2026-07-01"); // +9 → next day
    expect(todayInTz("America/Los_Angeles", boundary).toString()).toBe(
      "2026-06-30",
    ); // −7 → same day
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(todayInTz("Not/AZone", boundary).toString()).toBe("2026-06-30");
  });
});

describe("resolveRange thisMonth respects the timezone", () => {
  it("Tokyo user has already rolled to the next month", () => {
    expect(
      resolveRange("thisMonth", "Asia/Tokyo", undefined, boundary),
    ).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
  });

  it("UTC user is still in the previous month", () => {
    expect(resolveRange("thisMonth", "UTC", undefined, boundary)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });
});
