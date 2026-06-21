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
import { render, screen } from "@testing-library/react";
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
    weightPct: 18,
    sortOrder: 1,
    createdAt: "2026-06-21T00:00:00Z",
    ...over,
  };
}

describe("InvestmentRow", () => {
  it("renders name, currency, value, P/L% and weight%", () => {
    render(<InvestmentRow holding={holding()} />);
    expect(screen.getByText("AAPL")).toBeInTheDocument();
    expect(screen.getAllByText("USD").length).toBeGreaterThan(0);
    expect(screen.getByText("4,200")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
    expect(screen.getByText("18.0%")).toBeInTheDocument();
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

  it("renders '—' for a cash holding with no P/L", () => {
    render(
      <InvestmentRow
        holding={holding({
          name: "EUR Cash",
          holdingType: "cash_fx",
          profitLossPct: null,
        })}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("dims a delisted row (opacity-50) and shows the Delisted chip", () => {
    render(<InvestmentRow holding={holding({ isDelisted: true })} />);
    const row = screen.getByTestId("holding-row-AAPL");
    expect(row.className).toContain("opacity-50");
    expect(screen.getByText("Delisted")).toBeInTheDocument();
  });
});
