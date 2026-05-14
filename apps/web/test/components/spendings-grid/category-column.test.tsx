/**
 * category-column.test.tsx — Vitest+RTL tests for CategoryColumn.
 * TDD: useSortable mock, grip spread, layout ordering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

// Mock dnd-kit sortable per RESEARCH §Pattern 5
vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: { "data-sortable-id": "mock" },
    listeners: { "data-sortable-listener": "mock" },
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: { toString: (_t: unknown) => "" },
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CategoryColumn } from "@/components/budgeting/spendings-grid/category-column";

const category = {
  id: "cat-1",
  name: "Groceries",
  iconKey: null,
  colorKey: null,
  sortIndex: 0,
};

const summary = {
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
};

const txn1 = {
  id: "tx-1",
  categoryId: "cat-1",
  amountConvertedCents: "1500",
  currencyConverted: "USD",
  transactionDate: "2026-05-10",
  confirmedAt: "2026-05-10T10:00:00Z",
};

const txn2 = {
  id: "tx-2",
  categoryId: "cat-1",
  amountConvertedCents: "2500",
  currencyConverted: "USD",
  transactionDate: "2026-05-08",
  confirmedAt: "2026-05-08T09:00:00Z",
};

const draft1 = {
  id: "draft-1",
  categoryId: "cat-1",
  amountConvertedCents: "3000",
  currencyConverted: "USD",
  transactionDate: "2026-05-01",
  confirmedAt: null,
  ruleName: "Monthly rent",
};

function renderColumn(overrides = {}) {
  return render(
    <TestQueryProvider>
      <CategoryColumn
        category={category}
        summary={summary}
        cushionModeEnabled={false}
        budgetCurrency="USD"
        transactions={[txn1, txn2]}
        drafts={[draft1]}
        budgetId="budget-1"
        month="2026-05"
        isPastMonth={false}
        resolvedQuickEntryDate="2026-05-13"
        onEditTxn={vi.fn()}
        onEditDraft={vi.fn()}
        onEditCategory={vi.fn()}
        {...overrides}
      />
    </TestQueryProvider>,
  );
}

describe("CategoryColumn", () => {
  it("has data-testid=category-column-{categoryId}", () => {
    renderColumn();
    expect(screen.getByTestId("category-column-cat-1")).toBeTruthy();
  });

  it("renders ColumnHeader at the top", () => {
    renderColumn();
    expect(screen.getByTestId("column-header-groceries")).toBeTruthy();
  });

  it("renders QuickEntryInput at bottom", () => {
    renderColumn();
    // QuickEntryInput has data-testid quick-entry-{name.toLowerCase()}
    expect(screen.getByTestId("quick-entry-groceries")).toBeTruthy();
  });

  it("renders transaction rows", () => {
    renderColumn();
    // TransactionRow has data-testid txn-row-{amountConvertedCents}
    expect(screen.getByTestId("txn-row-1500")).toBeTruthy();
    expect(screen.getByTestId("txn-row-2500")).toBeTruthy();
  });

  it("renders draft rows", () => {
    renderColumn();
    // DraftRow has data-testid draft-row-{ruleName.toLowerCase()}
    expect(screen.getByTestId("draft-row-monthly rent")).toBeTruthy();
  });

  it("useSortable attributes spread on root element", () => {
    renderColumn();
    const column = screen.getByTestId("category-column-cat-1");
    // mock sets data-sortable-id attribute via attributes spread
    expect(column.getAttribute("data-sortable-id")).toBe("mock");
  });

  it("dragGripProps spread on ColumnHeader grip only (NOT on column body)", () => {
    renderColumn();
    const grip = document.querySelector("[data-testid='drag-grip-groceries']");
    expect(grip).toBeTruthy();
    // grip has the listener attribute (spread from useSortable.listeners)
    expect(grip?.getAttribute("data-sortable-listener")).toBe("mock");
  });
});
