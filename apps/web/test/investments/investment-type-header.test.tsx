/**
 * investment-type-header.test.tsx — Phase 13 type group header (D-13..D-16):
 * value · total P/L (amount + % over lifetime cost), realized sub-line only
 * when realized ≠ 0, tap on the value area toggles the P/L split.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestmentTypeHeader } from "../../src/components/budgeting/wallets-tab/investment-type-header";
import type { TypeGroupPL } from "../../src/lib/investment-type-groups";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "uitype.stocks": "Stocks & ETFs",
        "uitype.crypto": "Crypto",
        "typeGroup.inclRealized": "incl. realized {amount}",
        "typeGroup.unrealized": "Unrealized",
        "typeGroup.realized": "Realized",
        "typeGroup.totalPl": "Total P/L",
        "typeGroup.lifetimeReturn": "Lifetime return",
        "group.headerAria": "{name}, {pct} of portfolio. {state}.",
        "group.expanded": "Expanded",
        "group.collapsed": "Collapsed",
        plAria: "{value} profit/loss",
      };
      let s = map[key] ?? key;
      if (params)
        for (const [k, v] of Object.entries(params))
          s = s.replace(`{${k}}`, String(v));
      return s;
    },
  useLocale: () => "en",
}));

const pl = (over: Partial<TypeGroupPL> = {}): TypeGroupPL => ({
  valueBudgetCents: 8_000_000,
  unrealizedCents: 2_280_000,
  realizedCents: 2_820_000,
  totalPLCents: 5_100_000,
  lifetimeCostCents: 9_500_000,
  pct: 53.68,
  ...over,
});

function renderHeader(
  over: Partial<Parameters<typeof InvestmentTypeHeader>[0]> = {},
) {
  const onToggle = vi.fn();
  render(
    <InvestmentTypeHeader
      uiType="stocks"
      budgetCurrency="PLN"
      pl={pl()}
      portfolioPct={60}
      expanded
      onToggle={onToggle}
      dragHandle={<span data-testid="type-handle" />}
      {...over}
    />,
  );
  return { onToggle };
}

describe("InvestmentTypeHeader", () => {
  it("shows type name, value and total P/L amount + %", () => {
    renderHeader();
    expect(screen.getByText("Stocks & ETFs")).toBeInTheDocument();
    expect(screen.getByText("80,000")).toBeInTheDocument();
    expect(screen.getByText("+51,000")).toBeInTheDocument();
    expect(screen.getByText("+53.7%")).toBeInTheDocument();
    expect(screen.getByTestId("type-handle")).toBeInTheDocument();
  });

  it("realized sub-line shown when realized ≠ 0, colored by sign", () => {
    renderHeader();
    const sub = screen.getByTestId("investment-type-realized-stocks");
    expect(sub).toHaveTextContent("incl. realized +28,200");
    expect(sub.querySelector("[data-signed]")!.getAttribute("style")).toContain(
      "var(--trading-up)",
    );
  });

  it("no realized sub-line when realized is 0", () => {
    renderHeader({ pl: pl({ realizedCents: 0 }) });
    expect(screen.queryByTestId("investment-type-realized-stocks")).toBeNull();
  });

  it("pct null renders a muted dash", () => {
    renderHeader({ pl: pl({ pct: null }) });
    expect(screen.getByText("—").getAttribute("style")).toContain(
      "var(--muted-strong)",
    );
  });

  it("tapping the value area toggles the P/L split", () => {
    renderHeader();
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    const split = screen.getByTestId("investment-type-split-stocks");
    expect(split).toHaveTextContent("Unrealized");
    expect(split).toHaveTextContent("+22,800");
    expect(split).toHaveTextContent("Realized");
    expect(split).toHaveTextContent("Total P/L");
    expect(split).toHaveTextContent("Lifetime return");
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("chevron calls onToggle and reflects expanded", () => {
    const { onToggle } = renderHeader({ expanded: false });
    const chev = screen.getByTestId("investment-group-chevron-stocks");
    expect(chev).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chev);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
