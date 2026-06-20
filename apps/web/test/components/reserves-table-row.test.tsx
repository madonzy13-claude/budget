/**
 * reserves-table-row.test.tsx — Vitest+RTL tests for ReservesTableRow.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md) + 05-19 column reshape: an
 * active row renders ONE editable "Available" value (reserveCents). The
 * per-row Used (U) cell is REMOVED — its sum now lives in the footer. The old
 * Expected/Actual/Share triple is also GONE. Excluded rows render name-only.
 *
 * Coverage:
 *   - active row renders the editable available cell.
 *   - active row renders NO used cell (reserves-used-<id> is gone).
 *   - excluded row renders ONLY the category name (no available, no used).
 *   - opacity styling (muted surface) for excluded rows.
 *   - W-5: data-category-id attribute on row.
 *   - inline-edit fires onUpdate with the cents BigInt.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTableRow } from "../../src/components/budgeting/reserves-tab/reserves-table-row";
import type { ReservesSummaryRow } from "../../src/hooks/use-reserves-summary";

vi.mock("next-intl", () => ({
  useTranslations:
    (ns?: string) => (key: string, vars?: Record<string, unknown>) =>
      vars
        ? `${ns ? `${ns}.` : ""}${key}:${JSON.stringify(vars)}`
        : `${ns ? `${ns}.` : ""}${key}`,
  useLocale: () => "en",
}));

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

const noUsedRow: ReservesSummaryRow = {
  categoryId: "cat-1",
  name: "Housing",
  colorKey: null,
  reserveCents: "30000",
  usedCents: "0",
  overspentCents: "0",
};

const usedRow: ReservesSummaryRow = {
  categoryId: "cat-2",
  name: "Transport",
  colorKey: null,
  reserveCents: "20000",
  usedCents: "5000",
  overspentCents: "0",
};

const excludedRow: ReservesSummaryRow = {
  categoryId: "cat-3",
  name: "Hobbies",
  colorKey: null,
  reserveCents: "50000",
  usedCents: "0",
  overspentCents: "0",
};

function renderRow(
  row: ReservesSummaryRow,
  isExcluded = false,
  onUpdate = vi.fn().mockResolvedValue(undefined),
  onSwipeAction = vi.fn(),
) {
  return render(
    <ReservesTableRow
      row={row}
      currency="EUR"
      isExcluded={isExcluded}
      onUpdate={onUpdate}
      onSwipeAction={onSwipeAction}
    />,
  );
}

describe("ReservesTableRow", () => {
  describe("active row — single Available cell (05-19 reshape)", () => {
    it("renders the editable available cell with the bare reserve value", () => {
      renderRow(noUsedRow);
      const availableCell = screen.getByTestId(
        `reserves-balance-${noUsedRow.categoryId}`,
      );
      expect(availableCell.textContent).toMatch(/300/);
    });

    it("renders NO per-row used cell (column removed in 05-19)", () => {
      renderRow(usedRow);
      expect(
        screen.queryByTestId(`reserves-used-${usedRow.categoryId}`),
      ).not.toBeInTheDocument();
      // The used aria label is gone too — nothing carries the used value.
      expect(
        screen.queryByLabelText(
          `bdp.tab.reserves.row.usedAria:${JSON.stringify({ name: "Transport" })}`,
        ),
      ).toBeNull();
    });

    it("does NOT render any share / actual / used column (all dropped)", () => {
      renderRow(usedRow);
      // The old zero-state aria labels are gone.
      expect(
        screen.queryByLabelText("bdp.tab.reserves.row.zeroShareAria"),
      ).toBeNull();
      expect(
        screen.queryByLabelText("bdp.tab.reserves.row.zeroActualAria"),
      ).toBeNull();
      expect(screen.queryByText(/%$/)).toBeNull();
    });
  });

  describe("excluded row (name-only)", () => {
    it("renders ONLY the category name — no available cell, no used cell", () => {
      renderRow(excludedRow, true);
      expect(screen.getByText("Hobbies")).toBeInTheDocument();
      expect(
        screen.queryByTestId(`reserves-balance-${excludedRow.categoryId}`),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`reserves-used-${excludedRow.categoryId}`),
      ).not.toBeInTheDocument();
    });

    it("row uses the muted excluded surface styling", () => {
      renderRow(excludedRow, true);
      const row = screen.getByTestId(`reserves-row-${excludedRow.categoryId}`);
      expect(row.className).toContain("#14181D");
    });
  });

  describe("mobile swipe action button", () => {
    it("renders an Exclude action button on active rows", () => {
      renderRow(noUsedRow, false);
      const btn = screen.getByTestId(
        `reserves-swipe-action-${noUsedRow.categoryId}`,
      );
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toMatch(/swipeExcludeCta/);
    });

    it("renders a Restore action button on excluded rows", () => {
      renderRow(excludedRow, true);
      const btn = screen.getByTestId(
        `reserves-swipe-action-${excludedRow.categoryId}`,
      );
      expect(btn).toBeInTheDocument();
      expect(btn.textContent).toMatch(/swipeRestoreCta/);
    });
  });

  describe("category name", () => {
    it("renders the category name text in the DOM", () => {
      renderRow(noUsedRow);
      expect(screen.getByText("Housing")).toBeInTheDocument();
    });
  });

  // 260613-v1p: 4px left accent bar driven by the persisted colorKey.
  describe("category color accent bar (260613-v1p)", () => {
    it("renders a w-1 bar with the colorKey hex when colorKey is set", () => {
      const coloredRow: ReservesSummaryRow = { ...noUsedRow, colorKey: "red" };
      renderRow(coloredRow);
      const bar = screen.getByTestId(
        `category-accent-bar-${coloredRow.categoryId}`,
      );
      expect(bar).toBeInTheDocument();
      // red → #EF5350 (happy-dom preserves the hex literal, no rgb() normalize)
      expect(bar.style.backgroundColor.toUpperCase()).toBe("#EF5350");
      expect(bar.className).toContain("w-1");
    });

    it("renders NO bar when colorKey is null", () => {
      renderRow(noUsedRow);
      expect(
        screen.queryByTestId(`category-accent-bar-${noUsedRow.categoryId}`),
      ).toBeNull();
    });

    it("renders the bar on excluded rows too when colored", () => {
      const coloredExcluded: ReservesSummaryRow = {
        ...excludedRow,
        colorKey: "blue",
      };
      renderRow(coloredExcluded, true);
      expect(
        screen.getByTestId(`category-accent-bar-${coloredExcluded.categoryId}`),
      ).toBeInTheDocument();
    });
  });

  describe("W-5 data-category-id attribute", () => {
    it("emits data-category-id on the row element", () => {
      renderRow(noUsedRow);
      const row = screen.getByTestId(`reserves-row-${noUsedRow.categoryId}`);
      expect(row).toHaveAttribute("data-category-id", noUsedRow.categoryId);
    });
  });

  describe("inline-edit reserve save (UAT-PH5-T3-57 regression)", () => {
    it("fires onUpdate when user changes '8' to '800' (cents-string collision guard)", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      // reserveCents = "800" → display shows "8". User types "800" in the editor.
      const eightEurRow: ReservesSummaryRow = {
        categoryId: "cat-collision",
        name: "Collision",
        colorKey: null,
        reserveCents: "800",
        usedCents: "0",
        overspentCents: "0",
      };
      renderRow(eightEurRow, false, onUpdate);

      const { fireEvent } = await import("@testing-library/react");
      const cell = screen.getByTestId(
        `reserves-balance-${eightEurRow.categoryId}`,
      );
      fireEvent.click(cell);

      const editor = screen.getByTestId(
        `reserves-balance-${eightEurRow.categoryId}-editor`,
      );
      const input = editor.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      fireEvent.change(input, { target: { value: "800" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await new Promise((r) => setTimeout(r, 30));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0][0]).toBe(80000n);
    });
  });
});
