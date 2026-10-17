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
        resolvedQuickEntryDate="2026-05-13"
        onEditTxn={vi.fn()}
        onEditDraft={vi.fn()}
        onEditCategory={vi.fn()}
        onOfflineAttempt={vi.fn()}
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

  it("renders QuickEntryInput", () => {
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

  // 260613-v1p: 4px left accent driven by the persisted colorKey.
  //
  // It was an absolutely-positioned child. Measured off a screen recording
  // (user, 261005): during a horizontal scroll that child is rasterised as its
  // own layer and lands on fractional pixels, so it jitters against the column
  // it belongs to — 4px wide one frame, 5px the next, and a 2px jump backwards
  // when the scroll settles. Painting it as the COLUMN'S OWN BACKGROUND means
  // there is no separate layer left to drift: it moves with the column because
  // it IS the column.
  //
  // The look is unchanged. The sticky header band is an opaque child, so it
  // still covers the accent beside the summary rows exactly as the z-0 child
  // did, and the column's rounded corners clip the background for free.
  // 261014 r2: the full-height edge is drawn by EACH surface over its own
  // region — the pinned band paints its 4px, the lane below paints its 4px —
  // so nothing is ever painted THROUGH anything else.
  //
  // r1 put the stripe on the column and opened a transparent window in the
  // band. It flickered and vanished on scroll (user): a pinned band and a
  // scrolling column cannot stay pixel-aligned, so a window in one over a
  // stripe in the other tears. Two abutting stripes have no overlap to tear.
  it("paints the accent on the pinned band, so it shows with no rows at all", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const band = screen.getByTestId("column-sticky-groceries");
    // green → #26A69A (happy-dom preserves the hex literal, no rgb() normalize)
    expect(band.style.backgroundImage.toUpperCase()).toContain("#26A69A");
    expect(band.style.backgroundImage).toContain("4px");
  });

  it("continues it down the lane, so the edge reads as one", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const lane = screen.getByTestId("category-accent-lane-cat-1");
    expect(lane.style.backgroundImage.toUpperCase()).toContain("#26A69A");
  });

  it("never opens a transparent window — that is what tore on scroll", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const band = screen.getByTestId("column-sticky-groceries");
    expect(band.style.backgroundImage).not.toContain("transparent");
  });

  it("leaves the column itself unpainted, so nothing shows through the band", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const col = screen.getByTestId("category-column-cat-1");
    expect(col.style.backgroundImage).toBe("");
  });

  it("paints nothing anywhere when colorKey is null", () => {
    renderColumn({ summary: { ...summary, colorKey: null } });
    expect(
      screen.getByTestId("column-sticky-groceries").style.backgroundImage,
    ).toBe("");
    expect(
      screen.getByTestId("category-accent-lane-cat-1").style.backgroundImage,
    ).toBe("");
  });

  it("carries no separately positioned accent element", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    // The edge is two backgrounds on two surfaces that already exist. No
    // absolutely-positioned bar sitting behind the band — that one flashed
    // during a horizontal scroll (261005) and is not coming back.
    expect(screen.queryByTestId("category-accent-bar-cat-1")).toBeNull();
  });

  it("paints no accent when colorKey is null", () => {
    renderColumn({ summary: { ...summary, colorKey: null } });
    const col = screen.getByTestId("category-column-cat-1");
    expect(col.style.backgroundImage).toBe("");
  });

  it("paints no accent on an archived column even with a colorKey", () => {
    renderColumn({
      summary: { ...summary, colorKey: "green", archived: true },
    });
    const col = screen.getByTestId("category-column-cat-1");
    expect(col.style.backgroundImage).toBe("");
  });
});

/**
 * The summary rows' separators ran the full width of the card, straight across
 * the accent, chopping it into segments (user, 261014, screenshot).
 *
 * Fixed by reserving the stripe's 4px as PADDING rather than painting the
 * stripe underneath full-width rows: the gradient fills the padding, the rows
 * start after it, and a row's border-bottom therefore starts after it too.
 * No per-row border surgery, and nothing overlaps.
 */
describe("the accent is not crossed by row separators", () => {
  it("insets the band's rows past the stripe", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const band = screen.getByTestId("column-sticky-groceries");
    expect(band.className).toContain("pl-1");
  });

  it("insets the lane's rows past it too", () => {
    renderColumn({ summary: { ...summary, colorKey: "green" } });
    const lane = screen.getByTestId("category-accent-lane-cat-1");
    expect(lane.className).toContain("pl-1");
  });

  it("adds no inset when there is no accent to clear", () => {
    renderColumn({ summary: { ...summary, colorKey: null } });
    expect(
      screen.getByTestId("column-sticky-groceries").className,
    ).not.toContain("pl-1");
    expect(
      screen.getByTestId("category-accent-lane-cat-1").className,
    ).not.toContain("pl-1");
  });
});
