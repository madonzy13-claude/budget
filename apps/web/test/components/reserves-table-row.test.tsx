/**
 * reserves-table-row.test.tsx — Vitest+RTL tests for ReservesTableRow.
 *
 * Coverage:
 * - walletSharePercent===null → share cell renders "—"
 * - walletSharePercent present → renders formatted amount + percent
 * - isExcluded=true, reserveBalanceCents="50000" → renders "€500.00" (FROZEN REAL, D-PH5-R10)
 *   AND row has opacity-50 AND share renders "—"
 * - category name present in DOM (T-05-10 — no XSS injection)
 * - data-category-id attribute present (W-5 contract)
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTableRow } from "../../src/components/budgeting/reserves-tab/reserves-table-row";
import type { ReservesSummaryRow } from "../../src/hooks/use-reserves-summary";

// ─── mock dnd-kit (no DOM drag API in happy-dom) ────────────────────────────

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
  }),
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PointerSensor: class {},
  TouchSensor: class {},
  KeyboardSensor: class {},
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

// ─── fixtures ────────────────────────────────────────────────────────────────

const noShareRow: ReservesSummaryRow = {
  categoryId: "cat-1",
  name: "Housing",
  reserveBalanceCents: "30000",
  walletSharePercent: null,
  walletShareAmountCents: null,
};

const withShareRow: ReservesSummaryRow = {
  categoryId: "cat-2",
  name: "Transport",
  reserveBalanceCents: "20000",
  walletSharePercent: 30.5,
  walletShareAmountCents: "30000",
};

const excludedRow: ReservesSummaryRow = {
  categoryId: "cat-3",
  name: "Hobbies",
  reserveBalanceCents: "50000",
  walletSharePercent: null,
  walletShareAmountCents: null,
};

function renderRow(
  row: ReservesSummaryRow,
  isExcluded = false,
  onUpdate = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <ReservesTableRow
      row={row}
      currency="EUR"
      isExcluded={isExcluded}
      onUpdate={onUpdate}
    />,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ReservesTableRow", () => {
  describe("wallet share column — em-dash logic (D-PH5-R4)", () => {
    it("renders '—' when walletSharePercent is null (Active row with no share)", () => {
      renderRow(noShareRow);
      expect(screen.getByLabelText("No share")).toBeInTheDocument();
    });

    it("renders formatted amount and percent when walletSharePercent is set", () => {
      renderRow(withShareRow);
      // 30.5% label present
      expect(screen.getByText(/30\.50%/)).toBeInTheDocument();
    });
  });

  describe("excluded row (D-PH5-R10)", () => {
    it("renders the FROZEN REAL reserve balance (not zero, not em-dash)", () => {
      renderRow(excludedRow, true);
      // 50000 cents = €500.00 — must be visible
      // Intl.NumberFormat locale varies; check for 500 in text
      const balanceCell = screen.getByTestId(
        `reserves-balance-${excludedRow.categoryId}`,
      );
      expect(balanceCell.textContent).toMatch(/500/);
    });

    it("row has opacity-50 class for excluded styling", () => {
      renderRow(excludedRow, true);
      const row = screen.getByTestId(`reserves-row-${excludedRow.categoryId}`);
      expect(row.className).toContain("opacity-50");
    });

    it("share column renders '—' for excluded row regardless of walletSharePercent", () => {
      const excludedWithShare: ReservesSummaryRow = {
        ...excludedRow,
        walletSharePercent: 99,
        walletShareAmountCents: "99000",
      };
      renderRow(excludedWithShare, true);
      expect(screen.getByLabelText("No share")).toBeInTheDocument();
    });
  });

  describe("category name", () => {
    it("renders the category name text in the DOM", () => {
      renderRow(noShareRow);
      expect(screen.getByText("Housing")).toBeInTheDocument();
    });
  });

  describe("W-5 data-category-id attribute", () => {
    it("emits data-category-id on the row element", () => {
      renderRow(noShareRow);
      const row = screen.getByTestId(`reserves-row-${noShareRow.categoryId}`);
      expect(row).toHaveAttribute("data-category-id", noShareRow.categoryId);
    });
  });
});
