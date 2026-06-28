/**
 * overview-cards.test.tsx — Vitest + RTL coverage for the five Overview cards
 * (Phase 11, 11-08). Mocks the cards hook with a fixture DTO and asserts: the five
 * cards render, amounts are formatted in default_currency, the capitalization sub-
 * line shows investments, cushion real-months shows one decimal, and overspent
 * lists the top categories.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "cards.availableToSpend": "Available to spend",
      "cards.capitalization": "Capitalization",
      "cards.capitalizationSub": "incl. investments {amount}",
      "cards.overspent": "Overspent this month",
      "cards.overspentCount": "{count} categories",
      "cards.onBudget": "On budget",
      "cards.cushion": "Cushion",
      "cards.cushionMonths": "{months} mo",
      "cards.cushionOff": "Cushion off",
      "cards.availableReserves": "Available reserves",
      "cards.realMonths": "real months",
      "empty.planned": "No activity in this range.",
    };
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(new RegExp(`{${k}}`, "g"), String(v)),
      tpl,
    );
  },
}));

const mockUse = vi.fn();
vi.mock("@/hooks/use-overview-cards", () => ({
  useOverviewCards: () => mockUse(),
}));

import { OverviewCards } from "@/components/budgeting/overview/overview-cards";

const DTO = {
  default_currency: "USD",
  available_to_spend_cents: "124000", // $1,240.00
  capitalization_cents: "4218000", // $42,180.00
  investment_value_cents: "1240000", // $12,400.00
  available_reserves_cents: "350000", // $3,500.00
  cushion: { enabled: true, real_months: 3.0, total_cents: "900000" },
  overspent: {
    count: 2,
    currency: "USD",
    top: [
      { category_id: "a", name: "Food", over_amount_cents: "5000" },
      { category_id: "b", name: "Transport", over_amount_cents: "3000" },
    ],
  },
};

describe("OverviewCards", () => {
  it("renders the five cards with default_currency amounts", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" />);

    for (const id of [
      "overview-card-capitalization",
      "overview-card-available-to-spend",
      "overview-card-available-reserves",
      "overview-card-overspent",
      "overview-card-cushion",
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByText("$42,180.00")).toBeTruthy(); // capitalization hero
    expect(screen.getByText("$1,240.00")).toBeTruthy(); // available to spend
    expect(screen.getByText("$3,500.00")).toBeTruthy(); // available reserves
    expect(screen.getByText("incl. investments $12,400.00")).toBeTruthy();
  });

  it("shows cushion real months to one decimal", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("3.0 mo")).toBeTruthy();
  });

  it("lists overspent categories when count > 0", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("2 categories")).toBeTruthy();
    expect(screen.getByText("Food · Transport")).toBeTruthy();
  });

  it("shows the calm 'On budget' state when nothing overspends", () => {
    mockUse.mockReturnValue({
      data: { ...DTO, overspent: { count: 0, currency: "USD", top: [] } },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("On budget")).toBeTruthy();
  });
});
