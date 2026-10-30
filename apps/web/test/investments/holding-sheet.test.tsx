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
import {
  HoldingSheet,
  HoldingFormFields,
} from "../../src/components/budgeting/wallets-tab/holding-sheet";
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
vi.mock("../../src/hooks/use-create-holding", () => ({
  useCreateHolding: () => ({ mutate: createMutate }),
}));
const restoreMutate = vi.fn();
vi.mock("../../src/hooks/use-archive-holding", () => ({
  useRestoreHolding: () => ({ mutate: restoreMutate }),
}));
// 13.1 D-02: the Name field autocompletes over the type's assets.
vi.mock("../../src/hooks/use-asset-names", () => ({
  useAssetNames: (_b: string, type: string | null) => ({
    data:
      type === "crypto"
        ? [
            {
              id: "btc-id",
              name: "BTC Ledger",
              archived: false,
              instrumentId: "i9",
              valueCents: "5000000",
              valueCurrency: "USD",
            },
          ]
        : type === "cash"
          ? [
              {
                id: "pot",
                name: "Pot",
                archived: false,
                instrumentId: null,
                valueCents: "50000",
                valueCurrency: "USD",
              },
            ]
          : [],
  }),
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
        assetClass?: string;
      }) => void;
      onSelectCustom: () => void;
    }) => (
      <div>
        <input
          data-testid="holding-sheet-instrument"
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
          data-testid="pick-etf"
          onClick={() =>
            onSelectInstrument({
              id: "i3",
              displayName: "Vanguard S&P 500 ETF",
              quoteCurrency: "USD",
              symbol: "VOO",
              provider: "finnhub",
              assetClass: "etf",
            })
          }
        >
          pick-etf
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
// 13.1 UAT 7: picking an existing asset in Add = the locked Swap → Buy form.
vi.mock("../../src/hooks/use-investments", () => ({
  useInvestments: () => ({
    data: [
      { id: "btc-id", name: "BTC Ledger", uiType: "crypto" },
      // R6: a valued asset the Add form can take money from.
      {
        id: "ike",
        name: "IKE",
        holdingType: "other",
        uiType: "broker",
        isCustom: true,
        quantity: "1",
        valueCents: "12000000",
        currentPriceCurrency: "USD",
        buyCurrency: "USD",
      },
    ],
  }),
}));
const sellMutate = vi.fn();
vi.mock("../../src/hooks/use-sell-holding", () => ({
  useSellHolding: () => ({ mutate: sellMutate, isPending: false }),
}));
vi.mock("../../src/hooks/use-asset-entries", () => ({
  useMinEntryDate: () => null,
}));
vi.mock("../../src/components/budgeting/wallets-tab/swap-buy-tab", () => ({
  SwapBuyTab: ({
    holding,
    date,
    draft,
  }: {
    holding: { id: string };
    date: string;
    draft?: string;
  }) => (
    <div data-testid="picked-buy" data-date={date} data-draft={draft ?? ""}>
      {holding.id}
    </div>
  ),
}));
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({
    value,
    onSelect,
    richLabel,
    desktopDropdown,
  }: {
    value?: string;
    onSelect: (v: string) => void;
    richLabel?: boolean;
    desktopDropdown?: boolean;
  }) => (
    <select
      data-testid="currency-stub"
      data-rich={richLabel ? "1" : "0"}
      data-desktop={desktopDropdown ? "1" : "0"}
      value={value}
      onChange={(e) => onSelect(e.target.value)}
    >
      {["USD", "EUR", "PLN"].map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  ),
}));

function holding(over: Partial<HoldingDto> = {}): HoldingDto {
  return {
    id: "h1",
    name: "Test",
    holdingType: "equities",
    uiType: "stocks",
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

describe("HoldingSheet — type-first", () => {
  it("cash type shows currency + amount only (no buy price / quantity)", () => {
    render(
      <HoldingSheet
        {...baseProps}
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
    // Phase 13: groups are the investment type — no Group field.
    expect(screen.queryByTestId("holding-sheet-group")).toBeNull();
  });

  it("tracked type: read-only current price, editable buy price + quantity", () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.getByTestId("holding-sheet-buy-price")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-quantity")).toBeInTheDocument();
    expect(
      screen.getByTestId("holding-sheet-current-price"),
    ).toBeInTheDocument();
  });

  it("savings type: starting + current amount, no quantity/buy-price", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "savings",
          uiType: "savings",
          instrumentId: null,
          name: "Emergency fund",
          buyPriceCents: "1000000",
          currentPriceCents: "1250000",
        })}
      />,
    );
    // reuses the broker field-set (name + two amounts + currency, no quantity)
    expect(screen.getByTestId("holding-sheet-deposited")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-actual")).toBeInTheDocument();
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-buy-price")).toBeNull();
    // but relabeled: Starting / Current — not Deposited / Actual
    expect(screen.getByText("field.startingAmount")).toBeInTheDocument();
    expect(screen.getByText("field.currentAmount")).toBeInTheDocument();
    expect(screen.queryByText("field.depositedValue")).toBeNull();
  });

  it("precious metals type reveals metal + kind + UoM fields", () => {
    render(
      <HoldingSheet
        {...baseProps}
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
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    expect(screen.queryByTestId("holding-sheet-premium")).toBeNull();
  });

  // 260626: auto-fetched price is a DISABLED field (not an editable input).
  it("auto-fetched current price renders a disabled field", () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    expect(screen.getByTestId("holding-sheet-current-price")).toBeDisabled();
  });

  // 260626: the quantity field drops numeric(28,8) trailing zeros.
  it("quantity field trims trailing zeros (1.13000000 → 1.13, 1.00000000 → 1)", () => {
    const { unmount } = render(
      <HoldingSheet
        {...baseProps}
        holding={holding({ quantity: "1.13000000" })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-quantity")).toHaveValue("1.13");
    unmount();
    render(
      <HoldingSheet
        {...baseProps}
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

  // R6 (user): like Sell and Transfer — nothing below the type until one is
  // picked: no date, no Save, no Cancel.
  it("create mode preselects no type → no Asset/Name field, no date, no Save or Cancel", () => {
    render(<HoldingSheet {...baseProps} holding={null} />);
    expect(screen.queryByTestId("holding-sheet-name")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-date")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-actions")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-submit")).toBeNull();
    // Type shows the placeholder (no preselection).
    expect(screen.getByText("field.typePlaceholder")).toBeInTheDocument();
  });

  it("on-select price-fetch failure → PriceBlockedBanner (alert) + Save disabled + Retry", async () => {
    // The price POST resolves !ok → the sheet sets priceBlocked.
    vi.mocked(clientApiFetch).mockResolvedValue({ ok: false } as Response);
    render(<HoldingSheet {...baseProps} holding={holding()} />);

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
    render(<HoldingSheet {...baseProps} holding={holding()} />);
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
    render(<HoldingSheet {...baseProps} holding={holding()} />);
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

  it("deposit type shows principal + rate + capitalization + start + optional end, and prefills them", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "deposit",
          uiType: "deposit",
          instrumentId: null,
          name: "Savings @ 5.25%",
          buyPriceCents: "500000",
          buyCurrency: "USD",
          currentPriceCents: "500000",
          currentPriceCurrency: "USD",
          depositRateBps: 525,
          depositStartDate: "2025-01-01",
          depositEndDate: "2026-01-01",
          depositCapFrequency: "monthly",
        })}
      />,
    );
    // Deposit-specific fields present.
    expect(screen.getByTestId("holding-sheet-principal")).toBeInTheDocument();
    expect(screen.getByTestId("holding-sheet-rate")).toHaveValue("5.25");
    expect(screen.getByTestId("holding-sheet-start-date")).toHaveValue(
      "2025-01-01",
    );
    expect(screen.getByTestId("holding-sheet-end-date")).toHaveValue(
      "2026-01-01",
    );
    expect(
      screen.getByTestId("holding-sheet-cap-frequency"),
    ).toBeInTheDocument();
    // Not a quantity/buy-price holding.
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled();
  });

  // Round-5 gap 1: a deposit has ONE date — its start date.
  it("deposit hides the generic date and sends no openedOn; cash keeps it", () => {
    const { unmount } = render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "deposit",
          uiType: "deposit",
          instrumentId: null,
          name: "Savings",
          buyPriceCents: "500000",
          buyCurrency: "USD",
          depositRateBps: 525,
          depositStartDate: "2025-01-01",
          depositEndDate: null,
          depositCapFrequency: "monthly",
        })}
      />,
    );
    expect(screen.queryByTestId("holding-sheet-date")).toBeNull();
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(createMutate.mock.calls[0][0]).not.toHaveProperty("openedOn");
    createMutate.mockClear();
    unmount();
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "EUR Cash",
        })}
      />,
    );
    expect(screen.getByTestId("holding-sheet-date")).toBeInTheDocument();
  });

  // Round-5 gap 10: dates read in the app's language, not the browser's.
  it("shows the start date in the app's locale", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "deposit",
          uiType: "deposit",
          instrumentId: null,
          name: "Savings",
          buyPriceCents: "500000",
          buyCurrency: "USD",
          depositRateBps: 525,
          depositStartDate: "2025-01-01",
          depositEndDate: null,
          depositCapFrequency: "monthly",
        })}
      />,
    );
    expect(
      screen
        .getByTestId("holding-sheet-start-date")
        .closest(".date-input-overlay-host"),
    ).toHaveTextContent("1 Jan 2025");
  });

  it("deposit save builds a payload with rate (bps), dates and frequency", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "deposit",
          uiType: "deposit",
          instrumentId: null,
          name: "Savings",
          buyPriceCents: "500000",
          buyCurrency: "USD",
          depositRateBps: 525,
          depositStartDate: "2025-01-01",
          depositEndDate: null,
          depositCapFrequency: "monthly",
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload).toMatchObject({
      holdingType: "deposit",
      uiType: "deposit",
      depositRateBps: 525,
      depositStartDate: "2025-01-01",
      depositEndDate: null,
      depositCapFrequency: "monthly",
    });
  });

  it("equity: keeps the currency picker visible WITH an instrument (re-denominate + FX)", () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    // Equity is now user-currency (like crypto): a US stock quoted USD can be
    // tracked/valued in another currency via FX, so the picker stays available.
    const picker = screen.getByTestId("currency-stub") as HTMLSelectElement;
    expect(picker).toBeInTheDocument();
    expect(picker.value).toBe("USD"); // seeded from the holding's currency
  });

  it("equity: selecting an instrument defaults the currency to the instrument's own currency", () => {
    // Start the equity holding in EUR, then pick a USD-quoted instrument (AAPL):
    // the currency must ADOPT the instrument's USD (found-in-suggestions default).
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "19800", currency: "USD" }),
    } as unknown as Response);
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({ buyCurrency: "EUR", currentPriceCurrency: "EUR" })}
      />,
    );
    fireEvent.click(screen.getByTestId("pick-instrument")); // AAPL / USD
    expect(
      (screen.getByTestId("currency-stub") as HTMLSelectElement).value,
    ).toBe("USD");
  });

  it("equity: changing the currency re-fetches the price FX-converted to that currency", async () => {
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "9900", currency: "PLN" }),
    } as unknown as Response);
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    vi.mocked(clientApiFetch).mockClear();
    fireEvent.change(screen.getByTestId("currency-stub"), {
      target: { value: "PLN" },
    });
    await waitFor(() => expect(clientApiFetch).toHaveBeenCalled());
    const call = vi.mocked(clientApiFetch).mock.calls.at(-1);
    expect(String(call?.[0])).toContain("/investments/price/i1");
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toMatchObject(
      {
        currency: "PLN",
      },
    );
  });

  // 260626: crypto is quoted in USD (CoinGecko) but the user values it in a
  // currency of their choice — like precious metals. So unlike equity/ETF, a
  // crypto holding with an instrument selected must STILL show the currency
  // picker (manual currency), and the read-only price is FX-converted to it.
  it("crypto: keeps the currency picker visible WITH an instrument (manual currency, unlike equity)", () => {
    render(
      <HoldingSheet
        {...baseProps}
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
    render(<HoldingSheet {...baseProps} holding={holding()} />);
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
    createMutate.mockClear();
    // A manual (collectibles) holding: currency picker is shown, price is editable.
    render(
      <HoldingSheet
        {...baseProps}
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
    expect(createMutate).toHaveBeenCalledTimes(1);
    const payload = createMutate.mock.calls[0][0];
    expect(payload.currentPriceCurrency).toBe("PLN");
    expect(payload.buyCurrency).toBe("PLN");
  });

  // user, 261023: a quick-edited 170 over 3 units stores 5666.666667/unit;
  // saving the sheet untouched must not round it back and show 170.01.
  it("saving untouched keeps a sub-cent current price", () => {
    createMutate.mockClear();
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "other",
          uiType: "collectibles",
          instrumentId: null,
          name: "Land plot",
          quantity: "3",
          currentPriceCents: "5666.666667",
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(createMutate.mock.calls[0][0].currentPriceCents).toBe("5666.666667");
  });

  // 260721 user feedback (3): the editable current-price must NOT seed a
  // placeholder from the buy price — an empty field looked already filled.
  it("manual current-price field has no placeholder (was seeded from buy price)", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "other",
          uiType: "collectibles",
          instrumentId: null,
          name: "Gold coins",
          buyPriceCents: "10000", // 100.00 — must NOT leak into the placeholder
          currentPriceCents: null,
        })}
      />,
    );
    const amount = screen.getByTestId(
      "holding-sheet-amount",
    ) as HTMLInputElement;
    expect(amount.getAttribute("placeholder") ?? "").toBe("");
  });

  // 260721 user feedback (4): actions live at the END of the scrolling form
  // (not a pinned footer) — the Save button scrolls with the content.
  it("Save/Cancel render inside the scrolling form body, not a pinned footer", () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    const actions = screen.getByTestId("holding-sheet-actions");
    // the actions row sits inside the scroll container (the overflow-y-auto body),
    // i.e. it has an ancestor with overflow-y-auto — not a sibling footer.
    expect(actions.closest(".overflow-y-auto")).not.toBeNull();
  });

  // 260721 user feedback (5): the currency picker matches the wizard
  // (richLabel + desktopDropdown), not a bare field.
  it("currency picker uses the wizard's rich desktop dropdown", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "EUR Cash",
        })}
      />,
    );
    const picker = screen.getByTestId("currency-stub");
    expect(picker.getAttribute("data-rich")).toBe("1");
    expect(picker.getAttribute("data-desktop")).toBe("1");
  });

  it("dirty close fires the discard-confirm dialog", async () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    // Tracked holding → the Asset input carries the holding-sheet-name id.
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Apple" },
    });
    fireEvent.click(screen.getByText("sheet.cancel"));
    await waitFor(() => {
      expect(screen.getByText("confirm.discard.title")).toBeInTheDocument();
    });
  });

  // Phase 13 (D-10, RESEARCH A6): Stocks & ETFs is one type; the holding_type
  // (price routing) follows the picked instrument.
  it("picking an ETF under Stocks & ETFs saves holdingType etf", async () => {
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "50000", currency: "USD" }),
    } as unknown as Response);
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    fireEvent.click(screen.getByTestId("pick-etf"));
    await waitFor(() =>
      expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    const payload = createMutate.mock.calls.at(-1)![0];
    expect(payload).toMatchObject({ uiType: "stocks", holdingType: "etf" });
  });

  it("picking a stock under Stocks & ETFs saves holdingType equities", async () => {
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "19800", currency: "USD" }),
    } as unknown as Response);
    render(
      <HoldingSheet {...baseProps} holding={holding({ holdingType: "etf" })} />,
    );
    fireEvent.click(screen.getByTestId("pick-instrument"));
    await waitFor(() =>
      expect(screen.getByTestId("holding-sheet-submit")).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(createMutate.mock.calls.at(-1)![0]).toMatchObject({
      uiType: "stocks",
      holdingType: "equities",
    });
  });
});

// Phase 13 Sell → "New investment" reuses the Add form's type fields.
describe("HoldingFormFields — sale destination", () => {
  it("cash: just a name; emits a cash holding in the received currency", async () => {
    const onChange = vi.fn();
    render(
      <HoldingFormFields
        budgetId="b1"
        budgetCurrency="USD"
        receivedCurrency="PLN"
        initialUiType="cash"
        onChange={onChange}
      />,
    );
    expect(screen.queryByTestId("holding-sheet")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-amount")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-submit")).toBeNull();
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "Erste PLN" },
    });
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        name: "Erste PLN",
        uiType: "cash",
        holdingType: "cash_fx",
        instrumentId: null,
        manualTicker: null,
        currentPriceCurrency: "PLN",
      }),
    );
  });

  it("crypto: no quantity or prices here; emits the instrument's live price", async () => {
    vi.mocked(clientApiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ priceCents: "100", currency: "USD" }),
    } as unknown as Response);
    const onChange = vi.fn();
    render(
      <HoldingFormFields
        budgetId="b1"
        budgetCurrency="USD"
        receivedCurrency="PLN"
        initialUiType="crypto"
        onChange={onChange}
      />,
    );
    // 13.1 UAT 10: the Sell tab owns the one quantity + price pair.
    expect(screen.queryByTestId("holding-sheet-buy-price")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-current-price")).toBeNull();
    expect(screen.queryByTestId("holding-sheet-quantity")).toBeNull();
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "USDT" },
    });
    fireEvent.click(screen.getByTestId("pick-instrument"));
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: "USDT",
          uiType: "crypto",
          instrumentId: "i1",
          livePriceCents: "100",
        }),
      ),
    );
  });
  // Live bug (13-11): the create form auto-opens its Type list; embedded in
  // the Sell sheet that modal list swallowed every keystroke in "Value left".
  it("does not auto-open the Type list as a sale destination", () => {
    render(
      <HoldingFormFields
        budgetId="b1"
        budgetCurrency="USD"
        receivedCurrency="PLN"
        initialUiType="cash"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("holding-sheet-type")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

// Phase 13 (D-03, UI-SPEC §4): Edit asks "What happened?" — cost basis and
// quantity move only through the ledger, never through PATCH.

describe("HoldingSheet — add joins by name (13.1 D-02)", () => {
  it("the Name field is an autocomplete scoped to the type", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "",
        })}
      />,
    );
    const name = screen.getByTestId("holding-sheet-name");
    expect(name).toHaveAttribute("role", "combobox");
    fireEvent.focus(name);
    expect(screen.getByTestId("asset-name-option-0")).toHaveTextContent("Pot");
  });

  // Round 4: no "joins X" note for an active asset; the pick-or-create hint shows.
  it("an existing name shows no join note; the pick-or-create hint shows", () => {
    render(
      <HoldingSheet
        {...baseProps}
        holding={holding({
          holdingType: "cash_fx",
          uiType: "cash",
          instrumentId: null,
          name: "pot",
        })}
      />,
    );
    expect(screen.queryByTestId("asset-name-note")).toBeNull();
    expect(screen.getByTestId("asset-name-hint")).toBeInTheDocument();
  });

  it("there is no edit mode: no history, no 'what happened', save creates", () => {
    render(<HoldingSheet {...baseProps} holding={holding()} />);
    expect(screen.queryByTestId(/^history-/)).toBeNull();
    expect(screen.queryByTestId(/^happened-/)).toBeNull();
  });

  // Round-2 gap 6: the Add form inside New transaction, no Sheet shell.
  describe("embedded in New transaction", () => {
    it("renders the add body with no dialog shell and no auto-opened Type list", () => {
      render(<HoldingSheet {...baseProps} embedded holding={null} />);
      expect(screen.getByTestId("holding-sheet")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByRole("listbox")).toBeNull();
    });

    it("Cancel on a clean form closes; typing reports dirty", () => {
      const onOpenChange = vi.fn();
      const onDirtyChange = vi.fn();
      render(
        <HoldingSheet
          {...baseProps}
          embedded
          holding={null}
          initialUiType="cash"
          onOpenChange={onOpenChange}
          onDirtyChange={onDirtyChange}
        />,
      );
      fireEvent.click(screen.getByText("sheet.cancel"));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      fireEvent.change(screen.getByTestId("holding-sheet-name"), {
        target: { value: "New pot" },
      });
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    // Round-4 gap 8: New transaction carries a picked asset, date and amount.
    it("a carried pick opens its Buy form with the name, date and amount", () => {
      const onDirtyChange = vi.fn();
      render(
        <HoldingSheet
          {...baseProps}
          embedded
          holding={null}
          initialUiType="crypto"
          initialPickedId="btc-id"
          date="2026-10-02"
          setDate={() => {}}
          draft="30000"
          setDraft={() => {}}
          onDirtyChange={onDirtyChange}
        />,
      );
      const buy = screen.getByTestId("picked-buy");
      expect(buy).toHaveTextContent("btc-id");
      expect(buy).toHaveAttribute("data-date", "2026-10-02");
      expect(buy).toHaveAttribute("data-draft", "30000");
      expect(screen.getByTestId("holding-sheet-name")).toHaveValue(
        "BTC Ledger",
      );
      expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    });

    it("picking an existing asset still swaps to its Buy form", () => {
      render(
        <HoldingSheet
          {...baseProps}
          embedded
          holding={null}
          initialUiType="crypto"
        />,
      );
      fireEvent.focus(screen.getByTestId("holding-sheet-name"));
      fireEvent.mouseDown(screen.getByTestId("asset-name-option-0"));
      expect(screen.getByTestId("picked-buy")).toHaveTextContent("btc-id");
    });
  });

  // Round-5 scope change: names are not unique — no currency is taken.
  it("a name that exists in the type keeps every currency and offers Add as new asset", () => {
    render(<HoldingSheet {...baseProps} holding={null} initialUiType="cash" />);
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "pot" },
    });
    for (const sel of screen.getAllByTestId("currency-stub"))
      for (const o of sel.querySelectorAll("option"))
        expect((o as HTMLOptionElement).disabled).toBe(false);
    fireEvent.focus(screen.getByTestId("holding-sheet-name"));
    expect(screen.getByTestId("asset-name-create")).toBeInTheDocument();
  });

  // Round-5: a sale's "New investment" pick switches the sale to that asset.
  it("picking an existing asset as a sale destination reports its id", () => {
    const onPickExisting = vi.fn();
    render(
      <HoldingSheet
        {...baseProps}
        holding={null}
        destination={{
          receivedCurrency: "PLN",
          initialUiType: "crypto",
          onChange: () => {},
          onPickExisting,
        }}
      />,
    );
    fireEvent.focus(screen.getByTestId("holding-sheet-name"));
    fireEvent.mouseDown(screen.getByTestId("asset-name-option-0"));
    expect(onPickExisting).toHaveBeenCalledWith("btc-id");
  });

  // Round-6 gap 3: picked in place — only Type + Name stay; typing drops it.
  it("a picked sale destination keeps Type + Name only; typing drops the pick", () => {
    const onPickExisting = vi.fn();
    render(
      <HoldingSheet
        {...baseProps}
        holding={null}
        destination={{
          receivedCurrency: "PLN",
          initialUiType: "crypto",
          onChange: () => {},
          onPickExisting,
          selectedId: "btc-id",
          excludeId: "src",
        }}
      />,
    );
    expect(screen.queryByTestId("holding-sheet-instrument")).toBeNull();
    fireEvent.change(screen.getByTestId("holding-sheet-name"), {
      target: { value: "BTC L" },
    });
    expect(onPickExisting).toHaveBeenLastCalledWith(null);
  });

  describe("name-first Add (UAT 13.1 test 7)", () => {
    const crypto = () =>
      render(
        <HoldingSheet {...baseProps} holding={null} initialUiType="crypto" />,
      );

    it("crypto asks the name first, from the type's own assets, then the instrument", () => {
      crypto();
      const name = screen.getByTestId("holding-sheet-name");
      expect(name).toHaveAttribute("role", "combobox");
      const instrument = screen.getByTestId("holding-sheet-instrument");
      expect(
        name.compareDocumentPosition(instrument) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      fireEvent.focus(name);
      expect(screen.getByTestId("asset-name-option-0")).toHaveTextContent(
        "BTC Ledger",
      );
    });

    it("picking an existing asset swaps the add fields for its Buy form", () => {
      crypto();
      fireEvent.focus(screen.getByTestId("holding-sheet-name"));
      fireEvent.mouseDown(screen.getByTestId("asset-name-option-0"));
      expect(screen.getByTestId("picked-buy")).toHaveTextContent("btc-id");
      expect(screen.queryByTestId("holding-sheet-instrument")).toBeNull();
      expect(screen.queryByTestId("holding-sheet-submit")).toBeNull();
      // Clearing the name goes back to the add fields.
      fireEvent.change(screen.getByTestId("holding-sheet-name"), {
        target: { value: "" },
      });
      expect(screen.queryByTestId("picked-buy")).toBeNull();
      expect(
        screen.getByTestId("holding-sheet-instrument"),
      ).toBeInTheDocument();
    });

    // Round-5 (user): the custom name never fills the Asset search; the field
    // is labelled "Custom name" so it reads apart from the Asset.
    it("a new custom name stays out of the instrument search and stays the label", async () => {
      vi.mocked(clientApiFetch).mockResolvedValue({
        ok: true,
        json: async () => ({ priceCents: "50000", currency: "USD" }),
      } as unknown as Response);
      crypto();
      expect(screen.getByText("field.customName")).toBeInTheDocument();
      fireEvent.change(screen.getByTestId("holding-sheet-name"), {
        target: { value: "BTC Binance" },
      });
      expect(screen.getByTestId("holding-sheet-instrument")).toHaveValue("");
      fireEvent.click(screen.getByTestId("pick-instrument"));
      expect(screen.getByTestId("holding-sheet-name")).toHaveValue(
        "BTC Binance",
      );
      expect(screen.queryByTestId("holding-sheet-custom-name")).toBeNull();
    });
  });
});

// R6 (user): New transaction → Buy (a new asset) says where the money came
// from, like Buy on an existing asset.
describe("HoldingSheet — money source", () => {
  const cashNew = () =>
    holding({
      holdingType: "cash_fx",
      uiType: "cash",
      instrumentId: null,
      name: "EUR Cash",
    });

  it("offers Out of investments (default) and From another asset", () => {
    render(<HoldingSheet {...baseProps} holding={cashNew()} />);
    expect(screen.getByTestId("swap-buy-from-out")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByTestId("swap-buy-from-asset")).toBeInTheDocument();
  });

  it("no type yet → no money source either", () => {
    render(<HoldingSheet {...baseProps} holding={null} />);
    expect(screen.queryByTestId("swap-buy-from-asset")).toBeNull();
  });

  it("from another asset: sells the source into the new asset", async () => {
    sellMutate.mockClear();
    createMutate.mockClear();
    render(<HoldingSheet {...baseProps} holding={cashNew()} />);
    fireEvent.change(screen.getByTestId("holding-sheet-amount"), {
      target: { value: "500" },
    });
    fireEvent.click(screen.getByTestId("swap-buy-from-asset"));
    fireEvent.keyDown(screen.getByTestId("swap-buy-src"), { key: "Enter" });
    fireEvent.keyDown(await screen.findByTestId("swap-buy-src-option-ike"), {
      key: "Enter",
    });
    expect(screen.getByTestId("swap-buy-takes")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("holding-sheet-submit"));
    expect(createMutate).not.toHaveBeenCalled();
    expect(sellMutate).toHaveBeenCalledTimes(1);
    const { holdingId, body } = sellMutate.mock.calls[0]![0];
    expect(holdingId).toBe("ike");
    expect(body).toMatchObject({
      left: { valueCents: "11950000" },
      destination: {
        kind: "new",
        holding: { name: "EUR Cash", uiType: "cash" },
      },
      receivedCents: "50000",
      receivedCurrency: "USD",
    });
    expect(body.destination.holding.buyPriceCents).toBeUndefined();
    expect(body.destination.holding.openedOn).toBeUndefined();
  });
});
