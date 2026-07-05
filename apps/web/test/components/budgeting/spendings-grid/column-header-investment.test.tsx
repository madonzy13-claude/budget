/**
 * column-header-investment.test.tsx — r33: THE Investments category renders a
 * GREEN "overinvested" row (not red "overspent") and dashes its reserve section.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { ColumnHeader } from "@/components/budgeting/spendings-grid/column-header";

const category = {
  id: "cat-inv",
  name: "Investments",
  iconKey: null,
  colorKey: "green",
  sortIndex: 0,
};

function summary(over: string, isInvestment: boolean) {
  return {
    plannedCents: "500000",
    cushionCents: "0",
    activeBudgetCents: "500000",
    spentCents: "600000",
    reserveUsedCents: "0",
    reserveAvailableCents: "0",
    reserveExcluded: true,
    overspentCents: over,
    balanceCents: "0",
    isInvestment,
  };
}

describe("ColumnHeader — Investments (r33)", () => {
  it("labels row3 'overinvested' in green when isInvestment and over the limit", () => {
    render(
      <ColumnHeader
        category={category}
        summary={summary("100000", true)}
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    const cell = screen.getByTestId("column-header-investments-overinvested");
    expect(cell).toBeTruthy();
    // GREEN (trading-up), not red (destructive).
    expect(cell.className).toContain("trading-up");
    expect(cell.className).not.toContain("destructive");
    // The label uses the overinvested i18n key (mock returns the key).
    expect(screen.getByText("row3.overinvested")).toBeTruthy();
  });

  it("normal category keeps red 'overspent'", () => {
    render(
      <ColumnHeader
        category={{ ...category, name: "Food" }}
        summary={summary("100000", false)}
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    const cell = screen.getByTestId("column-header-food-overspent");
    expect(cell.className).toContain("destructive");
    expect(screen.getByText("row3.overspent")).toBeTruthy();
  });

  it("in cushion mode, Investments shows 0 (no cushion) under 'planned (cushion)'", () => {
    const s = summary("100000", true);
    s.plannedCents = "170000";
    s.cushionCents = "0";
    render(
      <ColumnHeader
        category={category}
        summary={s}
        cushionModeEnabled={true}
        onEdit={() => {}}
      />,
    );
    // In cushion mode the displayed value is the 0 cushion, not the smart planned.
    expect(
      screen
        .getByTestId("column-header-investments-planned")
        .textContent?.replace(/\D/g, ""),
    ).toBe("0");
    expect(screen.getByText("row2.plannedCushion")).toBeTruthy();
  });

  it("in cushion mode, a normal category labels row2 'planned (cushion)'", () => {
    const s = summary("0", false);
    s.plannedCents = "80000";
    s.cushionCents = "50000";
    render(
      <ColumnHeader
        category={{ ...category, name: "Food" }}
        summary={s}
        cushionModeEnabled={true}
        onEdit={() => {}}
      />,
    );
    expect(screen.getByText("row2.plannedCushion")).toBeTruthy();
    // Value is the cushion figure (50000 → "500").
    expect(
      screen
        .getByTestId("column-header-food-planned")
        .textContent?.replace(/\D/g, ""),
    ).toBe("500");
  });

  it("dashes the reserve section for the Investments category", () => {
    render(
      <ColumnHeader
        category={category}
        summary={summary("100000", true)}
        cushionModeEnabled={false}
        onEdit={() => {}}
      />,
    );
    const used = screen.getByTestId(
      "column-header-investments-reserves-used",
    );
    expect(used.textContent).toBe("—");
  });
});
