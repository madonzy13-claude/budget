/**
 * recurring-rules-list.test.tsx — the amount uses a short currency sign ($, kr,
 * zł, ₴) and the next-due date renders day-first ("13 Jul 2026").
 */
import { describe, it, expect } from "vitest";
import {
  moneyForList,
  sortRulesByUpcoming,
} from "@/components/budgeting/recurring-rules-list";
import { formatShortDate } from "@/lib/format-date";

describe("sortRulesByUpcoming", () => {
  it("orders by soonest next-due date first", () => {
    const rules = [
      { id: "c", nextDueDate: "2026-09-01" },
      { id: "a", nextDueDate: "2026-07-05" },
      { id: "b", nextDueDate: "2026-08-15" },
    ];
    expect(sortRulesByUpcoming(rules).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("does not mutate the input", () => {
    const rules = [
      { id: "b", nextDueDate: "2026-08-15" },
      { id: "a", nextDueDate: "2026-07-05" },
    ];
    sortRulesByUpcoming(rules);
    expect(rules.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("moneyForList (recurring amount, short currency)", () => {
  it("uses the narrow symbol and drops a .00 fraction", () => {
    expect(moneyForList("1500", "USD", "en")).toBe("$1,500");
    expect(moneyForList("1500.50", "USD", "en")).toBe("$1,500.50");
  });
  it("renders a short sign (kr, zł, ₴) not the ISO code", () => {
    expect(moneyForList("700", "SEK", "en")).toContain("kr");
    expect(moneyForList("700", "SEK", "en")).not.toContain("SEK");
    expect(moneyForList("700", "PLN", "en")).toContain("zł");
    expect(moneyForList("700", "UAH", "en")).toContain("₴");
  });
});

describe("formatShortDate (next-due date)", () => {
  it("renders day-first: '13 Jul 2026'", () => {
    expect(formatShortDate("2026-07-13", "en")).toBe("13 Jul 2026");
  });
  it("is day-first even in month-first English", () => {
    expect(formatShortDate("2026-01-05", "en")).toBe("5 Jan 2026");
  });
  it("returns the raw string for an unparseable date", () => {
    expect(formatShortDate("not-a-date", "en")).toBe("not-a-date");
  });
});
