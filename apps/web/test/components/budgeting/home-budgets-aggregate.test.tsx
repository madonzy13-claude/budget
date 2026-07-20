/**
 * home-budgets-aggregate.test.tsx — Task 16: the explicit list view (?list=1,
 * ≥2 budgets) renders the cross-budget AggregateOverview instead of the
 * per-budget BudgetCardClient grid.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Force the ?list=1 branch (r35) via the same next/navigation mock shape the
// component consumes — no new component prop invented.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === "list" ? "1" : null) }),
}));

vi.mock("@/hooks/use-active-budgets", () => ({
  useActiveBudgets: () => ({
    data: [
      {
        id: "b1",
        name: "Home",
        default_currency: "USD",
        memberCount: 2,
        pendingTasksCount: 0,
      },
      {
        id: "b2",
        name: "Travel",
        default_currency: "EUR",
        memberCount: 1,
        pendingTasksCount: 0,
      },
    ],
    isSuccess: true,
    isPending: false,
  }),
}));

vi.mock("@/components/budgeting/aggregate/aggregate-overview", () => ({
  AggregateOverview: () => <div data-testid="aggregate-overview" />,
}));

vi.mock("@/components/budgeting/budget-card-client", () => ({
  BudgetCardClient: ({ budget }: { budget: { id: string } }) => (
    <div data-testid={`budget-card-${budget.id}`} />
  ),
}));

import { HomeBudgetsClient } from "@/components/budgeting/home-budgets-client";

describe("HomeBudgetsClient list view", () => {
  it("renders the aggregate overview for ≥2 budgets in the list view, not the card grid", () => {
    render(<HomeBudgetsClient locale="en" />);
    expect(screen.getByTestId("aggregate-overview")).toBeTruthy();
    expect(screen.queryByTestId("budget-card-b1")).toBeNull();
    expect(screen.queryByTestId("budget-card-b2")).toBeNull();
  });
});
