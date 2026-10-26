/**
 * sell-sheet.test.tsx — Phase 13 Sell (UI-SPEC §3; D-01..D-04, D-17, D-20).
 * "How much is left?" → "Where did the money go?" → amount received → date,
 * live preview mirroring the server booking, one POST /sell.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HoldingDto } from "../../src/hooks/use-investments";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key}(${Object.entries(params)
          .map(([k, v]) => `${k}=${v}`)
          .join(",")})`
      : key,
  useLocale: () => "en",
}));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/budget-fetch", () => ({ clientApiFetch: fetchMock }));
const writeMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => writeMock(...a),
  isOfflineWriteError: () => false,
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("../../src/components/common/currency-picker", () => ({
  CurrencyPicker: ({
    value,
    onSelect,
  }: {
    value: string;
    onSelect: (v: string) => void;
  }) => (
    <select
      data-testid="sell-currency"
      value={value}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="PLN">PLN</option>
      <option value="EUR">EUR</option>
    </select>
  ),
}));
vi.mock("../../src/components/budgeting/wallets-tab/holding-sheet", () => ({
  HoldingFormFields: ({ onChange }: { onChange: (h: unknown) => void }) => (
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
  }: {
    value: string;
    onChange: (v: string) => void;
    testId?: string;
  }) => (
    <input
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { SellSheet } from "../../src/components/budgeting/wallets-tab/sell-sheet";

const base: HoldingDto = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Broker",
  holdingType: "other",
  uiType: "broker",
  icon: null,
  color: null,
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
  buyPriceCents: "5500000",
  buyCurrency: "PLN",
  currentPriceCents: "9600000",
  currentPriceCurrency: "PLN",
  priceFetchedAt: null,
  valueCents: "9600000",
  valueInBudgetCents: "9600000",
  costInBudgetCents: "5500000",
  profitLossPct: 74.5,
  profitLossCents: "4100000",
  weightPct: 100,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00Z",
  depositRateBps: null,
  depositStartDate: null,
  depositEndDate: null,
  depositCapFrequency: null,
};
const cash: HoldingDto = {
  ...base,
  id: "22222222-2222-2222-2222-222222222222",
  name: "Cash",
  uiType: "cash",
  holdingType: "cash_fx",
};

function renderSheet(holding: HoldingDto, onOpenChange = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <SellSheet
        open
        onOpenChange={onOpenChange}
        budgetId="b1"
        budgetCurrency="PLN"
        holding={holding}
        holdings={[holding, cash]}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}
const type = (id: string, v: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value: v } });

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ rate: "1" }), { status: 200 }),
  );
  writeMock.mockReset();
  toastMock.success.mockReset();
});

describe("Sell sheet", () => {
  it("broker keep 30,000: received prefilled 66,000, realized 28,187.50", async () => {
    renderSheet(base);
    type("sell-left", "30000");
    await waitFor(() =>
      expect(
        (screen.getByTestId("sell-received") as HTMLInputElement).value,
      ).toBe("66000"),
    );
    expect(screen.getByTestId("sell-preview-row")).toHaveTextContent("30,000");
    expect(screen.getByTestId("sell-preview-realized")).toHaveTextContent(
      "+28,187.5",
    );
  });

  it("Sell everything sets left to 0", () => {
    renderSheet(base);
    fireEvent.click(screen.getByTestId("sell-all"));
    expect((screen.getByTestId("sell-left") as HTMLInputElement).value).toBe(
      "0",
    );
  });

  it("partial deposit sale: realized = all interest so far (D-20)", async () => {
    renderSheet({
      ...base,
      uiType: "deposit",
      holdingType: "deposit",
      buyPriceCents: "1000000",
      currentPriceCents: "1050000",
      valueCents: "1050000",
    });
    type("sell-left", "6500");
    type("sell-received", "4000");
    expect(screen.getByTestId("sell-preview-row")).toHaveTextContent("6,500");
    expect(screen.getByTestId("sell-preview-realized")).toHaveTextContent(
      "+500",
    );
  });

  it("quantity holding: shows what you hold; left = held is refused", () => {
    renderSheet({
      ...base,
      uiType: "crypto",
      holdingType: "crypto",
      quantity: "0.40000000",
      buyPriceCents: "2500000",
      currentPriceCents: "6000000",
      valueCents: "2400000",
    });
    expect(screen.getByText("sell.qtyHelper(qty=0.4)")).toBeInTheDocument();
    type("sell-left", "0.4");
    expect(screen.getByText("sell.errLeftTooHigh")).toBeInTheDocument();
    expect(screen.getByTestId("sell-submit")).toBeDisabled();
  });

  it("destination decides the button: Out = withdrawal, New/Existing = sale", () => {
    renderSheet(base);
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sell-dest-out"));
    expect(screen.getByTestId("sell-submit")).toHaveTextContent(
      "sell.submitWithdraw",
    );
    fireEvent.click(screen.getByTestId("sell-dest-new"));
    expect(screen.getByTestId("sell-submit")).toHaveTextContent(
      "sell.submitSale",
    );
  });

  it("future date and zero received are refused", () => {
    renderSheet(base);
    type("sell-left", "30000");
    type("sell-received", "0");
    expect(screen.getByText("sell.errReceived")).toBeInTheDocument();
    type("sell-date", "2999-01-01");
    expect(screen.getByText("sell.errFuture")).toBeInTheDocument();
  });

  it("posts one sale into an existing holding, toasts and closes", async () => {
    writeMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, archived: false, newHoldingId: null }),
        {
          status: 200,
        },
      ),
    );
    const { onOpenChange } = renderSheet(base);
    type("sell-left", "30000");
    fireEvent.click(screen.getByTestId("sell-dest-existing"));
    type("sell-existing", cash.id);
    type("sell-received", "66000");
    fireEvent.click(screen.getByTestId("sell-submit"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [url, init] = writeMock.mock.calls[0]!;
    expect(String(url)).toBe(`/budgets/b1/investments/${base.id}/sell`);
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      left: { valueCents: "3000000" },
      destination: { kind: "existing", holdingId: cash.id },
      receivedCents: "6600000",
      receivedCurrency: "PLN",
    });
    expect(toastMock.success).toHaveBeenCalledWith("sell.toastSale");
  });

  it("a missing FX rate on the server shows errFx", async () => {
    writeMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "fx_unavailable",
          currency: "EUR",
          date: "2024-01-01",
        }),
        { status: 422 },
      ),
    );
    renderSheet(base);
    type("sell-left", "30000");
    fireEvent.click(screen.getByTestId("sell-dest-out"));
    type("sell-received", "66000");
    fireEvent.click(screen.getByTestId("sell-submit"));
    await waitFor(() =>
      expect(
        screen.getByText("sell.errFx(currency=EUR,date=2024-01-01)"),
      ).toBeInTheDocument(),
    );
  });
});
