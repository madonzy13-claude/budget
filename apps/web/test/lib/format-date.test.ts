/**
 * format-date.test.ts — formatTimestamp renders an instant in the user's timezone.
 *
 * The key behaviour (UAT #4/#5): the SAME instant renders different wall-clock
 * times in different zones, and an unparseable value yields "".
 */
import { describe, it, expect } from "vitest";
import { formatTimestamp } from "../../src/lib/format-date";

// 2026-02-13T09:44:00Z → 10:44 in Warsaw (UTC+1 in Feb), 09:44 in UTC.
const INSTANT = "2026-02-13T09:44:00Z";

describe("formatTimestamp", () => {
  it("renders the instant in the given timezone (Europe/Warsaw, 24h)", () => {
    const out = formatTimestamp(INSTANT, "en", "Europe/Warsaw");
    expect(out).toContain("2026");
    expect(out).toContain("February");
    expect(out).toContain("10:44"); // +1h vs UTC
  });

  it("renders the SAME instant differently in another timezone (UTC)", () => {
    const out = formatTimestamp(INSTANT, "en", "UTC");
    expect(out).toContain("09:44");
  });

  it("shifts to the next calendar day across a date boundary", () => {
    // 23:30 UTC is 08:30 the NEXT day in Tokyo (UTC+9).
    const out = formatTimestamp("2026-02-13T23:30:00Z", "en", "Asia/Tokyo");
    expect(out).toContain("14"); // Feb 14
    expect(out).toContain("08:30");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatTimestamp("not-a-date", "en", "UTC")).toBe("");
  });
});
