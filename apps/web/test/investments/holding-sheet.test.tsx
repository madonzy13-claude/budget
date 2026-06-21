/**
 * holding-sheet.test.tsx — Vitest+RTL tests for the type-first HoldingSheet (9.1).
 *
 * Coverage:
 * - Cash type: currency + amount only (no buy price / quantity)
 * - Tracked type: current price read-only (no editable amount), buy price + quantity
 * - Precious metals type: metal + kind + UoM fields present
 * - Dirty close fires the discard-confirm dialog
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
    uiType: "equity",
    group: null,
    instrumentId: "i1",
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    isCustom: false,
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

describe("HoldingSheet — type-first", () => {
  it("cash type shows currency + amount only (no buy price / quantity)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "EUR Cash",
        })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-amount")).toBeInTheDocument();
    expect(screen.queryByTestId("holding-sheet-buy-price")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    expect(screen.getByTestId("holding-sheet-group")).toBeInTheDocument();
  });

  it("tracked type: read-only current price, editable buy price + quantity", () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.getByTestId("holding-sheet-buy-price")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-quantity")).toBeInTheDocument();
    expect(
      screen.getByTestId("holding-sheet-current-price"),
    ).toBeInTheDocument();
  });

  it("precious metals type reveals metal + kind + UoM fields", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "commodity",
          uiType: "precious_metals",
          metal: "gold",
          metalKind: "coin",
          unitOfMeasure: "g",
          name: "Krugerrand",
        })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-metal")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-kind")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-uom")).toBeInTheDocument();
  });

  it("dirty close fires the discard-confirm dialog", async () => {
    render(<HoldingSheet {...baseProps} mode="create" holding={null} />);
    // Default type is tracked → the Asset input carries the holding-sheet-name id.
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Apple" },
    });
    fireEvent.click(screen.getByText("sheet.cancel"));
    await waitFor(() => {
      expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    });
  });
});
