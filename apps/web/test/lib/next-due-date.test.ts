import { describe, it, expect } from "vitest";
import { nextDueDate } from "@/lib/next-due-date";

// Reference "today": 2026-07-21 is a TUESDAY (ISO weekday 2).
const TODAY = "2026-07-21";

describe("nextDueDate", () => {
  describe("WEEKLY", () => {
    it("returns today when today already is the chosen weekday", () => {
      expect(nextDueDate("WEEKLY", { weeklyDow: 2 }, TODAY)).toBe("2026-07-21");
    });
    it("returns the next matching weekday later this week", () => {
      expect(nextDueDate("WEEKLY", { weeklyDow: 3 }, TODAY)).toBe("2026-07-22");
      expect(nextDueDate("WEEKLY", { weeklyDow: 7 }, TODAY)).toBe("2026-07-26");
    });
    it("wraps into next week when the weekday already passed", () => {
      expect(nextDueDate("WEEKLY", { weeklyDow: 1 }, TODAY)).toBe("2026-07-27");
    });
  });

  describe("MONTHLY", () => {
    it("returns today when the day-of-month is today", () => {
      expect(nextDueDate("MONTHLY", { dayOfMonth: 21 }, TODAY)).toBe(
        "2026-07-21",
      );
    });
    it("stays this month when the day is still ahead", () => {
      expect(nextDueDate("MONTHLY", { dayOfMonth: 25 }, TODAY)).toBe(
        "2026-07-25",
      );
    });
    it("rolls to next month when the day already passed", () => {
      expect(nextDueDate("MONTHLY", { dayOfMonth: 10 }, TODAY)).toBe(
        "2026-08-10",
      );
    });
    it("clamps day 31 to the last day of a shorter month", () => {
      // From 2026-02-05, day 31 → Feb has 28 in 2026.
      expect(nextDueDate("MONTHLY", { dayOfMonth: 31 }, "2026-02-05")).toBe(
        "2026-02-28",
      );
    });
  });

  describe("YEARLY", () => {
    it("returns this year when the month/day is still ahead", () => {
      expect(
        nextDueDate("YEARLY", { yearlyMonth: 12, dayOfMonth: 25 }, TODAY),
      ).toBe("2026-12-25");
    });
    it("rolls to next year when the date already passed", () => {
      expect(
        nextDueDate("YEARLY", { yearlyMonth: 1, dayOfMonth: 1 }, TODAY),
      ).toBe("2027-01-01");
    });
    it("returns today when it's the exact yearly date", () => {
      expect(
        nextDueDate("YEARLY", { yearlyMonth: 7, dayOfMonth: 21 }, TODAY),
      ).toBe("2026-07-21");
    });
  });
});
