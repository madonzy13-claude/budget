/**
 * column-header-limit-currency.test.tsx — UI-SPEC §2: a category whose currency
 * differs from the budget's shows its limit in its own currency plus a muted
 * "≈" line in the budget currency; a same-currency category is unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, v?: Record<string, string>) => (v?.amount ? `${key}:${v.amount}` : key),
  useLocale: () => "en",
}));

import { ColumnHeader } from "@/components/budgeting/spendings-grid/column-header";

const category = { id: "c1", name: "Travel", iconKey: null, colorKey: null, sortIndex: 0 };
const base = {
  plannedCents: "215000",
  cushionCents: "215000",
  activeBudgetCents: "215000",
  spentCents: "0",
  reserveUsedCents: "0",
  reserveAvailableCents: "0",
  overspentCents: "0",
  balanceCents: "215000",
};

describe("ColumnHeader — limit in the category's currency", () => {
  it("shows the EUR limit with its sign and the ≈ budget-currency line", () => {
    render(
      <ColumnHeader
        category={category}
        summary={{ ...base, limitOriginalCents: "50000", limitCurrency: "EUR" }}
        budgetCurrency="PLN"
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId("column-header-travel-planned").textContent).toContain("€");
    expect(screen.getByTestId("column-limit-equivalent").textContent).toBe("limitEquivalent:2,150");
  });

  it("a same-currency category has no ≈ line", () => {
    render(
      <ColumnHeader
        category={category}
        summary={{ ...base, limitOriginalCents: "215000", limitCurrency: "PLN" }}
        budgetCurrency="PLN"
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.queryByTestId("column-limit-equivalent")).toBeNull();
  });
});
