/**
 * investments-section-actions.test.tsx — the asset row actions open the 13.1
 * sheets: Swap → SwapSheet (deposit: Sell only), Edit → EditAssetSheet.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { typeSummaryKey } from "../../src/hooks/use-type-summary";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: vi.fn(),
  isOfflineWriteError: () => false,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("../../src/components/budgeting/wallets-tab/swap-sheet", () => ({
  SwapSheet: ({ holding, open }: { holding: HoldingDto; open: boolean }) =>
    open ? (
      <div data-testid="swap-sheet-stub">{`${holding.id}:${holding.uiType}`}</div>
    ) : null,
}));
vi.mock("../../src/components/budgeting/wallets-tab/edit-asset-sheet", () => ({
  EditAssetSheet: ({
    holding,
    open,
  }: {
    holding: HoldingDto;
    open: boolean;
  }) => (open ? <div data-testid="edit-sheet-stub">{holding.id}</div> : null),
}));
vi.mock("../../src/components/budgeting/wallets-tab/holding-sheet", () => ({
  HoldingSheet: () => null,
}));

import { InvestmentsSection } from "../../src/components/budgeting/wallets-tab/investments-section";

const B = "b1";
const h = (id: string, uiType: string, holdingType: string): HoldingDto =>
  ({
    id,
    name: id,
    holdingType,
    uiType,
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
    buyPriceCents: "100",
    buyCurrency: "PLN",
    currentPriceCents: "100",
    currentPriceCurrency: "PLN",
    priceFetchedAt: null,
    valueCents: "100",
    valueInBudgetCents: "100",
    costInBudgetCents: "100",
    profitLossPct: 0,
    profitLossCents: "0",
    weightPct: 0,
    sortOrder: 1,
    createdAt: "2026-01-01T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
  }) as HoldingDto;

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["budget", B, "detail"], {
    investmentsEnabled: true,
    defaultCurrency: "PLN",
  });
  qc.setQueryData(
    ["budget", B, "investments"],
    [h("c1", "crypto", "crypto"), h("d1", "deposit", "deposit")],
  );
  qc.setQueryData(typeSummaryKey(B), { currency: "PLN", order: [], types: {} });
  render(
    <QueryClientProvider client={qc}>
      <InvestmentsSection budgetId={B} budgetCurrency="PLN" />
    </QueryClientProvider>,
  );
}

describe("Asset row actions", () => {
  it("Swap opens the Swap sheet for that asset", () => {
    mount();
    fireEvent.click(screen.getByTestId("investment-swap-c1"));
    expect(screen.getByTestId("swap-sheet-stub")).toHaveTextContent(
      "c1:crypto",
    );
  });

  it("Swap on a deposit opens the same sheet (it is Sell-only there)", () => {
    mount();
    fireEvent.click(screen.getByTestId("investment-swap-d1"));
    expect(screen.getByTestId("swap-sheet-stub")).toHaveTextContent(
      "d1:deposit",
    );
  });

  it("Edit opens the slim Edit sheet", () => {
    mount();
    fireEvent.click(screen.getByTestId("holding-swipe-edit-c1"));
    expect(screen.getByTestId("edit-sheet-stub")).toHaveTextContent("c1");
  });
});
