/**
 * column-header.test.tsx — Vitest+RTL tests for ColumnHeader.
 *
 * D-PH4-INT4: double-click on category cells is NO-OP.
 * D-PH4-D3: GripVertical always visible; touch-none.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ColumnHeader } from "../../../src/components/budgeting/spendings-grid/column-header";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const category = {
  id: "cat-1",
  name: "Groceries",
  iconKey: null,
  colorKey: null,
  sortIndex: 0,
};

const summary = {
  plannedCents: "10000",
  cushionCents: "2000",
  activeBudgetCents: "12000",
  spentCents: "5000",
  reserveUsedCents: "0",
  reserveAvailableCents: "0",
  overspentCents: "0",
  balanceCents: "7000",
};

function renderHeader(props = {}) {
  return render(
    <ColumnHeader
      category={category}
      summary={summary}
      cushionModeEnabled={false}
      onEdit={vi.fn()}
      {...props}
    />,
  );
}

describe("ColumnHeader", () => {
  it("has data-testid=column-header-groceries", () => {
    renderHeader();
    expect(screen.getByTestId("column-header-groceries")).toBeTruthy();
  });

  it("renders category name", () => {
    renderHeader();
    expect(screen.getByTestId("column-header-groceries").textContent).toContain(
      "Groceries",
    );
  });

  it("grip element has touch-action:none (D-PH4-D3)", () => {
    renderHeader();
    const grip = document.querySelector('[data-testid="drag-grip-groceries"]');
    expect(grip).toBeTruthy();
    const style = grip?.getAttribute("style") ?? "";
    const className = grip?.className ?? "";
    expect(style + className).toMatch(/touch-none|touchAction/);
  });

  it("row2 caption is 'planned' when cushionModeEnabled=false", () => {
    renderHeader({ cushionModeEnabled: false });
    const header = screen.getByTestId("column-header-groceries");
    expect(header.textContent).toMatch(/planned/i);
  });

  it("row2 caption is 'cushion' when cushionModeEnabled=true", () => {
    renderHeader({ cushionModeEnabled: true });
    const header = screen.getByTestId("column-header-groceries");
    expect(header.textContent).toMatch(/cushion/i);
  });

  it("single click on name reveals pen chip", () => {
    renderHeader();
    // click on the column header area triggers reveal
    const nameCell = document.querySelector(
      '[data-testid="column-header-name-cell"]',
    );
    if (nameCell) fireEvent.click(nameCell);
    else fireEvent.click(screen.getByTestId("column-header-groceries"));
    // After click, edit button should be visible
    const editBtn = document.querySelector(
      '[data-testid="column-header-pen-groceries"]',
    );
    expect(editBtn).toBeTruthy();
  });

  describe("D-PH5-R11 cascading-hide surface 2 — Reserves row", () => {
    it("reservesEnabled defaults true → renders Reserves used row", () => {
      renderHeader();
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-used"]',
        ),
      ).toBeTruthy();
    });

    it("reservesEnabled={true} → renders Reserves used row", () => {
      renderHeader({ reservesEnabled: true });
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-used"]',
        ),
      ).toBeTruthy();
    });

    it("reservesEnabled={false} → Reserves used row is hidden from DOM", () => {
      renderHeader({ reservesEnabled: false });
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-used"]',
        ),
      ).toBeNull();
    });

    it("shows 'used / available' — used in the reserves-used testid, available greyed alongside", () => {
      renderHeader({
        summary: {
          ...summary,
          reserveUsedCents: "2800",
          reserveAvailableCents: "8000",
        },
      });
      const used = document.querySelector(
        '[data-testid="column-header-groceries-reserves-used"]',
      );
      const avail = document.querySelector(
        '[data-testid="column-header-groceries-reserves-available"]',
      );
      expect(used?.textContent).toContain("28"); // used (white), bare-formatted
      expect(avail?.textContent).toContain("/");
      expect(avail?.textContent).toContain("80"); // available (grey), bare-formatted
    });

    it("included + zero reserve still shows '0 / 0'", () => {
      renderHeader({
        summary: {
          ...summary,
          reserveUsedCents: "0",
          reserveAvailableCents: "0",
          reserveExcluded: false,
        },
      });
      const avail = document.querySelector(
        '[data-testid="column-header-groceries-reserves-available"]',
      );
      expect(avail?.textContent).toContain("/");
      expect(avail?.textContent).toContain("0");
    });

    it("excluded + used>0 → 'used / —'", () => {
      renderHeader({
        summary: {
          ...summary,
          reserveUsedCents: "4500",
          reserveAvailableCents: "0",
          reserveExcluded: true,
        },
      });
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-used"]',
        )?.textContent,
      ).toContain("45");
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-available"]',
        )?.textContent,
      ).toContain("—");
    });

    it("excluded + used 0 → just '—' (no available span)", () => {
      renderHeader({
        summary: {
          ...summary,
          reserveUsedCents: "0",
          reserveAvailableCents: "0",
          reserveExcluded: true,
        },
      });
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-used"]',
        )?.textContent,
      ).toBe("—");
      expect(
        document.querySelector(
          '[data-testid="column-header-groceries-reserves-available"]',
        ),
      ).toBeNull();
    });
  });

  it("archived → red trash replaces the edit pen; click fires onPermanentDelete", () => {
    const onPermanentDelete = vi.fn();
    renderHeader({ archived: true, onPermanentDelete });
    expect(
      document.querySelector('[data-testid="column-header-pen-groceries"]'),
    ).toBeNull();
    const trash = document.querySelector(
      '[data-testid="column-header-trash-groceries"]',
    );
    expect(trash).toBeTruthy();
    fireEvent.click(trash!);
    expect(onPermanentDelete).toHaveBeenCalledWith("cat-1");
  });

  it("not archived → edit pen present, no trash", () => {
    renderHeader();
    expect(
      document.querySelector('[data-testid="column-header-pen-groceries"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-testid="column-header-trash-groceries"]'),
    ).toBeNull();
  });

  it("REGRESSION-GUARD (D-PH4-INT4): double-click on header cell does NOTHING", () => {
    const onEdit = vi.fn();
    renderHeader({ onEdit });
    const header = screen.getByTestId("column-header-groceries");
    act(() => {
      fireEvent.doubleClick(header);
    });
    // onEdit should NOT be called from double-click
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("click pen chip calls onEdit(categoryId)", () => {
    const onEdit = vi.fn();
    renderHeader({ onEdit });
    const nameCell = document.querySelector(
      '[data-testid="column-header-name-cell"]',
    );
    if (nameCell) fireEvent.click(nameCell);
    else fireEvent.click(screen.getByTestId("column-header-groceries"));
    const editBtn = document.querySelector(
      '[data-testid="column-header-pen-groceries"]',
    );
    if (editBtn) fireEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith("cat-1");
  });

  it("clamps the Left row to 0 when the category is overspent (negative balance)", () => {
    renderHeader({
      summary: { ...summary, balanceCents: "-52900", overspentCents: "52900" },
    });
    const left = screen.getByTestId("column-header-groceries-balance");
    expect(left.textContent).toBe("0");
  });
});
