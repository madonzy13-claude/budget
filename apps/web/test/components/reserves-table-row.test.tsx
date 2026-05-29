/**
 * reserves-table-row.test.tsx — Vitest+RTL tests for ReservesTableRow.
 *
 * Updated for UAT-PH5-T3-55:
 *   - Actions cell removed (no MoreHorizontal placeholder).
 *   - Excluded rows render NAME ONLY (no balance, no share dashes).
 *   - Mobile swipe-action button present per row: "Exclude" on active,
 *     "Restore" on excluded.
 *
 * Remaining coverage:
 *   - D-PH5-R4: active row with null share → share cell renders "—".
 *   - D-PH5-R4: active row with share → renders amount + percent.
 *   - D-PH5-R10: excluded row renders ONLY category name.
 *   - opacity-50 class for excluded styling.
 *   - W-5: data-category-id attribute on row.
 *   - T-05-10: category name in DOM (React auto-escapes).
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
  walletSharePercent: 30,
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
  describe("active row — actual + share columns (D-PH5-R4, UAT-PH5-T3-60 split + T3-61 zero state)", () => {
    it("renders '0' / '0%' on actual + share cells when walletSharePercent is null", () => {
      renderRow(noShareRow);
      // The next-intl mock renders nested keys as `ns.key`; the row
      // translator's namespace is `bdp.tab.reserves.row`, so the zero
      // labels round-trip as the fully-qualified key here.
      expect(
        screen.getByLabelText("bdp.tab.reserves.row.zeroActualAria"),
      ).toHaveTextContent("0");
      expect(
        screen.getByLabelText("bdp.tab.reserves.row.zeroShareAria"),
      ).toHaveTextContent("0%");
    });

    it("UAT-PH5-T3-64: zero actual is destructive-red when expected > 0", () => {
      renderRow(noShareRow); // reserveBalanceCents="30000"
      const actual = screen.getByLabelText(
        "bdp.tab.reserves.row.zeroActualAria",
      );
      expect(actual.className).toContain("--destructive");
    });

    it("UAT-PH5-T3-64: zero actual uses --foreground (white) when expected is 0", () => {
      const zeroExpected: ReservesSummaryRow = {
        ...noShareRow,
        reserveBalanceCents: "0",
      };
      renderRow(zeroExpected);
      const actual = screen.getByLabelText(
        "bdp.tab.reserves.row.zeroActualAria",
      );
      expect(actual.className).toContain("--foreground");
      expect(actual.className).not.toContain("--destructive");
      expect(actual.className).not.toContain("--muted-foreground");
    });

    it("renders percent (Share column) when walletSharePercent is set", () => {
      renderRow(withShareRow);
      expect(screen.getByText(/30%/)).toBeInTheDocument();
    });

    it("balance cell renders bare cents value", () => {
      renderRow(noShareRow);
      const balanceCell = screen.getByTestId(
        `reserves-balance-${noShareRow.categoryId}`,
      );
      expect(balanceCell.textContent).toMatch(/300/);
    });
  });

  describe("excluded row (UAT-PH5-T3-55 + D-PH5-R10)", () => {
    it("renders ONLY the category name — no balance cell, no share cell", () => {
      renderRow(excludedRow, true);
      expect(screen.getByText("Hobbies")).toBeInTheDocument();
      expect(
        screen.queryByTestId(`reserves-balance-${excludedRow.categoryId}`),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("No share")).not.toBeInTheDocument();
    });

    it("row has opacity-50 class for excluded styling", () => {
      renderRow(excludedRow, true);
      const row = screen.getByTestId(`reserves-row-${excludedRow.categoryId}`);
      expect(row.className).toContain("opacity-50");
    });
  });

  describe("mobile swipe action button (UAT-PH5-T3-55)", () => {
    it("renders an Exclude action button on active rows", () => {
      renderRow(noShareRow, false);
      const btn = screen.getByTestId(
        `reserves-swipe-action-${noShareRow.categoryId}`,
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

  describe("inline-edit balance save (UAT-PH5-T3-57 regression)", () => {
    it("fires onUpdate when user changes '8' to '800' (was: cents-string collision silenced save)", async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      // reserveBalanceCents = "800" → display shows "8". User types "800"
      // in the editor. Before the fix, draft="800" collided with the raw
      // cents-string passed as InlineEditCell value, so the cell's
      // equality check bailed out as a no-op.
      const eightEurRow: ReservesSummaryRow = {
        categoryId: "cat-collision",
        name: "Collision",
        reserveBalanceCents: "800",
        walletSharePercent: null,
        walletShareAmountCents: null,
      };
      renderRow(eightEurRow, false, onUpdate);

      const { fireEvent } = await import("@testing-library/react");
      // Open editor.
      const cell = screen.getByTestId(
        `reserves-balance-${eightEurRow.categoryId}`,
      );
      fireEvent.click(cell);

      // The editor wrapper appears with data-editing="true"; its child
      // <input> carries the initial display value.
      const editor = screen.getByTestId(
        `reserves-balance-${eightEurRow.categoryId}-editor`,
      );
      const input = editor.querySelector("input") as HTMLInputElement;
      expect(input).not.toBeNull();
      // Type "800" then press Enter (InlineEditCell editor's onKeyDown
      // routes Enter to onCommit directly — sidesteps the blur-rAF dance
      // that's flaky in happy-dom's activeElement model).
      fireEvent.change(input, { target: { value: "800" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

      await new Promise((r) => setTimeout(r, 30));

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0][0]).toBe(80000n);
    });
  });
});
