/**
 * investments-section-dnd.test.tsx — Phase 13 type-block DnD (D-12).
 *
 * happy-dom has no layout, so dnd-kit's sensors cannot resolve collisions here.
 * Like wallets-sectioned-list.test.tsx, DndContext is replaced by a stub that
 * captures its handlers, and the test fires them with the active/over ids the
 * real sensors would produce. Live drag is verified with Playwright.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HoldingDto } from "../../src/hooks/use-investments";
import type { TypeSummaryDto } from "../../src/lib/investment-type-groups";

const dnd = vi.hoisted(() => ({
  onDragStart: null as null | ((e: unknown) => void),
  onDragEnd: null as null | ((e: unknown) => void),
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragStart: (e: unknown) => void;
    onDragEnd: (e: unknown) => void;
  }) => {
    dnd.onDragStart = onDragStart;
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  closestCenter: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  MeasuringStrategy: { Always: 0 },
}));
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: <T,>(a: T[], from: number, to: number) => {
    const n = [...a];
    n.splice(to, 0, ...n.splice(from, 1));
    return n;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  sortableKeyboardCoordinates: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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
import { typeSummaryKey } from "../../src/hooks/use-type-summary";

const B = "b1";
const base = (id: string, uiType: string, sortOrder: number): HoldingDto =>
  ({
    id,
    name: id,
    holdingType: uiType === "crypto" ? "crypto" : "equities",
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
    sortOrder,
    createdAt: "2026-01-01T00:00:00Z",
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
  }) as HoldingDto;

const holdings = () => [
  base("s1", "stocks", 1),
  base("s2", "stocks", 2),
  base("c1", "crypto", 3),
];

function mount(order: string[] = []) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(["budget", B, "detail"], {
    investmentsEnabled: true,
    defaultCurrency: "PLN",
  });
  qc.setQueryData(["budget", B, "investments"], holdings());
  qc.setQueryData<TypeSummaryDto>(typeSummaryKey(B), {
    currency: "PLN",
    order,
    types: {},
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <InvestmentsSection budgetId={B} budgetCurrency="PLN" />
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

const drag = async (active: string, over: string | null) =>
  act(async () => {
    dnd.onDragStart?.({ active: { id: active } });
    dnd.onDragEnd?.({
      active: { id: active },
      over: over ? { id: over } : null,
      delta: { x: 0, y: 0 },
    });
  });

const blockOrder = () =>
  [...document.querySelectorAll('[data-testid^="investment-type-block-"]')].map(
    (el) =>
      el.getAttribute("data-testid")!.replace("investment-type-block-", ""),
  );

const writes = (path: string) =>
  mockWrite.mock.calls.filter(([url]) => String(url).endsWith(path));

beforeEach(() => {
  mockWrite.mockReset();
  mockWrite.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("Type-block drag and drop (D-12)", () => {
  it("a holding dropped onto another type's row is a no-op", async () => {
    mount();
    await drag("s2", "c1");
    expect(writes("/reorder")).toHaveLength(0);
    expect(
      document.querySelector(
        '[data-testid="investment-type-block-stocks"] [data-investment-row-wrapper="s2"]',
      ),
    ).not.toBeNull();
  });

  it("reordering inside a type sends one reorder with the flattened order", async () => {
    mount();
    await drag("s2", "s1");
    const calls = writes("/reorder");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String((calls[0]![1] as RequestInit).body))).toEqual({
      orderedIds: ["s2", "s1", "c1"],
    });
  });

  it("dragging the crypto block above stocks saves the type order", async () => {
    const { unmount } = mount();
    expect(blockOrder()).toEqual(["stocks", "crypto"]);
    await drag("type:crypto", "type:stocks");
    const calls = writes("/type-order");
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String((calls[0]![1] as RequestInit).body)) as {
      order: string[];
    };
    expect(sent.order).toEqual(["crypto", "stocks"]);
    expect(blockOrder()).toEqual(["crypto", "stocks"]);
    unmount();
    // A fresh client seeded from what the server now returns keeps the order.
    mount(sent.order);
    expect(blockOrder()).toEqual(["crypto", "stocks"]);
  });

  it("a block dropped onto a row of another type moves next to that type", async () => {
    mount();
    await drag("type:crypto", "s1");
    const sent = JSON.parse(
      String((writes("/type-order")[0]![1] as RequestInit).body),
    ) as { order: string[] };
    expect(sent.order).toEqual(["crypto", "stocks"]);
  });
});
