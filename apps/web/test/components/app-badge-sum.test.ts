import { describe, it, expect } from "vitest";

import { sumBadgeCount } from "@/components/common/app-badge";

// r37: per-budget app-icon badge is OPT-IN (default OFF — user must enable it).
describe("sumBadgeCount", () => {
  const budgets = [
    { id: "a", pendingTasksCount: 3 },
    { id: "b", pendingTasksCount: 5 },
  ];

  it("counts NOTHING by default (badge is opt-in / OFF)", () => {
    expect(sumBadgeCount(budgets, {})).toBe(0);
  });

  it("counts only budgets the user explicitly enabled", () => {
    expect(sumBadgeCount(budgets, { b: true })).toBe(5);
    expect(sumBadgeCount(budgets, { a: true, b: true })).toBe(8);
  });

  it("excludes budgets explicitly disabled", () => {
    expect(sumBadgeCount(budgets, { a: true, b: false })).toBe(3);
  });

  it("treats a missing pending count as zero", () => {
    expect(sumBadgeCount([{ id: "a" }], { a: true })).toBe(0);
  });
});
