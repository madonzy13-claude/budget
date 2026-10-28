/**
 * investment-type-header.test.tsx — L1 type header (13.1 D-26, Phase 13 UAT
 * test 2): no indent before the name, value only by default, and the tap
 * sum-up mirrors the asset row — "% then amount", then a muted caption
 * "unrealized · realized · share" with sign-coloured figures.
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
        "uitype.cash": "Cash",
        "typeGroup.summaryCaption": "unrealized {u} · realized {r} · share {s}",
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
  it("shows the type name and value only by default", () => {
    renderHeader();
    expect(screen.getByText("Stocks & ETFs")).toBeInTheDocument();
    expect(screen.getByText("80,000")).toBeInTheDocument();
    expect(screen.queryByText("+51,000")).toBeNull();
    expect(screen.queryByText("+53.7%")).toBeNull();
    expect(screen.getByTestId("type-handle")).toBeInTheDocument();
  });

  it("has no realized sub-line and no indent before the name", () => {
    renderHeader();
    expect(screen.queryByTestId("investment-type-realized-stocks")).toBeNull();
    const name = screen.getByText("Stocks & ETFs");
    for (
      let el: HTMLElement | null = name;
      el && !el.dataset.testid;
      el = el.parentElement
    )
      expect(el.className).not.toMatch(/(^|\s)(pl|ml|ps|ms)-/);
  });

  it("tap shows % before the amount, then the unrealized · realized · share caption", () => {
    renderHeader();
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    const sum = screen.getByTestId("investment-type-split-stocks");
    const line1 = sum.querySelector("[data-pl-line]")!;
    expect(line1.textContent).toMatch(/^\+53\.7%\s*\+51,000$/);
    const cap = sum.querySelector("[data-pl-caption]")!;
    expect(cap).toHaveTextContent(
      "unrealized +22,800 · realized +28,200 · share 60.0%",
    );
    const figs = cap.querySelectorAll("[data-signed]");
    expect(figs[0]!.getAttribute("style")).toContain("var(--trading-up)");
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("pct null renders a muted dash in the sum-up", () => {
    renderHeader({ pl: pl({ pct: null }) });
    fireEvent.click(screen.getByTestId("investment-group-toggle-stocks"));
    expect(screen.getByText("—").getAttribute("style")).toContain(
      "var(--muted-strong)",
    );
  });

  it("chevron calls onToggle and reflects expanded", () => {
    const { onToggle } = renderHeader({ expanded: false });
    const chev = screen.getByTestId("investment-group-chevron-stocks");
    expect(chev).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chev);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // UAT 13.1 test 3: tap anywhere but the chevron / handle shows the sum-up.
  it("tapping the name or empty header space toggles the sum-up", () => {
    renderHeader();
    fireEvent.click(screen.getByText("Stocks & ETFs"));
    expect(screen.getByTestId("investment-type-split-stocks")).toBeTruthy();
    fireEvent.click(screen.getByTestId("investment-group-stocks"));
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("the chevron and the drag handle never toggle the sum-up", () => {
    const { onToggle } = renderHeader();
    fireEvent.click(screen.getByTestId("investment-group-chevron-stocks"));
    fireEvent.click(screen.getByTestId("type-handle"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("investment-type-split-stocks")).toBeNull();
  });

  it("Enter on the header toggles the sum-up", () => {
    renderHeader();
    fireEvent.keyDown(screen.getByTestId("investment-group-toggle-stocks"), {
      key: "Enter",
    });
    expect(screen.getByTestId("investment-type-split-stocks")).toBeTruthy();
  });

  // UAT 13.1 test 3: cash has no profit by design.
  it("cash shows no P/L line and no caption when tapped", () => {
    renderHeader({
      uiType: "cash",
      pl: pl({
        pct: null,
        unrealizedCents: 0,
        realizedCents: 0,
        totalPLCents: 0,
      }),
    });
    fireEvent.click(screen.getByTestId("investment-group-toggle-cash"));
    expect(document.querySelector("[data-pl-line]")).toBeNull();
    expect(document.querySelector("[data-pl-caption]")).toBeNull();
  });
});
