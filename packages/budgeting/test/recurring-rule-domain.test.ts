/**
 * recurring-rule-domain.test.ts — Domain unit tests for RecurringRule
 * Tests: computeNextDueDate, cadence math (Pitfall 6 month-end), domain invariants
 *
 * v1.1 (Plan 02-02): RecurringRule constructor updated — no accountId, no kind, yearlyMonth added.
 */
import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import { RecurringRule } from "../src/domain/recurring-rule";

describe("RecurringRule domain", () => {
  describe("computeNextDueDate — MONTHLY", () => {
    test("anchor=31: Jan 31 → Feb 28 (Pitfall 6 month-end)", () => {
      const rule = new RecurringRule(
        "rule-1",
        "tenant-1",
        null,
        "500",
        "USD",
        "MONTHLY",
        31,
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-01-31"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-01-31"));
      expect(next.toString()).toBe("2026-02-28");
    });

    test("anchor=31: Feb 28 → Mar 31 (anchor preserved)", () => {
      const rule = new RecurringRule(
        "rule-1",
        "tenant-1",
        null,
        "500",
        "USD",
        "MONTHLY",
        31,
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-02-28"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-02-28"));
      expect(next.toString()).toBe("2026-03-31");
    });

    test("anchor=15: Mar 15 → Apr 15 (normal month)", () => {
      const rule = new RecurringRule(
        "rule-1",
        "tenant-1",
        null,
        "500",
        "USD",
        "MONTHLY",
        15,
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-03-15"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-03-15"));
      expect(next.toString()).toBe("2026-04-15");
    });
  });

  describe("computeNextDueDate — WEEKLY", () => {
    test("weekly_dow=1 (Mon): 2026-05-04 → 2026-05-11", () => {
      const rule = new RecurringRule(
        "rule-2",
        "tenant-1",
        null,
        "100",
        "USD",
        "WEEKLY",
        null,
        1,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-04"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-05-04"));
      expect(next.toString()).toBe("2026-05-11");
    });

    test("weekly_dow=0 (Sun): 2026-05-10 → 2026-05-17", () => {
      const rule = new RecurringRule(
        "rule-2",
        "tenant-1",
        null,
        "100",
        "USD",
        "WEEKLY",
        null,
        0,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-10"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-05-10"));
      expect(next.toString()).toBe("2026-05-17");
    });
  });

  describe("computeNextDueDate — DAILY", () => {
    test("DAILY: 2026-05-11 → 2026-05-12", () => {
      const rule = new RecurringRule(
        "rule-daily",
        "tenant-1",
        null,
        "10",
        "USD",
        "DAILY",
        null,
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-11"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-05-11"));
      expect(next.toString()).toBe("2026-05-12");
    });
  });

  describe("computeNextDueDate — YEARLY", () => {
    test("YEARLY March 15: 2026-03-15 → 2027-03-15", () => {
      const rule = new RecurringRule(
        "rule-yearly",
        "tenant-1",
        null,
        "12000",
        "USD",
        "YEARLY",
        15, // cadenceAnchor = day-of-month
        null,
        3,  // yearlyMonth = March
        null,
        true,
        Temporal.PlainDate.from("2026-03-15"),
        new Date(),
        "actor-1",
      );
      const next = rule.computeNextDueDate(Temporal.PlainDate.from("2026-03-15"));
      expect(next.toString()).toBe("2027-03-15");
    });
  });

  describe("domain invariants", () => {
    test("MONTHLY requires cadenceAnchor", () => {
      expect(() => new RecurringRule(
        "rule-3",
        "tenant-1",
        null,
        "100",
        "USD",
        "MONTHLY",
        null, // no anchor — invalid
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-01"),
        new Date(),
        "actor-1",
      )).toThrow();
    });

    test("WEEKLY requires weeklyDow", () => {
      expect(() => new RecurringRule(
        "rule-4",
        "tenant-1",
        null,
        "100",
        "USD",
        "WEEKLY",
        null,
        null, // no dow — invalid
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-01"),
        new Date(),
        "actor-1",
      )).toThrow();
    });

    test("YEARLY requires yearlyMonth + cadenceAnchor", () => {
      expect(() => new RecurringRule(
        "rule-5",
        "tenant-1",
        null,
        "100",
        "USD",
        "YEARLY",
        null, // missing cadenceAnchor
        null,
        null, // missing yearlyMonth
        null,
        true,
        Temporal.PlainDate.from("2026-05-01"),
        new Date(),
        "actor-1",
      )).toThrow();
    });

    test("canEdit always returns ok", () => {
      const rule = new RecurringRule(
        "rule-6",
        "tenant-1",
        null,
        "100",
        "USD",
        "MONTHLY",
        15,
        null,
        null,
        null,
        true,
        Temporal.PlainDate.from("2026-05-01"),
        new Date(),
        "actor-1",
      );
      expect(rule.canEdit().isOk()).toBe(true);
    });
  });
});
