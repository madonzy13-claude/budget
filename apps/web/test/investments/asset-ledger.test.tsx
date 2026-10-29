/**
 * asset-ledger.test.tsx — L3 "underground" ledger strip (13.1 D-12..D-19, D-28).
 *
 * Rows come in server order (date desc). Only the server-marked deletable row
 * can reveal a delete; blocked rows explain why on tap; interest rows are
 * auto-calculated and never deletable. The confirm copy depends on what the
 * delete will do (last entry / wallet sale / linked legs / plain entry).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EntryDto } from "../../src/hooks/use-asset-entries";
import { touchSwipe } from "../_helpers/swipe";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
const mockFetch = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: (...a: unknown[]) => mockFetch(...a),
}));
const mockWrite = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/offline-write", () => ({
  clientApiWrite: (...a: unknown[]) => mockWrite(...a),
  isOfflineWriteError: () => false,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../../src/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));

import { AssetLedger } from "../../src/components/budgeting/wallets-tab/asset-ledger";

const e = (over: Partial<EntryDto>): EntryDto => ({
  id: "x",
  kind: "buy",
  effectiveDate: "2026-10-12",
  createdAt: "2026-10-12T10:00:00Z",
  qtyDelta: null,
  priceCents: null,
  amountCents: null,
  amountCurrency: "PLN",
  displayAmountCents: "64000",
  displayCurrency: "PLN",
  realizedBudgetCents: null,
  budgetCurrency: "PLN",
  counterpartyName: null,
  linked: false,
  walletName: null,
  walletDelta: null,
  backfilled: false,
  deletable: false,
  blockedReason: "not_newest",
  isLastEntry: false,
  ...over,
});

const ENTRIES: EntryDto[] = [
  e({
    id: null,
    kind: "interest",
    effectiveDate: "2026-10-20",
    createdAt: null,
    displayAmountCents: "120",
    blockedReason: "interest",
  }),
  e({
    id: "b1",
    kind: "buy",
    qtyDelta: "0.01",
    priceCents: "6400000",
    deletable: true,
    blockedReason: null,
  }),
  e({
    id: "w1",
    kind: "withdraw",
    effectiveDate: "2026-10-03",
    qtyDelta: "-0.005",
    displayAmountCents: "-33000",
    realizedBudgetCents: "4500",
  }),
  e({
    id: "c1",
    kind: "convert_out",
    effectiveDate: "2026-10-01",
    linked: true,
    counterpartyName: "BTC Binance",
    displayAmountCents: "-13000",
    blockedReason: "linked_not_newest",
  }),
];

function mount(entries: EntryDto[] | null, open = true, swipeOffset = 0) {
  mockFetch.mockImplementation(async () =>
    entries === null
      ? new Promise(() => {})
      : new Response(JSON.stringify({ entries }), { status: 200 }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AssetLedger
        budgetId="b1"
        assetId="a1"
        assetName="BTC"
        open={open}
        swipeOffset={swipeOffset}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockWrite.mockReset();
  mockWrite.mockResolvedValue(
    new Response(JSON.stringify({ wipedHoldingId: null, walletId: null }), {
      status: 200,
    }),
  );
});

describe("Asset ledger strip", () => {
  it("renders server order on the ledger lane", async () => {
    mount(ENTRIES);
    const strip = await screen.findByTestId("asset-ledger-a1");
    expect(strip.getAttribute("style")).toContain("var(--surface-ledger-dark)");
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("ledger.kind.interest"),
      expect.stringContaining("ledger.kind.bought"),
      expect.stringContaining("ledger.kind.sold"),
      expect.stringContaining("ledger.kind.convertedOut"),
    ]);
    expect(rows[2]).toHaveTextContent("ledger.realized");
    expect(rows[3]).toHaveTextContent("ledger.toAsset");
    // UAT 13.1 test 13: no "auto calculated" label on interest rows.
    expect(rows[0]).not.toHaveTextContent("ledger.auto");
    // UAT 13.1 test 4: the date carries the year.
    expect(rows[1]).toHaveTextContent(/12 Oct 2026|Oct 12, 2026/);
  });

  // Round-2 gap 4: an inset shadow paints UNDER the element's children, so it
  // must sit on the element that paints the background (draft-row look).
  it("casts the inset top shadow on the row surface that paints the background", async () => {
    mount(ENTRIES);
    const rows = await screen.findAllByRole("row");
    for (const r of rows) {
      const surfaces = r.querySelectorAll<HTMLElement>("[data-ledger-surface]");
      expect(surfaces).toHaveLength(1);
      expect(surfaces[0]!.style.backgroundColor).toBe(
        "var(--surface-ledger-dark)",
      );
      expect(r.style.boxShadow).toBe("");
    }
    const first = rows[0]!.querySelector<HTMLElement>("[data-ledger-surface]")!;
    expect(first.style.boxShadow).toBe("inset 0 6px 8px -6px rgba(0,0,0,0.7)");
    const second = rows[1]!.querySelector<HTMLElement>(
      "[data-ledger-surface]",
    )!;
    expect(second.style.boxShadow).toBe("");
    expect(document.body.innerHTML).not.toContain("--surface-sunken-dark");
  });

  it("loading rows sit on the ledger lane too", async () => {
    mount(null);
    const sk = await screen.findAllByTestId("ledger-skeleton");
    for (const r of sk)
      expect(r.style.backgroundColor).toBe("var(--surface-ledger-dark)");
    expect(document.body.innerHTML).not.toContain("--surface-sunken-dark");
  });

  // Round-2 gap 5: the slide clips vertically only, so a swiped strip is
  // never cut on the left.
  it("clips the slide vertically only", async () => {
    mount(ENTRIES, true, -136);
    const strip = await screen.findByTestId("asset-ledger-a1");
    const slide = strip.closest("[data-ledger-slide]") as HTMLElement;
    const clip = slide.firstElementChild as HTMLElement;
    expect(clip.style.overflowY).toBe("clip");
    expect(clip.style.overflowX).toBe("visible");
    expect(clip.className).not.toMatch(/overflow-hidden/);
  });

  it("a closed ledger stays hidden from assistive tech and inert", async () => {
    mockFetch.mockImplementation(
      async () => new Response(JSON.stringify({ entries: ENTRIES })),
    );
    const qc = new QueryClient();
    const ui = (open: boolean) => (
      <QueryClientProvider client={qc}>
        <AssetLedger budgetId="b1" assetId="a1" assetName="BTC" open={open} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui(true));
    const slide = (await screen.findByTestId("asset-ledger-a1")).closest(
      "[data-ledger-slide]",
    ) as HTMLElement;
    rerender(ui(false));
    expect(slide).toHaveAttribute("aria-hidden", "true");
    expect(slide).toHaveAttribute("inert");
  });

  // Round-2 gap 11: the newest amount is grey like every other.
  it("every amount uses the muted grey, the deletable newest included", async () => {
    mount(ENTRIES);
    const buy = await screen.findByTestId("ledger-row-b1");
    const amount = [...buy.querySelectorAll<HTMLElement>("span")].find((s) =>
      /PLN$/.test(s.textContent ?? ""),
    )!;
    expect(amount.style.color).toBe("var(--muted-foreground)");
    expect(document.body.innerHTML).not.toContain("var(--body-on-dark)");
  });

  // Round-2 gap 13: the server's display quantity drives "±qty @ price".
  it("a one-unit entry reads ±1 @ price", async () => {
    mount([
      e({
        id: "d1",
        kind: "convert_out",
        qtyDelta: null,
        displayQty: "-1",
        priceCents: "69000",
      }),
    ]);
    const row = await screen.findByTestId("ledger-row-d1");
    expect(row).toHaveTextContent("−1 @ 690");
  });

  // Round-2 gap 12: the linked asset line is a step smaller.
  it("the linked asset line is smaller than the date line", async () => {
    mount(ENTRIES);
    const link = await screen.findByText("ledger.toAsset");
    expect(link.style.fontSize).toBe("11px");
  });

  it("slides open, rounds its bottom, and follows the asset's swipe", async () => {
    mount(ENTRIES, true, -136);
    const strip = await screen.findByTestId("asset-ledger-a1");
    expect(strip.className).toMatch(/rounded-b-/);
    expect(strip.style.transform).toBe("translateX(-136px)");
    const slide = strip.closest("[data-ledger-slide]") as HTMLElement;
    expect(slide.style.gridTemplateRows).toBe("1fr");
    expect(slide.className).toContain("transition-[grid-template-rows]");
  });

  it("a convert leg shows its stored amount and currency", async () => {
    mount([
      e({
        id: "ci",
        kind: "convert_in",
        amountCents: "69000",
        amountCurrency: "EUR",
        displayAmountCents: "298080",
        displayCurrency: "PLN",
      }),
    ]);
    const row = await screen.findByTestId("ledger-row-ci");
    expect(row).toHaveTextContent(/\+690(\.00)? EUR/);
    expect(row).not.toHaveTextContent("PLN");
  });

  // UAT 13.1 test 12: swipe to delete, like every other row.
  it("a tap does not reveal delete; a touch swipe does", async () => {
    mount(ENTRIES);
    const buy = await screen.findByTestId("ledger-row-b1");
    const del = screen.getByTestId("ledger-delete-b1");
    fireEvent.click(buy);
    expect(del).toHaveAttribute("data-open", "false");
    touchSwipe(buy, -120);
    expect(del).toHaveAttribute("data-open", "true");
    expect(del).not.toHaveAttribute("aria-disabled");
    expect(del.className).toContain("bg-[var(--destructive)]");
  });

  // E2E [mobile]: the post-swipe click guard swallowed the Delete tap itself.
  it("the revealed delete answers a tap right after the swipe", async () => {
    mount(ENTRIES);
    const buy = await screen.findByTestId("ledger-row-b1");
    touchSwipe(buy, -120);
    fireEvent.click(screen.getByTestId("ledger-delete-b1"));
    expect(
      await screen.findByText("ledger.confirm.entry.title"),
    ).toBeInTheDocument();
  });

  it("a row that cannot go yet has a grey delete that explains why", async () => {
    mount(ENTRIES);
    await screen.findByTestId("ledger-row-w1");
    expect(screen.queryByText("ledger.onlyLatest")).toBeNull();
    const grey = screen.getByTestId("ledger-delete-w1");
    expect(grey).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(grey);
    expect(await screen.findByText("ledger.onlyLatest")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ledger-delete-c1"));
    expect(await screen.findByText("ledger.removeLaterIn")).toBeInTheDocument();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("confirming a plain entry delete calls DELETE /entries/:id", async () => {
    mount(ENTRIES);
    fireEvent.click(await screen.findByTestId("ledger-row-b1"));
    fireEvent.click(screen.getByTestId("ledger-delete-b1"));
    expect(
      await screen.findByText("ledger.confirm.entry.title"),
    ).toBeInTheDocument();
    const action = screen.getByTestId("ledger-delete-confirm-action");
    expect(action.className).toContain("bg-[var(--trading-down)]");
    fireEvent.click(action);
    await waitFor(() => expect(mockWrite).toHaveBeenCalled());
    const [url, init] = mockWrite.mock.calls[0]!;
    expect(url).toBe("/budgets/b1/investments/entries/b1");
    expect((init as RequestInit).method).toBe("DELETE");
  });

  for (const [name, over, variant] of [
    [
      "the last entry",
      { isLastEntry: true, kind: "withdraw", walletName: "Bank" },
      "last",
    ],
    [
      "a sale paid into a wallet",
      { kind: "withdraw", walletName: "Bank", walletDelta: "12.00" },
      "wallet",
    ],
    [
      "a linked leg",
      { kind: "transfer_out", linked: true, counterpartyName: "Cold" },
      "linked",
    ],
  ] as const)
    it(`deleting ${name} uses the ${variant} confirm`, async () => {
      mount([e({ id: "z1", deletable: true, blockedReason: null, ...over })]);
      fireEvent.click(await screen.findByTestId("ledger-row-z1"));
      fireEvent.click(screen.getByTestId("ledger-delete-z1"));
      expect(
        await screen.findByText(`ledger.confirm.${variant}.title`),
      ).toBeInTheDocument();
    });

  it("shows three skeleton rows while loading", async () => {
    mount(null);
    expect(await screen.findAllByTestId("ledger-skeleton")).toHaveLength(3);
  });

  it("does not fetch while closed", async () => {
    mount(ENTRIES, false);
    await new Promise((r) => setTimeout(r, 20));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
