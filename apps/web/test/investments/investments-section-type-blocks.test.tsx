/**
 * investments-section-type-blocks.test.tsx — Phase 13 type groups (D-13..D-16).
 * One block per type that has holdings, saved order first, hidden types'
 * realized in the portfolio total, collapse per type. Plus useSetTypeOrder's
 * optimistic order + rollback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  renderHook,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { HoldingDto } from "../../src/hooks/use-investments";
import type { TypeSummaryDto } from "../../src/lib/investment-type-groups";

vi.mock("next-intl", () => ({
  useTranslations:
    (_ns: string) => (key: string, params?: Record<string, unknown>) => {
      let s =
        (
          {
            "uitype.stocks": "Stocks & ETFs",
            "uitype.crypto": "Crypto",
            "ledger.realized": "realized {amount}",
          } as Record<string, string>
        )[key] ?? key;
      if (params)
        for (const [k, v] of Object.entries(params))
          s = s.replace(`{${k}}`, String(v));
      return s;
    },
  useLocale: () => "en",
}));
vi.mock("../../src/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(() => new Promise(() => {})),
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
vi.mock("../../src/components/budgeting/wallets-tab/holding-sheet", () => ({
  HoldingSheet: () => null,
}));

import { InvestmentsSection } from "../../src/components/budgeting/wallets-tab/investments-section";
import {
  useSetTypeOrder,
  typeSummaryKey,
} from "../../src/hooks/use-type-summary";

const B = "b1";
let seq = 0;
function h(over: Partial<HoldingDto>): HoldingDto {
  seq++;
  return {
    id: `h${seq}`,
    name: `H${seq}`,
    holdingType: "equities",
    uiType: "stocks",
    icon: null,
    color: null,
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
    buyPriceCents: "100000",
    buyCurrency: "PLN",
    currentPriceCents: "150000",
    currentPriceCurrency: "PLN",
    priceFetchedAt: null,
    valueCents: "150000",
    valueInBudgetCents: "150000",
    costInBudgetCents: "100000",
    profitLossPct: 50,
    profitLossCents: "50000",
    weightPct: 0,
    sortOrder: seq,
    createdAt: "2026-01-01T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
    ...over,
  };
}

function client(holdings: HoldingDto[], summary?: TypeSummaryDto) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["budget", B, "detail"], {
    investmentsEnabled: true,
    defaultCurrency: "PLN",
  });
  qc.setQueryData(["budget", B, "investments"], holdings);
  if (summary) qc.setQueryData(typeSummaryKey(B), summary);
  return qc;
}

const renderSection = (qc: QueryClient) =>
  render(
    <QueryClientProvider client={qc}>
      <InvestmentsSection budgetId={B} budgetCurrency="PLN" />
    </QueryClientProvider>,
  );

const headerOrder = () =>
  [...document.querySelectorAll('[data-testid^="investment-group-"]')]
    .map((el) => el.getAttribute("data-testid")!)
    .filter(
      (id) =>
        /^investment-group-[a-z_]+$/.test(id) && !/toggle|chevron/.test(id),
    );

beforeEach(() => {
  mockWrite.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("Investments as type groups", () => {
  it("one header per held type, saved order first; sold-out types hidden but counted", () => {
    renderSection(
      client(
        [
          h({ uiType: "stocks" }),
          h({ uiType: "crypto", holdingType: "crypto" }),
        ],
        {
          currency: "PLN",
          order: ["crypto"],
          types: {
            broker: {
              realizedBudgetCents: "500000",
              soldCostBudgetCents: "1000000",
            },
          },
        },
      ),
    );
    expect(headerOrder()).toEqual([
      "investment-group-crypto",
      "investment-group-stocks",
    ]);
    expect(screen.queryByTestId("investment-group-broker")).toBeNull();
    // UAT 13.1 test 3: realized lives in the type header sum-up only.
    expect(screen.queryByTestId("investments-total-realized")).toBeNull();
  });

  it("assets sit indented under their type header (UAT 13.1 test 4)", () => {
    renderSection(
      client([h({ uiType: "stocks" })], {
        currency: "PLN",
        order: [],
        types: {},
      }),
    );
    const block = document.querySelector("[data-asset-block]")!;
    expect(block.className).toMatch(/(^|\s)pl-\d/);
    expect(screen.getByTestId("investment-group-stocks").className).not.toMatch(
      /(^|\s)(pl|ml)-\d/,
    );
  });

  it("a single-holding type still gets a header (D-13)", () => {
    renderSection(
      client([h({ uiType: "stocks" })], {
        currency: "PLN",
        order: [],
        types: {},
      }),
    );
    expect(screen.getByTestId("investment-group-stocks")).toBeInTheDocument();
  });

  it("collapsing a block hides its rows; the choice is remembered per type", async () => {
    const a = h({ uiType: "stocks" });
    const qc = client([a], { currency: "PLN", order: [], types: {} });
    const { unmount } = renderSection(qc);
    // expanded by default
    expect(
      document.querySelector(`[data-investment-row-wrapper="${a.id}"]`),
    ).not.toBeNull();
    fireEvent.click(screen.getByTestId("investment-group-chevron-stocks"));
    // Round 4: the rows slide shut (hidden from assistive tech at once), then go.
    await waitFor(() =>
      expect(
        document.querySelector(`[data-investment-row-wrapper="${a.id}"]`),
      ).toBeNull(),
    );
    unmount();
    renderSection(qc);
    expect(
      document.querySelector(`[data-investment-row-wrapper="${a.id}"]`),
    ).toBeNull();
  });

  it("renders blocks before the summary loads (realized 0)", () => {
    renderSection(client([h({ uiType: "stocks" })]));
    expect(screen.getByTestId("investment-group-stocks")).toBeInTheDocument();
    expect(screen.queryByTestId("investment-type-realized-stocks")).toBeNull();
  });
});

describe("useSetTypeOrder", () => {
  it("applies the order optimistically and restores it after a 422", async () => {
    const qc = client([], { currency: "PLN", order: ["stocks"], types: {} });
    let resolve!: (r: Response) => void;
    mockWrite.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSetTypeOrder(B), { wrapper });
    act(() => result.current.mutate(["crypto", "stocks"]));
    await waitFor(() =>
      expect(qc.getQueryData<TypeSummaryDto>(typeSummaryKey(B))?.order).toEqual(
        ["crypto", "stocks"],
      ),
    );
    resolve(new Response("{}", { status: 422 }));
    await waitFor(() =>
      expect(qc.getQueryData<TypeSummaryDto>(typeSummaryKey(B))?.order).toEqual(
        ["stocks"],
      ),
    );
  });
});
