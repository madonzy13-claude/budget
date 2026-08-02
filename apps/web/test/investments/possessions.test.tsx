/**
 * possessions.test.tsx — Vitest+RTL for the Possessions wallet section.
 *
 * Possessions ride the holdings endpoint (holdingType "possession") but render in
 * their own section with the SAME inline-edit model as the spendings/reserve/
 * cushion wallet rows: inline name / currency / value + an icon+color picker and
 * a staged draft add-row — NO sub edit sheet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { PossessionRow } from "../../src/components/budgeting/wallets-tab/possession-row";
import { PossessionsSection } from "../../src/components/budgeting/wallets-tab/possessions-section";
import { possessionIconByName } from "../../src/lib/possession-icons";
import type { HoldingDto } from "../../src/hooks/use-investments";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const createMutate = vi.fn();
const updateMutate = vi.fn();
const archiveMutate = vi.fn();
const holdingsRef: { current: HoldingDto[] } = { current: [] };
vi.mock("../../src/hooks/use-investments", () => ({
  useInvestments: () => ({ data: holdingsRef.current }),
}));
vi.mock("../../src/hooks/use-create-holding", () => ({
  useCreateHolding: () => ({
    mutate: createMutate,
    mutateAsync: createMutate,
    isPending: false,
  }),
}));
vi.mock("../../src/hooks/use-update-holding", () => ({
  useUpdateHolding: () => ({ mutate: updateMutate, mutateAsync: updateMutate }),
}));
vi.mock("../../src/hooks/use-archive-holding", () => ({
  useArchiveHolding: () => ({ mutate: archiveMutate }),
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
    color: "#e63946",
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

beforeEach(() => {
  createMutate.mockClear();
  updateMutate.mockClear();
  archiveMutate.mockClear();
  holdingsRef.current = [];
});

describe("possessionIconByName", () => {
  it("resolves known keys and falls back for unknown", () => {
    expect(possessionIconByName("car")).toBeTruthy();
    expect(possessionIconByName("nope")).toBeTruthy();
    expect(possessionIconByName(null)).toBeTruthy();
  });
});

describe("PossessionRow — inline (no sub sheet)", () => {
  const persisted = (over: Partial<HoldingDto> = {}) => (
    <PossessionRow
      mode="persisted"
      holding={holding(over)}
      onUpdate={updateMutate}
      onArchive={archiveMutate}
    />
  );

  it("renders icon+color picker, name and value inline", () => {
    render(persisted());
    // the shared wallet customizer (icon + color) — same as spendings/wallets
    expect(screen.getByTestId("wallet-customizer-trigger")).toBeInTheDocument();
    expect(screen.getByText("Family car")).toBeInTheDocument();
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
    // NO sub edit sheet exists
    expect(screen.queryByTestId("possession-sheet-name")).toBeNull();
  });

  it("clicking the name cell opens an INLINE editor (not a sheet)", () => {
    render(persisted());
    fireEvent.click(screen.getByTestId("possession-name-p1"));
    // InlineEditCell swaps to an editor container with the input inside
    expect(screen.getByTestId("possession-name-p1-editor")).toBeInTheDocument();
    expect(
      screen.getByTestId("possession-name-p1-editor").querySelector("input"),
    ).toBeTruthy();
  });

  it("rejects an empty name with a direct message, no save (260721)", () => {
    render(persisted());
    fireEvent.click(screen.getByTestId("possession-name-p1"));
    const input = screen
      .getByTestId("possession-name-p1-editor")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(toast.error).toHaveBeenCalledWith("row.nameRequired");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("clicking the value cell opens an inline numeric editor", () => {
    render(persisted());
    fireEvent.click(screen.getByTestId("possession-amount-p1"));
    expect(
      screen.getByTestId("possession-amount-p1-editor"),
    ).toBeInTheDocument();
  });

  it("changing the currency updates the holding", () => {
    render(persisted());
    fireEvent.change(screen.getByTestId("currency-stub"), {
      target: { value: "EUR" },
    });
    expect(updateMutate).toHaveBeenCalledWith({ currency: "EUR" });
  });

  it("trash opens a confirm dialog; only confirming archives (same as spendings)", async () => {
    render(persisted());
    fireEvent.click(screen.getByTestId("possession-trash-p1"));
    // Does NOT archive immediately — a confirm dialog opens first.
    expect(archiveMutate).not.toHaveBeenCalled();
    // Confirm CTA (next-intl mock echoes the key) archives.
    const cta = await screen.findByText("cta");
    fireEvent.click(cta);
    expect(archiveMutate).toHaveBeenCalled();
  });
});

describe("PossessionRow — draft add", () => {
  it("committing a non-empty name creates the possession", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const onDiscard = vi.fn();
    render(
      <PossessionRow
        mode="draft"
        budgetCurrency="USD"
        pending={false}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );
    const input = screen.getByTestId("possession-draft-name-input");
    fireEvent.change(input, { target: { value: "Rolex watch" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("Rolex watch");
  });

  it("empty blur discards the draft", () => {
    const onCommit = vi.fn();
    const onDiscard = vi.fn();
    render(
      <PossessionRow
        mode="draft"
        budgetCurrency="USD"
        pending={false}
        onCommit={onCommit}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.blur(screen.getByTestId("possession-draft-name-input"));
    expect(onDiscard).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("PossessionsSection", () => {
  it("lists possessions; add button reveals an inline draft row (no sheet)", () => {
    holdingsRef.current = [holding()];
    render(<PossessionsSection budgetId="b1" budgetCurrency="USD" />);
    expect(screen.getByTestId("possessions-section")).toBeInTheDocument();
    expect(screen.getByTestId("possession-row-Family car")).toBeInTheDocument();
    // no draft yet
    expect(screen.queryByTestId("possession-row-draft")).toBeNull();
    fireEvent.click(screen.getByTestId("add-possession-button"));
    // inline draft row appears — NOT a sub edit sheet
    expect(screen.getByTestId("possession-row-draft")).toBeInTheDocument();
    expect(screen.queryByTestId("possession-sheet-name")).toBeNull();
  });

  it("filters non-possession holdings out of the section", () => {
    holdingsRef.current = [
      holding(),
      holding({ id: "e1", name: "Apple", holdingType: "equities", icon: null }),
    ];
    render(<PossessionsSection budgetId="b1" budgetCurrency="USD" />);
    expect(screen.getByTestId("possession-row-Family car")).toBeInTheDocument();
    expect(screen.queryByTestId("possession-row-Apple")).toBeNull();
  });
});
