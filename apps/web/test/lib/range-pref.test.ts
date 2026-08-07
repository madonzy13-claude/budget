/**
 * range-pref.test.ts — remembering which range someone last looked at (260805).
 *
 * The pick rides the member's stored prefs, which are `Record<string, string[]>`
 * — so a range has to survive a round trip through an array of strings. A
 * preset is one element; a custom range carries its two dates with it.
 *
 * The decode side is the one that matters: it is fed whatever is in the
 * database, including prefs written by an older build, and it must never hand
 * back something the range selector cannot draw.
 */
import { describe, it, expect } from "vitest";
import { encodeRangePref, decodeRangePref } from "@/lib/range-pref";
import { makeRange } from "@/lib/overview-range";

const TZ = "Europe/Warsaw";

describe("encodeRangePref", () => {
  it("keeps a preset as its one name", () => {
    expect(encodeRangePref(makeRange("last3Months", TZ))).toEqual([
      "last3Months",
    ]);
  });

  // A custom range is not reproducible from its name — the dates ARE the pick.
  it("keeps a custom range's own dates with it", () => {
    const range = makeRange("custom", TZ, {
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(encodeRangePref(range)).toEqual([
      "custom",
      "2026-01-01",
      "2026-03-31",
    ]);
  });
});

describe("decodeRangePref", () => {
  it("resolves a stored preset against today", () => {
    const decoded = decodeRangePref(["last3Months"], TZ);
    expect(decoded).toEqual(makeRange("last3Months", TZ));
  });

  it("gives a custom range back its stored dates", () => {
    const decoded = decodeRangePref(["custom", "2026-01-01", "2026-03-31"], TZ);
    expect(decoded?.preset).toBe("custom");
    expect(decoded?.from).toBe("2026-01-01");
    expect(decoded?.to).toBe("2026-03-31");
  });

  // A preset resolves against TODAY, never against the day it was stored: some
  // months later "this month" has to mean the month it is now.
  it("re-resolves a preset rather than storing its dates", () => {
    const stored = encodeRangePref(makeRange("thisMonth", TZ));
    expect(stored).toEqual(["thisMonth"]);
    expect(decodeRangePref(stored, TZ)).toEqual(makeRange("thisMonth", TZ));
  });

  // Everything below is "the database said something we did not write" — each
  // one has to fall back to the caller's default rather than draw a broken
  // selector or throw on a page that was only trying to remember a preference.
  it("refuses nothing at all", () => {
    expect(decodeRangePref(undefined, TZ)).toBeNull();
    expect(decodeRangePref([], TZ)).toBeNull();
  });

  it("refuses a preset it does not know", () => {
    expect(decodeRangePref(["lastDecade"], TZ)).toBeNull();
  });

  it("refuses a custom range with no dates, or unreadable ones", () => {
    expect(decodeRangePref(["custom"], TZ)).toBeNull();
    expect(decodeRangePref(["custom", "2026-01-01"], TZ)).toBeNull();
    expect(decodeRangePref(["custom", "01/01/2026", "2026-03-31"], TZ)).toBeNull();
  });

  // Stored the other way round, a range would ask the API for a negative span.
  it("refuses a custom range that ends before it starts", () => {
    expect(decodeRangePref(["custom", "2026-03-31", "2026-01-01"], TZ)).toBeNull();
  });

  it("survives a value of the wrong shape entirely", () => {
    expect(decodeRangePref("last3Months" as unknown as string[], TZ)).toBeNull();
    expect(decodeRangePref([42] as unknown as string[], TZ)).toBeNull();
  });
});
