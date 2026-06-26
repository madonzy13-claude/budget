/**
 * investment-row.test.tsx — Vitest+RTL tests for InvestmentRow (Phase 9, INV-06/09).
 *
 * Coverage:
 * - Renders the 5 read-only fields (name, currency, value, P/L%, weight%)
 * - Total value rendered from valueCents
 * - P/L sign + color class (trading-up / trading-down)
 * - Cash holding (profitLossPct null) → "—"
 * - Delisted row → opacity-50 + "Delisted" chip
 * - NO inline <input> on the row (sheet-only editing, INV-06)
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestmentRow } from "../../src/components/budgeting/wallets-tab/investment-row";
import type { HoldingDto } from "../../src/hooks/use-investments";

// next-intl mock — relative key lookup with param substitution.
import { vi } from "vitest";
vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "row.delisted": "Delisted",
        "row.editAria": "Edit {name}",
        "row.deleteAria": "Archive {name}",
        "uitype.cash": "Cash",
        "row.share": "Share: {pct}",
        rowExpandAria: "Expand {name}",
        plAria: "{value} profit/loss",
      };
      let s = map[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
  useLocale: () => "en",
}));

function holding(over: Partial<HoldingDto> = {}): HoldingDto {
  return {
    id: "h1",
    name: "AAPL",
    holdingType: "equities",
    uiType: "equity",
    group: null,
    instrumentId: "i1",
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    symbol: null,
    isCustom: false,
    isDelisted: false,
    quantity: "10",
    buyPriceCents: "30000",
    buyCurrency: "USD",
    currentPriceCents: "42000",
    currentPriceCurrency: "USD",
    valueCents: "420000",
    valueInBudgetCents: "420000",
    profitLossPct: 12.4,
    profitLossCents: "120000",
    weightPct: 18,
    sortOrder: 1,
    createdAt: "2026-06-21T00:00:00Z",
    ...over,
  };
}

describe("InvestmentRow", () => {
  it("renders name, currency, value, P/L% and weight%", () => {
    render(<InvestmentRow holding={holding()} />);
    // Name renders in both the mobile + desktop spans (one shown per breakpoint).
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.getByText("4,200")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
    expect(screen.getByText("18.0%")).toBeInTheDocument();
  });

  it("tracked stock → desktop 'TICKER (Name)', mobile shows the ticker", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Apple Inc.",
          symbol: "AAPL",
          holdingType: "equities",
        })}
      />,
    );
    expect(screen.getByText("AAPL (Apple Inc.)")).toBeInTheDocument(); // desktop
    expect(screen.getByText("AAPL")).toBeInTheDocument(); // mobile collapsed
  });

  it("crypto → ticker parsed from the parenthetical name", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Bitcoin (BTC)",
          symbol: "bitcoin",
          holdingType: "crypto",
        })}
      />,
    );
    expect(screen.getByText("BTC (Bitcoin)")).toBeInTheDocument(); // desktop
    expect(screen.getByText("BTC")).toBeInTheDocument(); // mobile
  });

  it("has NO inline input (sheet-only editing, INV-06)", () => {
    render(<InvestmentRow holding={holding()} />);
    const row = screen.getByTestId("holding-row-AAPL");
    expect(row.querySelectorAll("input")).toHaveLength(0);
  });

  it("colors a gain with --trading-up", () => {
    render(<InvestmentRow holding={holding({ profitLossPct: 12.4 })} />);
    const pl = screen.getByText("+12.4%");
    expect(pl.className).toContain("text-[var(--trading-up)]");
  });

  it("colors a loss with --trading-down and a minus sign", () => {
    render(<InvestmentRow holding={holding({ profitLossPct: -8.2 })} />);
    const pl = screen.getByText("−8.2%");
    expect(pl.className).toContain("text-[var(--trading-down)]");
  });

  it("cash → renders 'Cash' (not the stored name), no P/L dash, share still shows", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "EUR Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
        })}
      />,
    );
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    expect(screen.queryByText("EUR Cash")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByText("18.0%")).toBeInTheDocument(); // share / weight
  });

  it("cash expanded → 3 rows: name, a dash (in place of P/L), Share", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "USD Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
          weightPct: 5,
          valueCents: "1000000",
          currentPriceCurrency: "USD",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand USD Cash"));
    // Profit slot shows a dash → card stays a uniform 3 rows.
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Share: 5.0%")).toBeInTheDocument();
  });

  it("mobile expand → 3 rows: name, P/L + money, and localized Share", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Vintage car",
          symbol: null,
          profitLossPct: 50,
          profitLossCents: "1500000",
          weightPct: 13,
          valueCents: "4500000",
          currentPriceCurrency: "USD",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Vintage car"));
    expect(screen.getByText("Share: 13.0%")).toBeInTheDocument();
    // P/L money amount comes straight from the server (+15,000.00), no currency.
    expect(screen.getByText("+15,000")).toBeInTheDocument();
    expect(screen.getAllByText("+50.0%").length).toBeGreaterThan(0); // P/L%
  });

  // 260626 regression: the old plMoney back-derived cost as value/(1+pct/100);
  // at a near-total loss pct rounds to -100.0 → ÷0 → the amount collapsed to "-0".
  // The row now renders the server's profitLossCents, a real number.
  it("expanded P/L money uses server profitLossCents — a near-total loss is real, not '−0'", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "Silver coin",
          symbol: null,
          profitLossPct: -100,
          profitLossCents: "-3449500", // −34,495.00
          valueCents: "161",
          currentPriceCurrency: "EUR",
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Expand Silver coin"));
    expect(screen.getByText("−34,495")).toBeInTheDocument();
    expect(screen.queryByText("−0")).toBeNull();
  });

  it("dims a delisted holding's content but keeps the drag handle full opacity", () => {
    render(
      <InvestmentRow
        holding={holding({ isDelisted: true })}
        dragHandle={<span data-testid="grip" />}
      />,
    );
    // The grip (handle slot) must NOT sit inside any opacity-50 element — a
    // parent's opacity caps its children, so the handle stays usable (09-07-PLAN).
    for (
      let el = screen.getByTestId("grip").parentElement;
      el;
      el = el.parentElement
    ) {
      expect(el.className ?? "").not.toContain("opacity-50");
    }
    // The row content (the tap-to-expand region) IS dimmed; chip still shows.
    expect(screen.getByLabelText("Expand AAPL").className).toContain(
      "opacity-50",
    );
    expect(screen.getByText("Delisted")).toBeInTheDocument();
  });
});
