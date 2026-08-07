/**
 * scheduled-payments-list.test.tsx — the amount uses a short currency sign ($, kr,
 * zł, ₴) and the next-due date renders day-first ("13 Jul 2026").
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
import {
  moneyForList,
  sortRulesByUpcoming,
  ScheduledPaymentsList,
} from "@/components/budgeting/scheduled-payments-list";
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

describe("moneyForList (scheduled amount, short currency)", () => {
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

describe("sortRulesByUpcoming — payments that are over", () => {
  // A one-time payment that has happened is over, not gone: it sinks to the
  // bottom and reads as disabled rather than disappearing (user, 260807).
  it("puts everything still running above everything retired", () => {
    const rules = [
      { id: "done-early", nextDueDate: "2026-01-01", active: false },
      { id: "live-late", nextDueDate: "2027-12-01", active: true },
      { id: "live-soon", nextDueDate: "2026-09-01", active: true },
      { id: "done-late", nextDueDate: "2026-06-01", active: false },
    ];
    expect(sortRulesByUpcoming(rules).map((r) => r.id)).toEqual([
      "live-soon",
      "live-late",
      "done-early",
      "done-late",
    ]);
  });

  it("still orders the retired ones among themselves by date", () => {
    const rules = [
      { id: "b", nextDueDate: "2026-06-01", active: false },
      { id: "a", nextDueDate: "2026-01-01", active: false },
    ];
    expect(sortRulesByUpcoming(rules).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("treats a row with no active flag as running", () => {
    // findById and the offline cache both predate the flag; a missing one must
    // not silently bury a live payment at the bottom of the list.
    const rules = [
      { id: "flagless", nextDueDate: "2027-01-01" },
      { id: "retired", nextDueDate: "2026-01-01", active: false },
    ];
    expect(sortRulesByUpcoming(rules).map((r) => r.id)).toEqual([
      "flagless",
      "retired",
    ]);
  });
});

describe("ScheduledPaymentsList — a payment that is over", () => {
  const base = {
    id: "p1",
    tenantId: "t1",
    categoryId: null,
    amount: "250",
    currency: "PLN",
    kind: "SPENDING",
    cadence: "ONCE" as const,
    cadenceAnchor: null,
    weeklyDow: null,
    yearlyMonth: null,
    note: "New sofa",
    nextDueDate: "2026-01-15",
    active: true,
  };
  const render1 = (over: Record<string, unknown>) =>
    render(<ScheduledPaymentsList rules={[{ ...base, ...over }]} />);

  it("marks a retired row so it can read as disabled", () => {
    const { container } = render1({ active: false });
    expect(container.querySelector('[data-retired="true"]')).toBeTruthy();
  });

  it("leaves a live row unmarked", () => {
    const { container } = render1({ active: true });
    expect(container.querySelector('[data-retired="true"]')).toBeNull();
  });

  it("still offers edit on a retired payment whose money has not moved", () => {
    // Moving its date brings the draft back, so retirement alone is not a lock
    // — the household can still change when it happens (user, 260807).
    render1({ active: false, hasConfirmedDraft: false });
    expect(screen.queryByLabelText("list.editButton")).toBeTruthy();
  });

  it("drops edit once the draft has been confirmed", () => {
    // The money moved. Editing the payment now would be editing history; the
    // household can still remove it.
    render1({ hasConfirmedDraft: true });
    expect(screen.queryByLabelText("list.editButton")).toBeNull();
    expect(screen.queryByLabelText("delete.title")).toBeTruthy();
  });
});
