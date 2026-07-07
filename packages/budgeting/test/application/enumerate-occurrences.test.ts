// packages/budgeting/test/application/enumerate-occurrences.test.ts
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import { enumerateOccurrences } from "@budget/budgeting/src/application/compute-cashflow-projection";

const D = (s: string) => Temporal.PlainDate.from(s);

describe("enumerateOccurrences", () => {
  test("MONTHLY anchor 25: seeded at rule nextDueDate, only strictly-future in window", () => {
    // seed = rule's nextDueDate (2026-07-25), not "today" (2026-07-15).
    // nextOccurrence({MONTHLY,anchorDay:25}, 2026-07-15) → 2026-08-25 (adds 1 month),
    // so seeding at today never reaches 2026-07-25. Seed must be the nextDueDate.
    const out = enumerateOccurrences(
      { cadence: "MONTHLY", anchorDay: 25 },
      {
        seed: D("2026-07-25"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual(["2026-07-25", "2026-08-25"]);
  });

  test("bill seeded from a past nextDueDate advances past today", () => {
    const out = enumerateOccurrences(
      { cadence: "MONTHLY", anchorDay: 1 },
      {
        seed: D("2026-07-01"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual(["2026-08-01"]);
  });

  test("WEEKLY enumerates each matching day", () => {
    const out = enumerateOccurrences(
      { cadence: "WEEKLY", weeklyDow: 1 }, // Mondays
      {
        seed: D("2026-07-15"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-07-31"),
      },
    );
    expect(out).toEqual(["2026-07-20", "2026-07-27"]);
  });

  test("empty when no occurrence in window", () => {
    const out = enumerateOccurrences(
      { cadence: "YEARLY", anchorDay: 10, yearlyMonth: 12 },
      {
        seed: D("2026-07-15"),
        afterExclusive: D("2026-07-15"),
        end: D("2026-08-31"),
      },
    );
    expect(out).toEqual([]);
  });
});
