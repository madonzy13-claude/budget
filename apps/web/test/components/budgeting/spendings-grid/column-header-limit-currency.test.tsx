/**
 * column-header-limit-currency.test.tsx — a category whose currency differs
 * from the budget's reads its WHOLE column in its own currency (user,
 * 261103): spent, limit, reserve and overspent; no "≈" line. Every figure
 * carries its currency sign.
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
  it("reads the whole column in the category's own currency, with no ≈ line", () => {
    render(
      <ColumnHeader
        category={category}
        summary={{
          ...base,
          limitOriginalCents: "50000",
          limitCurrency: "EUR",
          own: {
            currency: "EUR",
            plannedCents: "50000",
            cushionCents: "50000",
            activeBudgetCents: "50000",
            spentCents: "2000",
            reserveUsedCents: "0",
            reserveAvailableCents: "0",
            overspentCents: "0",
            balanceCents: "48000",
          },
        }}
        budgetCurrency="PLN"
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    const planned = screen.getByTestId("column-header-travel-planned").textContent ?? "";
    expect(planned).toContain("20 / €500");
    expect(planned).not.toContain("zł");
    expect(screen.queryByTestId("column-limit-equivalent")).toBeNull();
  });

  // Owner, 261104: a past month keeps its currency (zł here) for every figure,
  // the reserve used and its cap included.
  it("a past month reads every figure in its own currency", () => {
    render(
      <ColumnHeader
        category={category}
        summary={{
          ...base,
          limitOriginalCents: "40000",
          limitCurrency: "PLN",
          own: {
            currency: "PLN",
            plannedCents: "40000",
            cushionCents: "40000",
            activeBudgetCents: "40000",
            spentCents: "45000",
            reserveUsedCents: "500",
            reserveAvailableCents: "1000",
            overspentCents: "300",
            balanceCents: "-5000",
          },
        }}
        budgetCurrency="USD"
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByTestId("column-header-travel-planned").textContent).toContain("zł");
    // The whole column in the month's currency, the reserve cap included.
    expect(screen.getByTestId("column-header-travel-reserves-used").textContent).toBe("5");
    expect(screen.getByTestId("column-header-travel-reserves-available").textContent?.replace(/\s/g, " ")).toContain("10 zł");
    expect(screen.getByTestId("column-header-travel-overspent").textContent?.replace(/\s/g, " ")).toContain("3 zł");
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
