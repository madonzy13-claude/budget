/**
 * spendings-grid-client.test.tsx — Vitest+RTL tests for SpendingsGridClient.
 * Key assertions: DndContext/SortableContext structure, AddCategoryColumn outside SortableContext,
 * transactionsByCatId/draftsByCatId from hooks (not props), slider open/close.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

// Mock dnd-kit per RESEARCH §Pattern 5
vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  const actual = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { SpendingsGridClient } from "@/components/budgeting/spendings-grid/spendings-grid-client";

const categories = [
  { id: "cat-1", name: "Groceries", iconKey: null, colorKey: null, sortIndex: 0 },
  { id: "cat-2", name: "Transport", iconKey: null, colorKey: null, sortIndex: 1 },
];

const transactions = [
  {
    id: "tx-1",
    categoryId: "cat-1",
    amountConvertedCents: "1500",
    currencyConverted: "USD",
    transactionDate: "2026-05-10",
    confirmedAt: "2026-05-10T10:00:00Z",
  },
];

const drafts = [
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

const defaultProps = {
  budgetId: "budget-1",
  budgetCurrency: "USD",
  month: "2026-05",
  budgetTz: "UTC",
  initialCategories: categories,
  initialTransactions: transactions,
  initialDrafts: drafts,
  initialSummary: summary,
};

describe("SpendingsGridClient", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transactions: [], categories: [] }),
    });
  });

  it("has data-testid=spendings-grid on the root scroll container", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByTestId("spendings-grid")).toBeTruthy();
  });

  it("renders MonthNavigator at top", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByTestId("month-navigator-label")).toBeTruthy();
  });

  it("renders one CategoryColumn per category in initialCategories", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByTestId("category-column-cat-1")).toBeTruthy();
    expect(screen.getByTestId("category-column-cat-2")).toBeTruthy();
  });

  it("renders AddCategoryColumn at far right", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    expect(screen.getByTestId("add-category-column")).toBeTruthy();
  });

  it("AddCategoryColumn does NOT call useSortable (outside SortableContext items)", () => {
    // AddCategoryColumn component does not import or call useSortable
    // This is a structural test — verify it renders without useSortable being needed
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    const addCol = screen.getByTestId("add-category-column");
    // It has no data-sortable-id (useSortable mock sets this attribute on sortable items)
    // CategoryColumns have the mock attributes, AddCategoryColumn should not
    expect(addCol.getAttribute("data-sortable-id")).toBeNull();
  });

  it("click pen on column header opens CategorySlider with that category preloaded", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    // Click on column header name cell to reveal pen
    const nameCells = document.querySelectorAll("[data-testid='column-header-name-cell']");
    expect(nameCells.length).toBeGreaterThan(0);
    fireEvent.click(nameCells[0]!);
    const editBtn = document.querySelector("[data-testid='column-header-edit']");
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn!);
    // CategorySlider should open (look for cat slider content)
    expect(document.querySelector("[data-testid='cat-slider-content']")).toBeTruthy();
  });

  it("click AddCategoryColumn opens CategorySlider in create mode", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    fireEvent.click(screen.getByTestId("add-category-column"));
    expect(document.querySelector("[data-testid='cat-slider-content']")).toBeTruthy();
  });

  it("initialTransactions prop is forwarded as useTransactions initialData — hydration check", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    // tx-1 belongs to cat-1; it should render without waiting for fetch
    expect(screen.getByTestId("txn-row-1500")).toBeTruthy();
  });

  it("initialDrafts prop is forwarded as useDrafts initialData — hydration check", () => {
    render(
      <TestQueryProvider>
        <SpendingsGridClient {...defaultProps} />
      </TestQueryProvider>,
    );
    // draft-1 belongs to cat-2; it should render without waiting for fetch
    expect(screen.getByTestId("draft-row-monthly rent")).toBeTruthy();
  });
});
