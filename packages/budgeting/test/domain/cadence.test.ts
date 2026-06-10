import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import { nextOccurrence } from "../../src/domain/cadence";

describe("Cadence Math", () => {
  describe("MONTHLY — month-end preservation (Pitfall 6)", () => {
    test("Jan 31 + 1 month → Feb 28 (clamps to last day of Feb non-leap)", () => {
      const prev = Temporal.PlainDate.from("2026-01-31");
      const result = nextOccurrence(
        { cadence: "MONTHLY", anchorDay: 31 },
        prev,
      );
      expect(result.toString()).toBe("2026-02-28");
    });

    test("Feb 28 + 1 month (anchor=31) → Mar 31 (anchor preserved when month allows)", () => {
      const prev = Temporal.PlainDate.from("2026-02-28");
      const result = nextOccurrence(
        { cadence: "MONTHLY", anchorDay: 31 },
        prev,
      );
      expect(result.toString()).toBe("2026-03-31");
    });

    test("Jan 15 + 1 month (anchor=15) → Feb 15", () => {
      const prev = Temporal.PlainDate.from("2026-01-15");
      const result = nextOccurrence(
        { cadence: "MONTHLY", anchorDay: 15 },
        prev,
      );
      expect(result.toString()).toBe("2026-02-15");
    });

    test("throws when anchorDay missing", () => {
      const prev = Temporal.PlainDate.from("2026-01-31");
      expect(() => nextOccurrence({ cadence: "MONTHLY" }, prev)).toThrow(
        "anchorDay required",
      );
    });
  });

  describe("WEEKLY", () => {
    test("Mon → next Mon (weeklyDow=1)", () => {
      // 2026-05-04 is a Monday (dayOfWeek=1)
      const prev = Temporal.PlainDate.from("2026-05-04");
      const result = nextOccurrence({ cadence: "WEEKLY", weeklyDow: 1 }, prev);
      expect(result.toString()).toBe("2026-05-11");
    });

    test("Sunday (weeklyDow=0 Sun=0 conversion) → next Sunday", () => {
      // 2026-05-03 is a Sunday
      const prev = Temporal.PlainDate.from("2026-05-03");
      const result = nextOccurrence({ cadence: "WEEKLY", weeklyDow: 0 }, prev);
      expect(result.toString()).toBe("2026-05-10");
    });

    test("Wed → next Wed (weeklyDow=3)", () => {
      // 2026-05-06 is a Wednesday
      const prev = Temporal.PlainDate.from("2026-05-06");
      const result = nextOccurrence({ cadence: "WEEKLY", weeklyDow: 3 }, prev);
      expect(result.toString()).toBe("2026-05-13");
    });

    test("throws when weeklyDow missing", () => {
      const prev = Temporal.PlainDate.from("2026-05-04");
      expect(() => nextOccurrence({ cadence: "WEEKLY" }, prev)).toThrow(
        "weeklyDow required",
      );
    });
  });

  describe("DAILY", () => {
    test("DAILY: 2026-05-11 + 1 day → 2026-05-12", () => {
      const prev = Temporal.PlainDate.from("2026-05-11");
      const result = nextOccurrence({ cadence: "DAILY" }, prev);
      expect(result.toString()).toBe("2026-05-12");
    });

    test("DAILY: advances by exactly 1 day (month boundary)", () => {
      const prev = Temporal.PlainDate.from("2026-01-31");
      const result = nextOccurrence({ cadence: "DAILY" }, prev);
      expect(result.toString()).toBe("2026-02-01");
    });

    test("DAILY: ignores anchorDay if provided", () => {
      const prev = Temporal.PlainDate.from("2026-05-11");
      // anchorDay is irrelevant for DAILY; should not affect result
      const result = nextOccurrence({ cadence: "DAILY", anchorDay: 15 }, prev);
      expect(result.toString()).toBe("2026-05-12");
    });

    test("DAILY: ignores weeklyDow if provided", () => {
      const prev = Temporal.PlainDate.from("2026-05-11");
      const result = nextOccurrence({ cadence: "DAILY", weeklyDow: 3 }, prev);
      expect(result.toString()).toBe("2026-05-12");
    });
  });

  describe("YEARLY", () => {
    test("YEARLY March 15: 2026-03-15 → 2027-03-15", () => {
      const prev = Temporal.PlainDate.from("2026-03-15");
      const result = nextOccurrence(
        { cadence: "YEARLY", yearlyMonth: 3, anchorDay: 15 },
        prev,
      );
      expect(result.toString()).toBe("2027-03-15");
    });

    test("YEARLY leap clamp: Feb 29 → 2025-02-28 (non-leap year)", () => {
      // 2024-02-29 is valid (leap year); next year is 2025 (non-leap) → clamp to Feb 28
      const prev = Temporal.PlainDate.from("2024-02-29");
      const result = nextOccurrence(
        { cadence: "YEARLY", yearlyMonth: 2, anchorDay: 29 },
        prev,
      );
      expect(result.toString()).toBe("2025-02-28");
    });

    test("YEARLY: anchorDay clamp to month length for non-Feb months", () => {
      // April has 30 days; anchorDay=31 should clamp to Apr 30
      const prev = Temporal.PlainDate.from("2026-04-30");
      const result = nextOccurrence(
        { cadence: "YEARLY", yearlyMonth: 4, anchorDay: 31 },
        prev,
      );
      expect(result.toString()).toBe("2027-04-30");
    });

    test("YEARLY: throws if yearlyMonth missing", () => {
      const prev = Temporal.PlainDate.from("2026-01-01");
      expect(() =>
        nextOccurrence({ cadence: "YEARLY", anchorDay: 15 }, prev),
      ).toThrow("yearlyMonth required");
    });

    test("YEARLY: throws if anchorDay missing", () => {
      const prev = Temporal.PlainDate.from("2026-01-01");
      expect(() =>
        nextOccurrence({ cadence: "YEARLY", yearlyMonth: 3 }, prev),
      ).toThrow("anchorDay required");
    });
  });

  test("throws on unsupported cadence", () => {
    const prev = Temporal.PlainDate.from("2026-01-01");
    expect(() =>
      nextOccurrence({ cadence: "BADCADENCE" as "DAILY" }, prev),
    ).toThrow("Unsupported cadence");
  });
});
