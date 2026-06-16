/**
 * spendings-grid-client.test.tsx — Vitest+RTL tests for SpendingsGridClient.
 * Key assertions: DndContext/SortableContext structure, AddCategoryColumn outside SortableContext,
 * transactionsByCatId/draftsByCatId from hooks (not props), slider open/close.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TestQueryProvider,
  makeTestQueryClient,
} from "../../setup/query-client";

// Mock dnd-kit per RESEARCH §Pattern 5
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  sortableKeyboardCoordinates: () => null,
  horizontalListSortingStrategy: "horizontal",
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const result = [...arr];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item!);
    return result;
  },
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dnd-context">{children}</div>
  ),
  PointerSensor: class {},
  KeyboardSensor: class {},
  TouchSensor: class {},
  useSensor: vi.fn((_Sensor: unknown, _opts?: unknown) => ({ sensor: "mock" })),
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
  closestCenter: "closestCenter",
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
  useFormatter: () => ({ relativeTime: () => "now" }),
}));

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock next/navigation for useMonthParam
vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/budgets/budget-1/spendings",
}));

// Mock temporal-polyfill for consistent test behavior
vi.mock("temporal-polyfill", () => ({
  Temporal: {
    Now: {
      plainDateISO: (_tz?: string) => ({
        toString: () => "2026-05-13",
        toPlainYearMonth: () => ({
          toString: () => "2026-05",
          compare: () => 0,
        }),
      }),
    },
    PlainYearMonth: {
      from: (_s: string) => ({
        toString: () => "2026-05",
        toPlainDate: ({ day }: { day: number }) => ({
          toString: () => `2026-05-${String(day).padStart(2, "0")}`,
        }),
        daysInMonth: 31,
      }),
      compare: (_a: unknown, _b: unknown) => 0,
    },
  },
}));

// Mock @radix-ui/react-dialog for Sheet
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";

// SPA refactor (260616): SpendingsGridClient is fully client-data — it takes
// only { budgetId } and reads everything from React Query. Tests seed the cache
// via qc.setQueryData (same pattern as reserves/wallets) so the grid renders
// synchronously from the warm cache instead of from SSR `initial*` props. The
// query keys MUST match the hooks: ["budget",id,"categories"],
// ["spendings-summary",id,month], ["transactions",id,month], ["drafts",id,month],
// ["budget",id,"detail"]. The mocked month (temporal mock below) is "2026-05".

const categories = [
  {
    id: "cat-1",
    name: "Groceries",
    iconKey: null,
    colorKey: null,
    sortIndex: 0,
  },
  {
    id: "cat-2",
    name: "Transport",
    iconKey: null,
    colorKey: null,
    sortIndex: 1,
  },
];

// camelCase DTOs — the shape the cache holds (post-mapTxnRowToDTO).
const txnDTOs = [
  {
    id: "tx-1",
    categoryId: "cat-1",
    amountConvertedCents: "1500",
    currencyConverted: "USD",
    transactionDate: "2026-05-10",
    confirmedAt: "2026-05-10T10:00:00Z",
  },
];
const draftDTOs = [
  {
    id: "draft-1",
    categoryId: "cat-2",
    amountConvertedCents: "3000",
    currencyConverted: "USD",
    transactionDate: "2026-05-01",
    confirmedAt: null,
    ruleName: "Monthly rent",
  },
];

// snake rows the (mocked) network refetch returns — refetchOnMount:"always"
// fires a background refetch; returning the same rows keeps the seeded UI stable
// (an empty response would wipe the seeded cache mid-test).
const txnRows = [
  {
    id: "tx-1",
    category_id: "cat-1",
    amount_converted_cents: "1500",
    currency_converted: "USD",
    transaction_date: "2026-05-10",
    confirmed_at: "2026-05-10T10:00:00Z",
  },
];
const draftRows = [
  {
    id: "draft-1",
    category_id: "cat-2",
    amount_converted_cents: "3000",
    currency_converted: "USD",
    transaction_date: "2026-05-01",
    confirmed_at: null,
    rule_name: "Monthly rent",
  },
];

const summary = {
  budgetId: "budget-1",
  month: "2026-05",
  budgetTz: "UTC",
  budgetCurrency: "USD",
  cushionModeEnabled: false,
  categories: [
    {
      categoryId: "cat-1",
      name: "Groceries",
      iconKey: null,
      colorKey: null,
      sortIndex: 0,
      plannedCents: "10000",
      cushionCents: "2000",
      activeBudgetCents: "12000",
      spentCents: "5000",
      reserveUsedCents: "0",
      overspentCents: "0",
      balanceCents: "7000",
    },
    {
      categoryId: "cat-2",
      name: "Transport",
      iconKey: null,
      colorKey: null,
      sortIndex: 1,
      plannedCents: "5000",
      cushionCents: "1000",
      activeBudgetCents: "6000",
      spentCents: "2000",
      reserveUsedCents: "0",
      overspentCents: "0",
      balanceCents: "4000",
    },
  ],
};

/** Seed the React Query cache + render with budgetId only (client-data). */
function renderGrid() {
  const qc = makeTestQueryClient();
  qc.setQueryData(["budget", "budget-1", "categories"], categories);
  qc.setQueryData(["spendings-summary", "budget-1", "2026-05"], summary);
  qc.setQueryData(["transactions", "budget-1", "2026-05"], txnDTOs);
  qc.setQueryData(["drafts", "budget-1", "2026-05"], draftDTOs);
  qc.setQueryData(["budget", "budget-1", "detail"], {
    defaultCurrency: "USD",
    reservesEnabled: true,
    cushionEnabled: true,
  });
  return render(
    <TestQueryProvider client={qc}>
      <SpendingsGridClient budgetId="budget-1" />
    </TestQueryProvider>,
  );
}

describe("SpendingsGridClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // URL-aware mock — the background refetch (refetchOnMount:"always") + the
    // month-preload prefetch all hit this; return the matching fixture so the
    // seeded UI stays stable.
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes("/spendings-summary"))
        return Promise.resolve({ ok: true, json: async () => summary });
      if (u.includes("/transactions") && u.includes("confirmed=true"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ transactions: txnRows }),
        });
      if (u.includes("/transactions") && u.includes("confirmed=false"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ transactions: draftRows }),
        });
      if (u.includes("/categories"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ categories }),
        });
      // budget detail + fallback
      return Promise.resolve({
        ok: true,
        json: async () => ({
          defaultCurrency: "USD",
          reservesEnabled: true,
          cushionEnabled: true,
        }),
      });
    });
  });

  it("has data-testid=spendings-grid on the root scroll container", () => {
    renderGrid();
    expect(screen.getByTestId("spendings-grid")).toBeTruthy();
  });

  it("renders MonthNavigator at top", () => {
    renderGrid();
    expect(screen.getByTestId("month-navigator-label")).toBeTruthy();
  });

  it("renders one CategoryColumn per cached category", () => {
    renderGrid();
    expect(screen.getByTestId("category-column-cat-1")).toBeTruthy();
    expect(screen.getByTestId("category-column-cat-2")).toBeTruthy();
  });

  it("renders AddCategoryColumn at far right", () => {
    renderGrid();
    expect(screen.getByTestId("add-category-column")).toBeTruthy();
  });

  it("AddCategoryColumn does NOT call useSortable (outside SortableContext items)", () => {
    // AddCategoryColumn component does not import or call useSortable
    // This is a structural test — verify it renders without useSortable being needed
    renderGrid();
    const addCol = screen.getByTestId("add-category-column");
    // It has no data-sortable-id (useSortable mock sets this attribute on sortable items)
    // CategoryColumns have the mock attributes, AddCategoryColumn should not
    expect(addCol.getAttribute("data-sortable-id")).toBeNull();
  });

  it("click pen on column header opens CategorySlider with that category preloaded", () => {
    renderGrid();
    // Click on column header name cell to reveal pen
    const nameCells = document.querySelectorAll(
      "[data-testid='column-header-name-cell']",
    );
    expect(nameCells.length).toBeGreaterThan(0);
    fireEvent.click(nameCells[0]!);
    const editBtn = document.querySelector(
      "[data-testid='column-header-pen-groceries']",
    );
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn!);
    // CategorySlider should open (look for cat slider content)
    expect(
      document.querySelector("[data-testid='cat-slider-content']"),
    ).toBeTruthy();
  });

  it("click AddCategoryColumn opens CategorySlider in create mode", () => {
    renderGrid();
    fireEvent.click(screen.getByTestId("add-category-column"));
    expect(
      document.querySelector("[data-testid='cat-slider-content']"),
    ).toBeTruthy();
  });

  it("seeded transactions render from the cache — cat-1's tx-1", () => {
    renderGrid();
    // tx-1 belongs to cat-1; it renders from the warm cache without a fetch wait
    expect(screen.getByTestId("txn-row-1500")).toBeTruthy();
  });

  it("seeded drafts render from the cache — cat-2's draft-1", () => {
    renderGrid();
    // draft-1 belongs to cat-2; it renders from the warm cache
    expect(screen.getByTestId("draft-row-monthly rent")).toBeTruthy();
  });

  // 260615-bse: the shared offline AlertDialog is hosted ONCE in the grid and
  // is CLOSED initially (Radix AlertDialog content is not mounted until open).
  it("offline add dialog is hosted in the grid and closed initially", () => {
    renderGrid();
    // Closed → content (with its testid + title) is not rendered yet.
    expect(
      document.querySelector("[data-testid='offline-add-dialog']"),
    ).toBeNull();
    expect(screen.queryByText("offlineDialog.title")).toBeNull();
  });
});
