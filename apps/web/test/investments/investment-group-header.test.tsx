/**
 * investment-group-header.test.tsx — the group header now behaves like a row
 * (Phase 9 group redesign): desktop shows name · budget-ccy · amount · P/L% ·
 * portfolio% inline; the chevron toggles child collapse; tapping the body toggles
 * the mobile P/L + portfolio% line.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestmentGroupHeader } from "../../src/components/budgeting/wallets-tab/investment-group-header";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        plAria: "{value} profit/loss",
        "group.headerAria": "{name}, {pct} of portfolio. {state}.",
        "group.expanded": "Expanded",
        "group.collapsed": "Collapsed",
        "group.dragAria": "Drag to move the {name} group.",
        "group.metricsAria": "Show {name} P/L and portfolio percentage.",
        "row.share": "Share: {pct}",
        "group.portfolioSuffix": "of portfolio",
      };
      let s = map[key] ?? key;
      if (params)
        for (const [k, v] of Object.entries(params))
          s = s.replace(`{${k}}`, String(v));
      return s;
    },
  useLocale: () => "en",
}));

function renderHeader(
  over: Partial<Parameters<typeof InvestmentGroupHeader>[0]> = {},
) {
  const onToggle = vi.fn();
  render(
    <InvestmentGroupHeader
      groupName="Brokerage"
      budgetCurrency="USD"
      valueBudgetCents={3130000}
      plPct={23.4}
      portfolioPct={82.9}
      expanded
      onToggle={onToggle}
      dragHandle={<span data-testid="grp-handle" />}
      {...over}
    />,
  );
  return { onToggle };
}

describe("InvestmentGroupHeader", () => {
  it("renders name, budget currency, amount and the group P/L% + portfolio%", () => {
    renderHeader();
    expect(screen.getByText("Brokerage")).toBeInTheDocument();
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("31,300")).toBeInTheDocument(); // 3,130,000 cents bare
    expect(screen.getByText("+23.4%")).toBeInTheDocument();
    expect(screen.getByText("82.9%")).toBeInTheDocument();
  });

  it("colors a group gain with --trading-up", () => {
    renderHeader({ plPct: 23.4 });
    expect(screen.getByText("+23.4%").className).toContain(
      "text-[var(--trading-up)]",
    );
  });

  it("colors a group loss with --trading-down and a minus sign", () => {
    renderHeader({ plPct: -8.2 });
    expect(screen.getByText("−8.2%").className).toContain(
      "text-[var(--trading-down)]",
    );
  });

  it("renders '—' when the group has no cost basis", () => {
    renderHeader({ plPct: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("the chevron toggles child collapse", () => {
    const { onToggle } = renderHeader();
    fireEvent.click(screen.getByTestId("investment-group-toggle-Brokerage"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders the injected group drag handle", () => {
    renderHeader();
    expect(screen.getByTestId("grp-handle")).toBeInTheDocument();
  });

  it("tapping the body reveals the mobile P/L + portfolio% line", () => {
    renderHeader();
    // desktop-inline copy renders once; tapping the body adds the mobile line.
    const before = screen.getAllByText("+23.4%").length;
    fireEvent.click(
      screen.getByLabelText("Show Brokerage P/L and portfolio percentage."),
    );
    expect(screen.getAllByText("+23.4%").length).toBe(before + 1);
  });
});
