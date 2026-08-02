/**
 * overview-range-shift.test.ts — stepping the Overview window (260802).
 *
 * The range pills pick a window SIZE; the arrows move a window of that size back
 * and forward. A whole-month preset steps by whole months, so "3M" walks
 * Jun–Aug → Mar–May, and forward never runs past today.
 */
import { describe, it, expect } from "vitest";
import { Temporal } from "temporal-polyfill";
import { canShiftRange, shiftRange } from "../../src/lib/overview-range";

const NOW = Temporal.Instant.from("2026-08-02T12:00:00Z");
const range = (preset: string, from: string, to: string) =>
  ({ preset, from, to }) as Parameters<typeof shiftRange>[0];

describe("shiftRange", () => {
  it("steps a month window back to the WHOLE previous month", () => {
    const out = shiftRange(
      range("thisMonth", "2026-08-01", "2026-08-02"),
      -1,
      "UTC",
      NOW,
    );
    expect(out).toEqual({
      preset: "thisMonth",
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("steps forward and stops at today", () => {
    const out = shiftRange(
      range("thisMonth", "2026-07-01", "2026-07-31"),
      1,
      "UTC",
      NOW,
    );
    expect(out).toEqual({
      preset: "thisMonth",
      from: "2026-08-01",
      to: "2026-08-02",
    });
  });

  it("steps a three-month window by three months", () => {
    const out = shiftRange(
      range("last3Months", "2026-06-01", "2026-08-02"),
      -1,
      "UTC",
      NOW,
    );
    expect(out).toEqual({
      preset: "last3Months",
      from: "2026-03-01",
      to: "2026-05-31",
    });
  });

  it("keeps a February window on February's real length", () => {
    const out = shiftRange(
      range("thisMonth", "2026-03-01", "2026-03-31"),
      -1,
      "UTC",
      NOW,
    );
    expect(out.to).toBe("2026-02-28");
  });

  it("steps a custom day window by its own length", () => {
    const out = shiftRange(
      range("custom", "2026-07-10", "2026-07-19"),
      -1,
      "UTC",
      NOW,
    );
    // Ten days back: the window keeps its size and lands on the ten before it.
    expect(out).toEqual({
      preset: "custom",
      from: "2026-06-30",
      to: "2026-07-09",
    });
  });

  it("leaves the all-time range alone — it has no window to move", () => {
    const all = range("all", "2021-08-02", "2026-08-02");
    expect(shiftRange(all, -1, "UTC", NOW)).toEqual(all);
  });
});

describe("canShiftRange", () => {
  it("allows going back from any window", () => {
    expect(
      canShiftRange(
        range("thisMonth", "2026-08-01", "2026-08-02"),
        -1,
        "UTC",
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses to walk past today", () => {
    expect(
      canShiftRange(
        range("thisMonth", "2026-08-01", "2026-08-02"),
        1,
        "UTC",
        NOW,
      ),
    ).toBe(false);
  });

  it("allows going forward while the window still ends in the past", () => {
    expect(
      canShiftRange(
        range("thisMonth", "2026-07-01", "2026-07-31"),
        1,
        "UTC",
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses either direction for the all-time range", () => {
    const all = range("all", "2021-08-02", "2026-08-02");
    expect(canShiftRange(all, -1, "UTC", NOW)).toBe(false);
    expect(canShiftRange(all, 1, "UTC", NOW)).toBe(false);
  });
});
