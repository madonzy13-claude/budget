/**
 * investments-section-actions.test.tsx — the asset row actions open the 13.1
 * sheets: Swap → SwapSheet (deposit: Sell only), Edit → EditAssetSheet.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { clientApiWrite } from "../../src/lib/offline-write";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HoldingDto } from "../../src/hooks/use-investments";
import { typeSummaryKey } from "../../src/hooks/use-type-summary";
import { entriesKey } from "../../src/hooks/use-asset-entries";
import { clientApiFetch } from "../../src/lib/budget-fetch";

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

function mount(
  entries: Record<string, { id: string | null }[]> = {},
  hidden: HoldingDto[] = [],
) {
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
  qc.setQueryData(["budget", B, "investments", "hidden"], hidden);
  qc.setQueryData(typeSummaryKey(B), { currency: "PLN", order: [], types: {} });
  for (const [id, rows] of Object.entries(entries))
    qc.setQueryData(entriesKey(B, id), rows);
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

  // R6 (user): Hide (was Archive) acts at once — no confirmation.
  it("Hide hides the asset at once and it leaves the list", async () => {
    vi.mocked(clientApiWrite).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    mount();
    fireEvent.click(screen.getByTestId("investment-hide-c1"));
    await waitFor(() => expect(clientApiWrite).toHaveBeenCalled());
    const [url, init] = vi.mocked(clientApiWrite).mock.calls[0]!;
    expect(url).toBe("/budgets/b1/investments/c1/archive");
    expect((init as RequestInit).method).toBe("POST");
    await waitFor(() =>
      expect(
        document.querySelector('[data-investment-row-wrapper="c1"]'),
      ).toBeNull(),
    );
  });

  it("desktop has the same Hide action on hover, also without a confirm", async () => {
    vi.mocked(clientApiWrite).mockReset();
    vi.mocked(clientApiWrite).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    mount();
    fireEvent.click(screen.getByTestId("investment-hide-desktop-c1"));
    await waitFor(() => expect(clientApiWrite).toHaveBeenCalled());
  });

  // R6 (user): a group with hidden assets says how many at its bottom; the
  // link lists them, dimmed, each with Unhide on the swipe.
  it("a group's hidden assets open from its link, dimmed, and Unhide brings one back", async () => {
    vi.mocked(clientApiWrite).mockReset();
    vi.mocked(clientApiWrite).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    mount({}, [h("x1", "crypto", "crypto"), h("x2", "crypto", "crypto")]);
    expect(
      document.querySelector('[data-investment-row-wrapper="x1"]'),
    ).toBeNull();
    const link = screen.getByTestId("hidden-toggle-crypto");
    expect(link.dataset.count).toBe("2");
    expect(screen.queryByTestId("hidden-toggle-deposit")).toBeNull();
    fireEvent.click(link);
    const row = await screen.findByTestId("hidden-asset-x1");
    expect(Number(row.style.opacity)).toBeLessThan(1);
    expect(screen.queryByTestId("investment-hide-x1")).toBeNull();
    fireEvent.click(screen.getByTestId("investment-unhide-x1"));
    await waitFor(() => expect(clientApiWrite).toHaveBeenCalled());
    expect(vi.mocked(clientApiWrite).mock.calls[0]![0]).toBe(
      "/budgets/b1/investments/x1/restore",
    );
  });

  // Round-4 gap 27: every visible asset's ledger is preloaded.
  it("prefetches each asset's entries without opening a ledger", async () => {
    vi.mocked(clientApiFetch).mockClear();
    mount();
    await waitFor(
      () => {
        const urls = vi
          .mocked(clientApiFetch)
          .mock.calls.map(([u]) => String(u));
        expect(urls).toContain("/budgets/b1/investments/c1/entries");
        expect(urls).toContain("/budgets/b1/investments/d1/entries");
      },
      { timeout: 4000 },
    );
  });

  // Round-4 gap 26: nothing but the opening entry → Delete; else Archive.
  it("an asset with only its opening entry offers Delete, which removes it", async () => {
    vi.mocked(clientApiWrite).mockReset();
    vi.mocked(clientApiWrite).mockResolvedValue(
      new Response(JSON.stringify({ wipedHoldingId: "c1" }), { status: 200 }),
    );
    mount({ c1: [{ id: "e-start" }] });
    expect(screen.queryByTestId("investment-hide-c1")).toBeNull();
    fireEvent.click(screen.getByTestId("investment-delete-c1"));
    expect(screen.getByText("ledger.confirm.last.title")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("investment-delete-confirm"));
    await waitFor(() => expect(clientApiWrite).toHaveBeenCalled());
    const [url, init] = vi.mocked(clientApiWrite).mock.calls[0]!;
    expect(url).toBe("/budgets/b1/investments/entries/e-start");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("an asset with transactions offers an amber Hide", () => {
    mount({ c1: [{ id: "e2" }, { id: "e1" }] });
    expect(screen.queryByTestId("investment-delete-c1")).toBeNull();
    expect(screen.getByTestId("investment-hide-c1").className).toMatch(
      /bg-\[var\(--warning\)\]/,
    );
  });
});
