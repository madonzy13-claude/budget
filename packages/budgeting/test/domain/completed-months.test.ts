/**
 * A range asked for in months must yield that many COMPLETE months.
 *
 * Two rules were fighting. The window runs from a date to TODAY, and the month
 * still running is then dropped — a few days of spending against a whole
 * month's limit is not a rate. So on the 1st of a month "1Y" analysed 11
 * months, "6M" analysed 5, and "3M" analysed 2: a third of the sample gone,
 * silently, and only on some days of the month.
 *
 * Dropping the running month is right. Ending the window at today is what has
 * to give: the range slides back far enough to keep the count the caller asked
 * for.
 */
import { describe, test, expect } from "bun:test";
import { completedMonthsForRange } from "../../src/domain/completed-months";

describe("completedMonthsForRange", () => {
  test("a year asked for on the 1st still analyses twelve months", () => {
    // The case that started this: 2026-09-01, a 1Y range. September has one
    // day in it and cannot be a rate, so the window reaches back to Sep 2025.
    const months = completedMonthsForRange({
      from: "2025-10-01",
      to: "2026-09-30",
      nowMonth: "2026-09",
    });
    expect({
      count: months.length,
      first: months[0],
      last: months.at(-1),
    }).toEqual({ count: 12, first: "2025-09", last: "2026-08" });
  });

  test("three months asked for gives three, not two", () => {
    const months = completedMonthsForRange({
      from: "2026-07-01",
      to: "2026-09-30",
      nowMonth: "2026-09",
    });
    expect(months).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  test("a range that has already ended is left exactly as asked", () => {
    // Nothing is running inside it, so there is nothing to compensate for —
    // a custom range must mean what it says.
    const months = completedMonthsForRange({
      from: "2026-01-01",
      to: "2026-03-31",
      nowMonth: "2026-09",
    });
    expect(months).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  test("the running month alone is kept — a weak signal beats none", () => {
    // The existing rule, preserved: a brand-new budget whose only month is the
    // one still running would otherwise have nothing to show at all.
    const months = completedMonthsForRange({
      from: "2026-09-01",
      to: "2026-09-30",
      nowMonth: "2026-09",
    });
    expect(months).toEqual(["2026-09"]);
  });

  test("a range reaching into the future stops at the last complete month", () => {
    // "to" is whatever the caller sent; months that have not happened cannot
    // be averaged, and must not pad the count with emptiness.
    const months = completedMonthsForRange({
      from: "2026-08-01",
      to: "2026-12-31",
      nowMonth: "2026-09",
    });
    expect({ count: months.length, last: months.at(-1) }).toEqual({
      count: 5,
      last: "2026-08",
    });
  });

  test("months are returned in order, no gaps, no duplicates", () => {
    const months = completedMonthsForRange({
      from: "2025-11-01",
      to: "2026-09-30",
      nowMonth: "2026-09",
    });
    expect(months).toEqual([...new Set(months)].sort());
    expect(months.length).toBe(11);
  });
});
