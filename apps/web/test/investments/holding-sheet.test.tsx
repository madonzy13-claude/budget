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
import { clientApiFetch } from "../../src/lib/budget-fetch";
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
  // holding-sheet.tsx uses fmt.relativeTime(at) for the price age (b789ec8).
  useFormatter: () => ({
    relativeTime: (_d: Date) => "just now",
    number: (n: number) => String(n),
    dateTime: (d: Date) => d.toISOString(),
  }),
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
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: vi.fn() }));
// Stub the asset autocomplete: keep the holding-sheet-name input (so the
// dirty-close test still drives it) and add a button that selects a tracked
// instrument — this is what triggers the on-add price fetch.
vi.mock(
  "../../src/components/budgeting/wallets-tab/instrument-search-input",
  () => ({
    InstrumentSearchInput: ({
      name,
      onNameChange,
      onSelectInstrument,
      onSelectCustom,
    }: {
      name: string;
      onNameChange: (v: string) => void;
      onSelectInstrument: (i: {
        id: string;
        displayName: string;
        quoteCurrency: string;
        symbol: string;
        provider?: string;
      }) => void;
      onSelectCustom: () => void;
    }) => (
      <div>
        <input
          data-testid="holding-sheet-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <button
          type="button"
          data-testid="pick-manual-entry"
          onClick={() => onSelectCustom()}
        >
          enter-manually
        </button>
        <button
          type="button"
          data-testid="pick-instrument"
          onClick={() =>
            onSelectInstrument({
              id: "i1",
              displayName: "Apple Inc",
              quoteCurrency: "USD",
              symbol: "AAPL",
              provider: "finnhub",
            })
          }
        >
          pick
        </button>
        <button
          type="button"
          data-testid="pick-manual-instrument"
          onClick={() =>
            onSelectInstrument({
              id: "i2",
              displayName: "CD Projekt",
              quoteCurrency: "PLN",
              symbol: "CDR",
              provider: "manual",
            })
          }
        >
          pick-manual
        </button>
      </div>
    ),
  }),
);
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
      <option value="PLN">PLN</option>
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
    premiumPct: null,
    instrumentProvider: "finnhub",
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
    profitLossCents: "2000",
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

  // 260626: bullion premium — metals only, seeded from the holding.
  it("precious metals show the premium field, seeded from the holding", () => {
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
          premiumPct: "20",
        })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-premium")).toHaveValue("20");
  });

  it("non-metals do NOT show the premium field", () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    expect(screen.queryByTestId("holding-sheet-premium")).toBeNull();
  });

  // 260626: auto-fetched price is a DISABLED field (not an editable input).
  it("auto-fetched current price renders a disabled field", () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    expect(screen.getByTestId("holding-sheet-current-price")).toBeDisabled();
  });

  // 260626: the quantity field drops numeric(28,8) trailing zeros.
  it("quantity field trims trailing zeros (1.13000000 → 1.13, 1.00000000 → 1)", () => {
    const { unmount } = render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({ quantity: "1.13000000" })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-quantity")).toHaveValue("1.13");
    unmount();
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({ quantity: "1.00000000" })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-quantity")).toHaveValue("1");
  });

  // 260626: bottom Preview sum-up across types.
  it("preview sum-up (metals): buy total, current value, premium, P/L", () => {
    render(
      <HoldingSheet
        {...baseProps}
        budgetCurrency="EUR"
        mode="edit"
        holding={holding({
          holdingType: "commodity",
          uiType: "precious_metals",
          metal: "gold",
          unitOfMeasure: "g",
          name: "Bar",
          instrumentProvider: "gold_api",
          buyPriceCents: "6000", // 60.00/g
          buyCurrency: "EUR",
          currentPriceCents: "200000", // 2000.00/oz spot
          currentPriceCurrency: "EUR",
          quantity: "100",
          premiumPct: "20",
        })}
      />,
    );
    const p = screen.getByTestId("holding-sheet-preview");
    expect(p.textContent).toMatch(/6,000 EUR/); // buy total 60 × 100
    expect(p.textContent).toMatch(/6,430\.15 EUR/); // current base 64.30 × 100
    expect(p.textContent).toMatch(/1,286\.03 EUR/); // +20% premium
    expect(p.textContent).toMatch(/7,716\.1[78] EUR/); // with premium
    expect(p.textContent).toMatch(/1,716\.1[78] EUR/); // P/L
  });

  it("preview sum-up (cash): amount only, no P/L", () => {
    render(
      <HoldingSheet
        {...baseProps}
        budgetCurrency="EUR"
        mode="edit"
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "EUR Cash",
          currentPriceCents: "50000",
          currentPriceCurrency: "EUR",
        })}
      />,
    );
    const p = screen.getByTestId("holding-sheet-preview");
    expect(p.textContent).toMatch(/500 EUR/);
    expect(p.textContent).not.toMatch(/preview\.pl/); // no P/L row for cash
  });

  it("create mode preselects no type → no Asset/Name field, Save disabled", () => {
    render(<HoldingSheet {...baseProps} mode="create" holding={null} />);
    expect(screen.queryByTestId("holding-sheet-name")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.getByTestId("holding-sheet-submit")).toBeDisabled();
    // Type shows the placeholder (no preselection).
    expect(screen.getByText("field.typePlaceholder")).toBeInTheDocument();
  });

  it("on-select price-fetch failure → PriceBlockedBanner (alert) + Save disabled + Retry", async () => {
    // The price POST resolves !ok → the sheet sets priceBlocked.
    vi.mocked(clientApiFetch).mockResolvedValue({ ok: false } as Response);
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);

    // Default type is tracked → selecting an instrument fires the price fetch.
    fireEvent.click(screen.getByTestId("pick-instrument"));

    const banner = await screen.findByTestId("price-blocked-banner");
    expect(banner).toHaveAttribute("role", "alert");
    // Red 4px left border.
    expect(banner.className).toContain("border-l-4");
    expect(banner.className).toContain("border-[var(--destructive)]");
    // Inline Retry present + Save disabled while blocked.
    expect(screen.getByText("retry")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-submit")).toBeDisabled();
  });

  it("Retry after a price-fetch failure clears the banner on success", async () => {
    vi.mocked(clientApiFetch).mockResolvedValueOnce({ ok: false } as Response);
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    fireEvent.click(screen.getByTestId("pick-instrument"));
    await screen.findByTestId("price-blocked-banner");

    // Retry → price POST now succeeds → banner clears, Save enabled.
    vi.mocked(clientApiFetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ priceCents: "19800", currency: "USD" }),
    } as unknown as Response);
    fireEvent.click(screen.getByText("retry"));

    await waitFor(() => {
      expect(screen.queryByTestId("price-blocked-banner")).toBeNull();
    });
  });

  it("selecting a manual-provider (non-US) instrument makes the price editable and fetches nothing", async () => {
    vi.mocked(clientApiFetch).mockClear();
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    // A fresh tracked holding, then pick a manual (PLN/GPW) instrument.
    fireEvent.click(screen.getByTestId("pick-manual-instrument"));

    // Editable current-price input appears (no read-only preview / banner).
    expect(
      await screen.findByTestId("holding-sheet-amount"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("price-blocked-banner")).toBeNull();
    // The price endpoint is NEVER called for a manual instrument.
    expect(clientApiFetch).not.toHaveBeenCalled();

    // Typing a price enables Save.
    fireEvent.change(screen.getByTestId("holding-sheet-amount"), {
      target: { value: "120.50" },
    });
    expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled();
  });

  it("broker type shows deposited + actual value (no quantity, no generic buy-price block)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "other",
          uiType: "broker",
          instrumentId: null,
          name: "IBKR account",
          buyPriceCents: "1000000",
          currentPriceCents: "1125000",
        })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-deposited")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-actual")).toBeInTheDocument();
    // No quantity and no generic buy-price field (those are for tracked/manual).
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-buy-price")).toBeNull();
    // Name present and Save enabled (deposited + actual + name all filled).
    expect(screen.getByTestId("holding-sheet-name")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled();
  });

  it("selecting an instrument hides the currency picker and shows its currency in the price label", () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    // Default tracked holding has an instrument (i1) → currency is the instrument's,
    // so the picker is hidden and the price label carries the currency.
    expect(screen.queryByTestId("currency-stub")).toBeNull();
    expect(screen.getByText(/field\.currentPrice \(USD\)/)).toBeInTheDocument();
  });

  // 260626: crypto is quoted in USD (CoinGecko) but the user values it in a
  // currency of their choice — like precious metals. So unlike equity/ETF, a
  // crypto holding with an instrument selected must STILL show the currency
  // picker (manual currency), and the read-only price is FX-converted to it.
  it("crypto: keeps the currency picker visible WITH an instrument (manual currency, unlike equity)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "crypto",
          uiType: "crypto",
          instrumentProvider: "coingecko",
          name: "Bitcoin",
          buyCurrency: "EUR",
          currentPriceCurrency: "EUR",
        })}
      />,
    );
    expect(screen.getByTestId("currency-stub")).toBeInTheDocument();
  });

  it("crypto: changing the currency re-fetches the price converted to that currency", async () => {
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "1800000", currency: "EUR" }),
    } as unknown as Response);
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "crypto",
          uiType: "crypto",
          instrumentProvider: "coingecko",
          name: "Bitcoin",
        })}
      />,
    );
    vi.mocked(clientApiFetch).mockClear();
    fireEvent.change(screen.getByTestId("currency-stub"), {
      target: { value: "EUR" },
    });
    await waitFor(() => expect(clientApiFetch).toHaveBeenCalled());
    const call = vi.mocked(clientApiFetch).mock.calls.at(-1);
    expect(String(call?.[0])).toContain("/investments/price/i1");
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject(
      { currency: "EUR" },
    );
  });

  it("'enter manually' (no catalog match) shows an editable price + the currency picker", async () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    fireEvent.click(screen.getByTestId("pick-manual-entry"));
    // No instrument now → plain name + ticker inputs, currency picker, editable price.
    expect(await screen.findByTestId("currency-stub")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-ticker")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-amount")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Obscure Co" },
    });
    fireEvent.change(screen.getByTestId("holding-sheet-amount"), {
      target: { value: "42" },
    });
    expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled();
  });

  it("changing the currency updates the SAVED value currency (USD → PLN), not just the buy currency", () => {
    updateMutate.mockClear();
    // A manual (collectibles) holding: currency picker is shown, price is editable.
    render(
      <HoldingSheet
        {...baseProps}
        mode="edit"
        holding={holding({
          holdingType: "other",
          uiType: "collectibles",
          instrumentId: null,
          name: "Gold coins",
          currentPriceCents: "10000",
          currentPriceCurrency: "USD",
          buyCurrency: "USD",
        })}
      />,
    );
    fireEvent.change(screen.getByTestId("currency-stub"), {
      target: { value: "PLN" },
    });
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0][0];
    expect(payload.currentPriceCurrency).toBe("PLN");
    expect(payload.buyCurrency).toBe("PLN");
  });

  it("dirty close fires the discard-confirm dialog", async () => {
    render(<HoldingSheet {...baseProps} mode="edit" holding={holding()} />);
    // Tracked holding → the Asset input carries the holding-sheet-name id.
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Apple" },
    });
    fireEvent.click(screen.getByText("sheet.cancel"));
    await waitFor(() => {
      expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    });
  });
});
