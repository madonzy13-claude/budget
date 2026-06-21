/**
 * holding-sheet.test.tsx — Vitest+RTL tests for HoldingSheet (Phase 9, INV-05/06).
 *
 * Coverage:
 * - Cash variant: only currency + amount + group (no buy price / current price / quantity)
 * - Tracked variant: current price is read-only (no editable amount input)
 * - Dirty close fires the discard-confirm dialog (D-18)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HoldingSheet } from "../../src/components/budgeting/wallets-tab/holding-sheet";
import type { HoldingDto } from "../../src/hooks/use-investments";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      let s = key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
  useLocale: () => "en",
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("../../src/hooks/use-create-holding", () => ({
  useCreateHolding: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../src/hooks/use-update-holding", () => ({
  useUpdateHolding: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }));

vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({
    value,
    onSelect,
  }: {
    value?: string;
    onSelect: (v: string) => void;
  }) => (
    <select
      data-testid="currency-stub"
      value={value}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
    </select>
  ),
}));

function holding(over: Partial<HoldingDto> = {}): HoldingDto {
  return {
    id: "h1",
    name: "Test",
    holdingType: "equities",
    group: null,
    instrumentId: null,
    isCustom: true,
    isDelisted: false,
    quantity: "1",
    buyPriceCents: "10000",
    buyCurrency: "USD",
    currentPriceCents: "12000",
    currentPriceCurrency: "USD",
    valueCents: "12000",
    valueInBudgetCents: "12000",
    profitLossPct: 20,
    weightPct: 100,
    sortOrder: 1,
    createdAt: "2026-06-21T00:00:00Z",
    ...over,
  };
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  budgetId: "b1",
  budgetCurrency: "USD",
  groups: ["Broker A"],
};

describe("HoldingSheet — cash variant", () => {
  it("shows ONLY currency + amount + group (no buy price / quantity)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({ holdingType: "cash_fx", name: "EUR Cash" })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-amount")).toBeInTheDocument();
    expect(screen.queryByTestId("holding-sheet-buy-price")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    expect(screen.getByTestId("holding-sheet-group")).toBeInTheDocument();
  });
});

describe("HoldingSheet — tracked variant", () => {
  it("renders current price read-only (no editable amount input)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({ instrumentId: "i1", holdingType: "equities" })}
      />,
    );
    // Tracked: current price is a read-only display, buy price + quantity edit.
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.getByTestId("holding-sheet-buy-price")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-quantity")).toBeInTheDocument();
  });
});

describe("HoldingSheet — dirty close", () => {
  it("fires the discard-confirm dialog when closing with unsaved changes", async () => {
    render(<HoldingSheet {...baseProps} mode="create" holding={null} />);
    // Type a name → form becomes dirty.
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Vintage Watch" },
    });
    // Click Cancel → discard-confirm appears.
    fireEvent.click(screen.getByText("sheet.cancel"));
    await waitFor(() => {
      expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    });
  });
});
