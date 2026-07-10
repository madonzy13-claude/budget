/**
 * overview-cards.test.tsx — Vitest + RTL coverage for the five Overview cards
 * (Phase 11, 11-08). Mocks the cards hook with a fixture DTO and asserts: the five
 * cards render, amounts are formatted in default_currency, the capitalization sub-
 * line shows investments, cushion real-months shows one decimal, and overspent
 * lists the top categories.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "cards.availableToSpend": "Available to spend",
      "cards.spentThisMonth": "Spent",
      "cards.leftToSpend": "Upcoming",
      "cards.surplus": "Surplus",
      "cards.deficit": "Deficit",
      "cards.spendNeutral": "No upcoming income",
      "cards.retirementRunway": "If you retire now",
      "cards.retirementSub": "at your normal planned spending",
      "cards.flipToRetirement": "Capitalization",
      "cards.years": "{count} years",
      "cards.months": "{count} months",
      "cards.and": "and",
      "cards.retirementInflation": "incl. {pct}% annual inflation",
      "cards.unitY": "y",
      "cards.unitM": "m",
      "cards.unitD": "d",
      "cards.overspentMotivation": "Good job — keep it up!",
      "cards.reservesNeeded": "Needed",
      "cards.reservesOkNote": "Needed {amount}",
      "cards.reservesShortNote": "Not enough. {amount} needed",
      "cards.reservesSurplusNote": "Too much. Only {amount} needed",
      "cards.cushionSaved": "Saved",
      "cards.cushionNeeded": "Needed",
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
      "cards.sinceYesterday": "since yesterday",
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

const mockWealth = vi.fn(() => ({ data: undefined }));
vi.mock("@/hooks/use-overview-wealth", () => ({
  useOverviewWealth: () => mockWealth(),
}));

// Projection drives the available-to-spend dot + surplus/deficit. Default: green,
// $400 surplus (matches the old "Upcoming $400" figure so amount assertions hold).
const mockProjection = vi.fn(() => ({
  data: { spend_health: { good: true, surplus_deficit_cents: "40000" } },
}));
vi.mock("@/hooks/use-projection", () => ({
  useProjection: () => mockProjection(),
}));

import { OverviewCards } from "@/components/budgeting/overview/overview-cards";

const DTO = {
  default_currency: "USD",
  available_to_spend_cents: "124000", // $1,240.00
  spendings: {
    spent_cents: "80000", // $800
    left_cents: "40000", // $400
    wallet_cents: "124000", // $1,240 — shown as the big number
    good: true,
  },
  capitalization_cents: "4218000", // $42,180.00
  investment_value_cents: "1240000", // $12,400.00
  retirement_months: 30 as number | null, // → "2 years and 6 months"
  retirement_inflation_pct: 4.5,
  available_reserves_cents: "350000", // $3,500.00
  reserves: {
    required_cents: "300000", // $3,000 needed
    wallet_cents: "350000",
    status: "ok" as "ok" | "short" | "surplus",
  },
  cushion: {
    enabled: true,
    real_months: 3.0,
    total_cents: "900000",
    required_cents: "1800000", // $18,000 needed
    covered: true,
  },
  overspent: {
    count: 2,
    currency: "USD",
    total_cents: "8000", // $80 total overspend
    top: [
      { category_id: "a", name: "Food", over_amount_cents: "5000" },
      { category_id: "b", name: "Transport", over_amount_cents: "3000" },
    ],
  },
};

describe("OverviewCards", () => {
  // Default: upcoming income exists, +$400 surplus, green dot. Tests that need a
  // different projection set a sticky mockReturnValue (deterministic across renders).
  beforeEach(() => {
    mockProjection.mockReturnValue({
      data: { spend_health: { good: true, surplus_deficit_cents: "40000" } },
    });
  });

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
    // Compact format — whole amounts drop the .00 (parity with spendings).
    expect(screen.getByText("$42,180")).toBeTruthy(); // capitalization hero
    expect(screen.getByText("$1,240")).toBeTruthy(); // wallet cash (have)
    expect(screen.getByText("$800")).toBeTruthy(); // spent this month
    expect(screen.getByText("$400")).toBeTruthy(); // projected surplus (was "Upcoming")
    expect(screen.getByText("$3,500")).toBeTruthy(); // available reserves
    expect(screen.getByText("Needed $3,000")).toBeTruthy(); // reserves needed note
    expect(screen.getByText("incl. investments $12,400")).toBeTruthy();
  });

  it("shows the spend good/bad indicator from the projection (item 1)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    // Default projection mock is good → green check.
    const { unmount } = render(<OverviewCards budgetId="b1" />);
    expect(screen.getByTestId("spend-good")).toBeTruthy();
    unmount();

    // A projection shortfall (good:false) flips the dot to red.
    mockProjection.mockReturnValue({
      data: { spend_health: { good: false, surplus_deficit_cents: "-5000" } },
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByTestId("spend-bad")).toBeTruthy();
  });

  it("shows a grey neutral dot + the old 'upcoming' figure when there's no income", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    mockProjection.mockReturnValue({
      data: { spend_health: { good: null, surplus_deficit_cents: null } },
    });
    render(<OverviewCards budgetId="b1" />);
    // Grey dot, not green/red.
    expect(screen.getByTestId("spend-neutral")).toBeTruthy();
    expect(screen.queryByTestId("spend-good")).toBeNull();
    expect(screen.queryByTestId("spend-bad")).toBeNull();
    // Falls back to the original "Upcoming" line ($400 = left_cents), no surplus row.
    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText("$400")).toBeTruthy();
    expect(screen.queryByTestId("spend-surplus-deficit")).toBeNull();
  });

  it("shows surplus (green) or deficit (red) from the nearest income", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    // Default: income exists, +$400 surplus.
    const { unmount } = render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("Surplus")).toBeTruthy();
    expect(
      screen.getByTestId("spend-surplus-deficit").textContent,
    ).toContain("$400");
    unmount();

    // Negative → Deficit label, magnitude shown (sign conveyed by red color).
    mockProjection.mockReturnValue({
      data: { spend_health: { good: false, surplus_deficit_cents: "-25000" } },
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("Deficit")).toBeTruthy();
    expect(
      screen.getByTestId("spend-surplus-deficit").textContent,
    ).toContain("250");
  });

  it("colors the surplus/deficit value: green >0, white =0, red <0", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const cases: [string, string][] = [
      ["40000", "var(--trading-up)"], // surplus > 0 → green
      ["0", "var(--body-on-dark)"], // exactly 0 → white
      ["-25000", "var(--trading-down)"], // deficit < 0 → red
    ];
    for (const [cents, color] of cases) {
      mockProjection.mockReturnValue({
        data: { spend_health: { good: true, surplus_deficit_cents: cents } },
      });
      const { unmount } = render(<OverviewCards budgetId="b1" />);
      expect(screen.getByTestId("spend-surplus-deficit").style.color).toBe(
        color,
      );
      unmount();
    }
  });

  it("shows the reserves ok/short/surplus indicator (item 3)", () => {
    for (const [status, testid] of [
      ["ok", "reserves-ok"],
      ["short", "reserves-short"],
      ["surplus", "reserves-surplus"],
    ] as const) {
      mockUse.mockReturnValue({
        data: { ...DTO, reserves: { ...DTO.reserves, status } },
        isError: false,
        isPending: false,
      });
      const { unmount } = render(<OverviewCards budgetId="b1" />);
      expect(screen.getByTestId(testid)).toBeTruthy();
      unmount();
    }
  });

  it("shows cushion runway dropping zero components (years/months/days)", () => {
    const cases: [number, string][] = [
      [3.0, "3m"], // whole months, no "0d"
      [6.0, "6m"],
      [5 + 3 / 30.44, "5m 3d"], // 5 months 3 days
      [15, "1y 3m"], // 1 year 3 months
      [0, "0d"], // never empty
    ];
    for (const [real_months, expected] of cases) {
      mockUse.mockReturnValue({
        data: { ...DTO, cushion: { ...DTO.cushion, real_months } },
        isError: false,
        isPending: false,
      });
      const { unmount } = render(<OverviewCards budgetId="b1" />);
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
    }
  });

  it("flags whether the cushion covers the required limit", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const { unmount } = render(<OverviewCards budgetId="b1" />);
    expect(screen.getByTestId("cushion-covered")).toBeTruthy();
    unmount();

    mockUse.mockReturnValue({
      data: { ...DTO, cushion: { ...DTO.cushion, covered: false } },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByTestId("cushion-short")).toBeTruthy();
  });

  it("hides 'incl. investments' when the Investments feature is off", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" investmentsEnabled={false} />);
    expect(screen.queryByText(/incl\. investments/)).toBeNull();
  });

  it("hides the cushion card entirely when cushion is disabled", () => {
    mockUse.mockReturnValue({
      data: { ...DTO, cushion: { ...DTO.cushion, enabled: false } },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.queryByTestId("overview-card-cushion")).toBeNull();
  });

  it("hides the available-reserves card when reserves are disabled", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" reservesEnabled={false} />);
    expect(screen.queryByTestId("overview-card-available-reserves")).toBeNull();
  });

  it("shows the total overspend + category list when over (item 5)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("$80")).toBeTruthy(); // total overspend
    expect(screen.getByText("Food · Transport")).toBeTruthy();
    expect(screen.getByTestId("overspent-bad")).toBeTruthy();
  });

  it("shows the capitalization P/L since yesterday when snapshots exist", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    mockWealth.mockReturnValueOnce({
      data: { grow: { delta_cents: "750000", delta_pct: 9.9 } },
    });
    render(<OverviewCards budgetId="b1" />);
    // P/L stacks on the right: percent and amount on separate lines (item 5).
    expect(screen.getByText(/\+9\.9%/)).toBeTruthy();
    expect(screen.getByText("$7,500")).toBeTruthy();
    expect(screen.getByText("since yesterday")).toBeTruthy();
  });

  it("shows $0 + a motivational line with a green check when nothing overspends", () => {
    mockUse.mockReturnValue({
      data: {
        ...DTO,
        overspent: { count: 0, currency: "USD", total_cents: "0", top: [] },
      },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.getByText("Good job — keep it up!")).toBeTruthy();
    expect(screen.getByTestId("overspent-ok")).toBeTruthy();
  });

  it("shows the retirement runway banner, hidden when planned spend is 0 (item 5)", () => {
    mockUse.mockReturnValue({ data: DTO, isError: false, isPending: false });
    const { unmount } = render(<OverviewCards budgetId="b1" />);
    expect(screen.getByTestId("overview-card-retirement")).toBeTruthy();
    // 30 months → full localized "2 years and 6 months" on the flip back.
    expect(screen.getByText("2 years and 6 months")).toBeTruthy();
    unmount();

    mockUse.mockReturnValue({
      data: { ...DTO, retirement_months: null },
      isError: false,
      isPending: false,
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.queryByTestId("overview-card-retirement")).toBeNull();
  });

  it("rounds the capitalization + P/L (no cents) so large values fit (item 1)", () => {
    mockUse.mockReturnValue({
      data: { ...DTO, capitalization_cents: "707513656" }, // $7,075,136.56
      isError: false,
      isPending: false,
    });
    mockWealth.mockReturnValueOnce({
      data: { grow: { delta_cents: "706753656", delta_pct: 92993.9 } },
    });
    render(<OverviewCards budgetId="b1" />);
    expect(screen.getByText("$7,075,137")).toBeTruthy(); // rounded, no cents
    expect(screen.getByText("$7,067,537")).toBeTruthy(); // P/L rounded
  });
});
