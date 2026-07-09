/**
 * budget-card.test.tsx — Vitest + RTL coverage for the client BudgetCardClient
 * (HOME-01..03, SPA refactor 260616).
 *
 * The card now fetches its summary via useHomeSummary; we seed the React Query
 * cache so the query is isSuccess with the fixture, and assert the rendered card.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TestQueryProvider,
  makeTestQueryClient,
} from "../../setup/query-client";
import { BudgetCardClient } from "@/components/budgeting/budget-card-client";
import type { HomeSummary } from "@/hooks/use-home-summary";

// next-intl client useTranslations → flat key resolver with var interpolation.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      "card.spent": "Spent this month",
      "card.wallets": "Total wallets",
      "card.allOnBudget": "All categories on budget",
      "card.error": "Couldn't load summary. Tap to open.",
    };
    if (key === "card.openAria")
      return `Open ${(vars?.["budgetName"] as string) ?? ""}`;
    if (key === "card.pendingTasksAria")
      return `${(vars?.["count"] as number) ?? 0} pending`;
    return map[key] ?? key;
  },
}));

const baseBudget = {
  id: "b1",
  name: "My Budget",
  kind: "PRIVATE" as const,
  default_currency: "PLN",
  pendingTasksCount: 0,
};

const happySummary: HomeSummary = {
  budgetId: "b1",
  name: "My Budget",
  kind: "PRIVATE",
  default_currency: "PLN",
  display_currency: "PLN",
  spent_current_month: { amount_cents: "123456", currency: "PLN" },
  wallets_value_display_ccy: {
    amount_cents: "1283000",
    currency: "PLN",
    converted_at: "2026-05-12T20:00:00Z",
  },
  top_overspent: [],
};

function renderCard(
  budget = baseBudget,
  summary: HomeSummary | undefined = happySummary,
) {
  const qc = makeTestQueryClient();
  if (summary) qc.setQueryData(["home-summary", budget.id], summary);
  return render(
    <TestQueryProvider client={qc}>
      <BudgetCardClient budget={budget} locale="en" />
    </TestQueryProvider>,
  );
}

describe("BudgetCardClient — header + summary", () => {
  it("renders header with name + 'personal' badge + Lock icon (1 member)", () => {
    // kind-removal: private/shared derives from member_count; 1 member → personal.
    const { container } = renderCard({ ...baseBudget, memberCount: 1 });
    expect(screen.getByText("My Budget")).toBeTruthy();
    expect(screen.getByText("personal")).toBeTruthy();
    expect(container.querySelector("svg.lucide-lock")).toBeTruthy();
  });

  it("renders 'shared' badge + Users icon when member_count > 1", () => {
    const { container } = renderCard({ ...baseBudget, memberCount: 2 });
    expect(screen.getByText("shared")).toBeTruthy();
    expect(container.querySelector("svg.lucide-users")).toBeTruthy();
    expect(container.querySelector("svg.lucide-lock")).toBeNull();
  });

  it("renders formatted current-month spent and total wallets", () => {
    const { container } = renderCard();
    const text = container.textContent ?? "";
    expect(text).toMatch(/1,234\.56/);
    expect(text).toMatch(/12,830/);
    expect(screen.getByText("Spent this month")).toBeTruthy();
    expect(screen.getByText("Total wallets")).toBeTruthy();
  });

  it('renders "All categories on budget" when no overspent categories', () => {
    renderCard();
    expect(screen.getByText("All categories on budget")).toBeTruthy();
  });

  it("renders overspent rows with leading minus sign", () => {
    const { container } = renderCard(baseBudget, {
      ...happySummary,
      top_overspent: [
        {
          category_id: "c1",
          category_name: "Groceries",
          over_amount_cents: "5000",
        },
        {
          category_id: "c2",
          category_name: "Dining out",
          over_amount_cents: "2500",
        },
      ],
    });
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Dining out")).toBeTruthy();
    const minus = Array.from(
      container.querySelectorAll('span[aria-hidden="true"]'),
    ).filter((s) => (s.textContent ?? "").trim() === "–").length;
    expect(minus).toBeGreaterThanOrEqual(2);
  });

  it("wraps the card in exactly one <a> Link to /{locale}/budgets/{id}/overview", () => {
    const { container } = renderCard();
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBe(1);
    expect(anchors[0]?.getAttribute("href")).toBe("/en/budgets/b1/overview");
    expect(anchors[0]?.getAttribute("aria-label")).toBe("Open My Budget");
  });
});

describe("BudgetCardClient — PillBadge corner badge", () => {
  it("pendingTasksCount: 3 → badge text '3' with bg-[var(--trading-down)]", () => {
    const { container } = renderCard({ ...baseBudget, pendingTasksCount: 3 });
    const badge = container.querySelector('[data-testid="pill-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe("3");
    expect(badge!.className).toMatch(/bg-\[var\(--trading-down\)\]/);
  });

  it("pendingTasksCount: 0 → no pill-badge rendered", () => {
    renderCard({ ...baseBudget, pendingTasksCount: 0 });
    expect(screen.queryByTestId("pill-badge")).toBeNull();
  });
});
