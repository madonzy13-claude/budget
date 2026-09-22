// packages/budgeting/test/application/projection-window.test.ts
/**
 * The forecast window stopped being a constant (260904 request): a member picks
 * how far ahead the Overview cash-flow projection looks. Two pure pieces guard
 * that, and both are worth pinning without a database:
 *
 *  - `clampProjectionWindowDays` is the trust boundary. The number arrives from a
 *    query string, so "365" and 365 and "" and 1e9 all have to land somewhere
 *    sensible — never as a window the simulator would loop over for a minute.
 *  - `maxProjectionSteps` is the occurrence-loop backstop. It used to be a flat
 *    400, which is generous for 100 days and SILENTLY TRUNCATING for 546: a daily
 *    rule would simply stop being charged partway through the strip, and the
 *    forecast would read healthier the further out you looked.
 */
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import {
  clampProjectionWindowDays,
  enumerateOccurrences,
  maxProjectionSteps,
  MAX_PROJECTION_WINDOW_DAYS,
  MIN_PROJECTION_WINDOW_DAYS,
  PROJECTION_WINDOW_DAYS,
} from "@budget/budgeting/src/application/compute-cashflow-projection";

const D = (s: string) => Temporal.PlainDate.from(s);

describe("clampProjectionWindowDays", () => {
  test("keeps a value inside the range", () => {
    expect(clampProjectionWindowDays(365)).toBe(365);
    expect(clampProjectionWindowDays(546)).toBe(546);
  });

  test("defaults when nothing was asked for", () => {
    expect(clampProjectionWindowDays(undefined)).toBe(PROJECTION_WINDOW_DAYS);
    expect(clampProjectionWindowDays(null)).toBe(PROJECTION_WINDOW_DAYS);
  });

  test("reads the number a query string spells", () => {
    expect(clampProjectionWindowDays("365")).toBe(365);
    expect(clampProjectionWindowDays("365.7")).toBe(365);
  });

  test("clamps rather than trusting either end", () => {
    expect(clampProjectionWindowDays(1)).toBe(MIN_PROJECTION_WINDOW_DAYS);
    expect(clampProjectionWindowDays(100_000)).toBe(MAX_PROJECTION_WINDOW_DAYS);
    expect(clampProjectionWindowDays(-9)).toBe(MIN_PROJECTION_WINDOW_DAYS);
  });

  test("anything unreadable falls back to the default, never to NaN", () => {
    for (const junk of ["", "abc", "NaN", {}, [], true, Infinity, NaN]) {
      expect(clampProjectionWindowDays(junk)).toBe(PROJECTION_WINDOW_DAYS);
    }
  });
});

describe("maxProjectionSteps", () => {
  test("the 100-day window keeps exactly the backstop it always had", () => {
    expect(maxProjectionSteps(PROJECTION_WINDOW_DAYS)).toBe(400);
  });

  test("grows with the window, so a longer one is not a tighter cap", () => {
    expect(maxProjectionSteps(730)).toBeGreaterThan(730);
    expect(maxProjectionSteps(730)).toBeGreaterThan(
      maxProjectionSteps(PROJECTION_WINDOW_DAYS),
    );
  });
});

describe("enumerateOccurrences over a long window", () => {
  /**
   * The regression the flat 400 would have produced: 546 daily occurrences, of
   * which the loop would have emitted 400 and dropped 146 — a rent-sized hole in
   * the back third of the strip that nothing in the UI would have shown.
   */
  test("a DAILY rule is charged on every day of an 18-month window", () => {
    const out = enumerateOccurrences(
      { cadence: "DAILY" },
      {
        seed: D("2026-09-05"),
        afterExclusive: D("2026-09-04"),
        end: D("2028-03-02"), // 546 days from 2026-09-04 inclusive
        maxSteps: maxProjectionSteps(546),
      },
    );
    expect(out).toHaveLength(545);
    expect(out[0]).toBe("2026-09-05");
    expect(out[out.length - 1]).toBe("2028-03-02");
  });

  test("without a raised cap the same rule still stops at the default backstop", () => {
    const out = enumerateOccurrences(
      { cadence: "DAILY" },
      {
        seed: D("2026-09-05"),
        afterExclusive: D("2026-09-04"),
        end: D("2028-03-02"),
      },
    );
    expect(out).toHaveLength(400);
  });
});
