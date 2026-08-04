/**
 * range-completed-month.test.ts — which ranges these two charts can answer.
 *
 * "How far off plan, by category" and "Is each reserve the right size?" both
 * judge months against their full budget, and both deliberately leave the month
 * still running out. Pick a range that holds nothing else and there is nothing
 * left to judge: the honest answer is to say so rather than draw a bar from half
 * a month of spend (user, 260804).
 */
import { describe, it, expect } from "vitest";
import { rangeHasCompletedMonth } from "../../src/lib/range-completed-month";

const TODAY = "2026-08-04";

describe("rangeHasCompletedMonth", () => {
  it("says no for the month still running", () => {
    expect(rangeHasCompletedMonth("2026-08-01", "2026-08-31", TODAY)).toBe(
      false,
    );
  });

  it("says no for a few days inside it", () => {
    expect(rangeHasCompletedMonth("2026-08-02", "2026-08-03", TODAY)).toBe(
      false,
    );
  });

  it("says yes as soon as a finished month is in range", () => {
    expect(rangeHasCompletedMonth("2026-07-01", "2026-08-31", TODAY)).toBe(
      true,
    );
  });

  it("says yes for a range wholly in the past", () => {
    expect(rangeHasCompletedMonth("2026-01-01", "2026-06-30", TODAY)).toBe(
      true,
    );
  });

  it("counts a month that only overlaps the range", () => {
    // The 3M window opens mid-June: June is still a finished month.
    expect(rangeHasCompletedMonth("2026-06-15", "2026-08-04", TODAY)).toBe(
      true,
    );
  });

  it("treats a range in the future as having nothing finished", () => {
    expect(rangeHasCompletedMonth("2026-09-01", "2026-09-30", TODAY)).toBe(
      false,
    );
  });

  it("survives a range it cannot read", () => {
    expect(rangeHasCompletedMonth("", "", TODAY)).toBe(false);
  });
});
