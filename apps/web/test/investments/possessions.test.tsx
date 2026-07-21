/**
 * possessions.test.tsx — Vitest+RTL for the Possessions wallet section.
 *
 * Possessions ride the holdings endpoint (holdingType "possession") but render in
 * their own section with a bespoke thin sheet: name + currency + single amount +
 * a per-item icon. Row shows the icon + name + value. The Investments section
 * filters possessions out; this section filters everything else out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PossessionSheet } from "../../src/components/budgeting/wallets-tab/possession-sheet";
import { PossessionRow } from "../../src/components/budgeting/wallets-tab/possession-row";
import { possessionIconByName } from "../../src/lib/possession-icons";
import type { HoldingDto } from "../../src/hooks/use-investments";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const createMutate = vi.fn();
const updateMutate = vi.fn();
vi.mock("../../src/hooks/use-create-holding", () => ({
  useCreateHolding: () => ({ mutate: createMutate }),
}));
vi.mock("../../src/hooks/use-update-holding", () => ({
  useUpdateHolding: () => ({ mutate: updateMutate }),
}));
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
    id: "p1",
    name: "Family car",
    holdingType: "possession",
    uiType: "possession",
    icon: "car",
    group: null,
    instrumentId: null,
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    symbol: null,
    instrumentName: null,
    instrumentProvider: null,
    isCustom: true,
    isDelisted: false,
    quantity: "1",
    buyPriceCents: "2500000",
    buyCurrency: "USD",
    currentPriceCents: "2500000",
    currentPriceCurrency: "USD",
    priceFetchedAt: null,
    valueCents: "2500000",
    valueInBudgetCents: "2500000",
    profitLossPct: null,
    profitLossCents: null,
    weightPct: 0,
    sortOrder: 1,
    createdAt: "2026-07-21T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
    ...over,
  };
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  budgetId: "b1",
  budgetCurrency: "USD",
};

describe("possessionIconByName", () => {
  it("resolves known keys and falls back for unknown", () => {
    expect(possessionIconByName("car")).toBeTruthy();
    expect(possessionIconByName("nope")).toBeTruthy(); // fallback, not null
    expect(possessionIconByName(null)).toBeTruthy();
  });
});

describe("PossessionSheet", () => {
  beforeEach(() => {
    createMutate.mockClear();
    updateMutate.mockClear();
  });

  it("shows name + amount + currency + icon picker (no qty/buy-price)", () => {
    render(<PossessionSheet {...baseProps} mode="create" holding={null} />);
    expect(screen.getByTestId("possession-sheet-name")).toBeInTheDocument();
    expect(screen.getByTestId("possession-sheet-amount")).toBeInTheDocument();
    expect(screen.getByTestId("currency-stub")).toBeInTheDocument();
    expect(screen.getByTestId("wallet-customizer-trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
  });

  it("create save posts a possession payload (single amount, qty=1, icon)", () => {
    render(<PossessionSheet {...baseProps} mode="create" holding={null} />);
    fireEvent.change(screen.getByTestId("possession-sheet-name"), {
      target: { value: "Family car" },
    });
    fireEvent.change(screen.getByTestId("possession-sheet-amount"), {
      target: { value: "25000" },
    });
    expect(screen.getByTestId("possession-sheet-submit")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("possession-sheet-submit"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      name: "Family car",
      holdingType: "possession",
      uiType: "possession",
      quantity: "1",
      currentPriceCents: "2500000",
      currentPriceCurrency: "USD",
    });
  });

  it("save is disabled until name + amount are filled", () => {
    render(<PossessionSheet {...baseProps} mode="create" holding={null} />);
    expect(screen.getByTestId("possession-sheet-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("possession-sheet-name"), {
      target: { value: "House" },
    });
    expect(screen.getByTestId("possession-sheet-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("possession-sheet-amount"), {
      target: { value: "500000" },
    });
    expect(screen.getByTestId("possession-sheet-submit")).not.toBeDisabled();
  });

  it("edit mode prefills and saves via update with the holding id", () => {
    render(
      <PossessionSheet {...baseProps} mode="edit" holding={holding()} />,
    );
    expect(screen.getByTestId("possession-sheet-name")).toHaveValue("Family car");
    fireEvent.click(screen.getByTestId("possession-sheet-submit"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      holdingId: "p1",
      holdingType: "possession",
    });
  });
});

describe("PossessionRow", () => {
  it("renders the per-item icon, name and value", () => {
    render(<PossessionRow holding={holding()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId("possession-row-Family car")).toBeInTheDocument();
    expect(screen.getByText("Family car")).toBeInTheDocument();
    // value 2,500,000 cents → 25,000
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  it("row click edits, trash deletes", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<PossessionRow holding={holding()} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId("possession-row-Family car"));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/deleteAria/));
    expect(onDelete).toHaveBeenCalled();
  });
});
