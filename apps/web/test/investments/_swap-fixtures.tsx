/**
 * _swap-fixtures.tsx — shared mocks + holdings for the Swap sheet tests.
 * Imported for its vi.mock side effects; not a test file.
 */
import { vi } from "vitest";
import type { HoldingDto } from "../../src/hooks/use-investments";

export const fetchMock = vi.fn();
export const writeMock = vi.fn();
export const toastMock = { success: vi.fn(), error: vi.fn() };
/** Last props the HoldingSheet stub (New transaction's Add form) got. */
// Read only at render time, after this module ran — safe in a vi.mock factory.
export const holdingSheetStub = {
  props: null as null | Record<string, unknown>,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key}(${Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join(",")})`
      : key,
  useLocale: () => "en",
}));
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: fetchMock }));
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => writeMock(...a),
  isOfflineWriteError: () => false,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({
    value,
    onSelect,
    disabled,
    "aria-label": aria,
  }: {
    value: string;
    onSelect: (v: string) => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => (
    <select
      aria-label={aria}
      data-testid="currency-picker"
      disabled={disabled}
      value={value}
      onChange={(e) => onSelect(e.target.value)}
    >
      {["PLN", "EUR", "USD"].map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("../../src/components/budgeting/wallets-tab/holding-sheet", () => ({
  HoldingFormFields: ({
    onChange,
    onPickExisting,
    selectedId,
    excludeId,
  }: {
    onChange: (h: unknown) => void;
    onPickExisting?: (id: string | null) => void;
    selectedId?: string | null;
    excludeId?: string;
  }) => (
    <>
      {/* Round 6: the one Into-investments name field — pick by id, in place. */}
      <span
        data-testid="dest-form-state"
        data-selected={selectedId ?? ""}
        data-exclude={excludeId ?? ""}
      />
      <input
        data-testid="dest-pick"
        onChange={(e) => onPickExisting?.(e.target.value || null)}
      />
      <button
        type="button"
        data-testid="dest-form"
        onClick={() =>
          onChange({
            name: "Erste",
            uiType: "cash",
            holdingType: "cash_fx",
            currentPriceCurrency: "PLN",
          })
        }
      >
        dest
      </button>
      <button
        type="button"
        data-testid="dest-form-qty"
        onClick={() =>
          onChange({
            name: "ETH",
            uiType: "crypto",
            holdingType: "crypto",
            instrumentId: "i2",
            currentPriceCurrency: "PLN",
          })
        }
      >
        dest qty
      </button>
      <button
        type="button"
        data-testid="dest-form-usdt"
        onClick={() =>
          onChange({
            name: "USDT",
            uiType: "crypto",
            holdingType: "crypto",
            instrumentId: "i3",
            currentPriceCurrency: "PLN",
            livePriceCents: "100",
          })
        }
      >
        dest usdt
      </button>
    </>
  ),
  Field: ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  NumericInput: ({
    value,
    onChange,
    testId,
    readOnly,
  }: {
    value: string;
    onChange: (v: string) => void;
    testId?: string;
    readOnly?: boolean;
  }) => (
    <input
      data-testid={testId}
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  // New transaction's embedded Add form: records props, can report dirty /
  // close (round-2 gap 6).
  HoldingSheet: (p: Record<string, unknown>) => {
    holdingSheetStub.props = p;
    return (
      <div data-testid="holding-sheet">
        <button
          type="button"
          data-testid="stub-dirty"
          onClick={() => (p.onDirtyChange as (d: boolean) => void)(true)}
        />
        <button
          type="button"
          data-testid="stub-saved"
          onClick={() => (p.onOpenChange as (o: boolean) => void)(false)}
        />
      </div>
    );
  },
}));

export const H = (over: Partial<HoldingDto>): HoldingDto =>
  ({
    id: "11111111-1111-1111-1111-111111111111",
    name: "BTC",
    holdingType: "crypto",
    uiType: "crypto",
    icon: null,
    color: null,
    instrumentId: "i1",
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    symbol: "BTC",
    instrumentName: "Bitcoin",
    instrumentProvider: "coingecko",
    isCustom: false,
    isDelisted: false,
    quantity: "2",
    buyPriceCents: "5000000",
    buyCurrency: "PLN",
    currentPriceCents: "6000000",
    currentPriceCurrency: "PLN",
    priceFetchedAt: null,
    valueCents: "12000000",
    valueInBudgetCents: "12000000",
    costInBudgetCents: "10000000",
    profitLossPct: 20,
    profitLossCents: "2000000",
    weightPct: 50,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
    ...over,
  }) as HoldingDto;

export const btc = H({});
export const btcCold = H({
  id: "22222222-2222-2222-2222-222222222222",
  name: "BTC Cold",
  quantity: "1",
  valueCents: "6000000",
});
export const sol = H({
  id: "33333333-3333-3333-3333-333333333333",
  name: "SOL",
  instrumentId: "i9",
});
export const broker = H({
  id: "44444444-4444-4444-4444-444444444444",
  name: "IKE",
  holdingType: "other",
  uiType: "broker",
  instrumentId: null,
  symbol: null,
  instrumentName: null,
  quantity: "1",
  buyPriceCents: "10000000",
  currentPriceCents: "12000000",
  valueCents: "12000000",
});
export const cash = H({
  id: "55555555-5555-5555-5555-555555555555",
  name: "Envelope",
  holdingType: "cash_fx",
  uiType: "cash",
  instrumentId: null,
  symbol: null,
  instrumentName: null,
  quantity: "1",
  buyPriceCents: "100000",
  currentPriceCents: "100000",
  valueCents: "100000",
});
export const deposit = H({
  id: "66666666-6666-6666-6666-666666666666",
  name: "Bank 5%",
  holdingType: "deposit",
  uiType: "deposit",
  instrumentId: null,
  quantity: "1",
  valueCents: "1010000",
  buyPriceCents: "1000000",
});

/** entries + wallets + fx routed by URL. */
export function routeFetch(
  opts: {
    latest?: string;
    rate?: string;
    /** Per-asset newest entry date, by holding id. */
    latestOf?: Record<string, string>;
  } = {},
) {
  fetchMock.mockImplementation(async (url: string) => {
    const own = Object.entries(opts.latestOf ?? {}).find(([id]) =>
      url.includes(`/${id}/entries`),
    );
    if (own)
      return new Response(
        JSON.stringify({
          entries: [
            { id: "d1", kind: "buy", effectiveDate: own[1], deletable: true },
          ],
        }),
        { status: 200 },
      );
    if (url.includes("/entries"))
      return new Response(
        JSON.stringify({
          entries: [
            {
              id: "e1",
              kind: "buy",
              effectiveDate: opts.latest ?? "2026-09-01",
              deletable: true,
            },
            {
              id: null,
              kind: "interest",
              effectiveDate: "2099-01-01",
              deletable: false,
            },
          ],
        }),
        { status: 200 },
      );
    if (url.startsWith("/wallets"))
      return new Response(
        JSON.stringify({
          wallets: [
            {
              id: "w-pln",
              name: "Bank",
              walletType: "SPENDINGS",
              currency: "PLN",
              currentBalanceCents: "50000",
              archivedAt: null,
            },
            {
              id: "w-eur",
              name: "Euro",
              walletType: "RESERVE",
              currency: "EUR",
              currentBalanceCents: "1000",
              archivedAt: null,
            },
            {
              id: "w-old",
              name: "Old",
              walletType: "OTHER",
              currency: "PLN",
              currentBalanceCents: "0",
              archivedAt: "2026-01-01",
            },
            {
              id: "w-car",
              name: "Car",
              walletType: "POSSESSION",
              currency: "PLN",
              currentBalanceCents: "0",
              archivedAt: null,
            },
          ],
        }),
        { status: 200 },
      );
    if (url.includes("/names"))
      return new Response(
        JSON.stringify({
          names: [
            {
              id: btcCold.id,
              name: "BTC Cold",
              archived: false,
              instrumentId: "i1",
              valueCents: "6000000",
              valueCurrency: "PLN",
            },
            {
              id: "33333333-3333-3333-3333-333333333333",
              name: "SOL",
              archived: false,
              instrumentId: "i9",
              valueCents: "100",
              valueCurrency: "PLN",
            },
          ],
        }),
        { status: 200 },
      );
    if (url.startsWith("/fx/rate"))
      return new Response(JSON.stringify({ rate: opts.rate ?? "0.25" }), {
        status: 200,
      });
    return new Response("{}", { status: 200 });
  });
}

export const okWrite = (body: unknown = {}) =>
  writeMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status: 201 }),
  );
export const lastBody = () =>
  JSON.parse(String((writeMock.mock.calls.at(-1)![1] as RequestInit).body));
export const lastUrl = () => String(writeMock.mock.calls.at(-1)![0]);
