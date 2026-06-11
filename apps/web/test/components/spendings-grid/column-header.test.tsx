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

  describe("260611-vuo: archived-column fixes + full-width name + column-wide reveal", () => {
    it("BUG1: non-archived column does not render the archived label", () => {
      renderHeader({
        category: { ...category, name: "Subscription" },
      });
      // t() mock returns the key — an archived label would surface as "archived".
      expect(screen.queryByText("archived")).toBeNull();
    });

    it("BUG1: action buttons live in an absolute overlay cluster (no reserved inline width)", () => {
      renderHeader();
      const cluster = document.querySelector(
        '[data-testid="column-header-actions"]',
      );
      expect(cluster).toBeTruthy();
      // Overlay cluster: absolutely positioned so the hidden pen/trash never
      // steals inline width from the name span.
      expect(cluster!.className).toContain("absolute");
    });

    it("FEATURE4: archived header renders BOTH trash and revert buttons", () => {
      renderHeader({
        archived: true,
        onPermanentDelete: vi.fn(),
        onUnarchive: vi.fn(),
      });
      expect(
        document.querySelector('[data-testid="column-header-trash-groceries"]'),
      ).toBeTruthy();
      expect(
        document.querySelector(
          '[data-testid="column-header-revert-groceries"]',
        ),
      ).toBeTruthy();
    });

    it("FEATURE4: non-archived header renders neither trash nor revert", () => {
      renderHeader();
      expect(
        document.querySelector('[data-testid="column-header-trash-groceries"]'),
      ).toBeNull();
      expect(
        document.querySelector(
          '[data-testid="column-header-revert-groceries"]',
        ),
      ).toBeNull();
    });

    it("FEATURE4: clicking revert calls onUnarchive(categoryId) — no confirm dialog", () => {
      const onUnarchive = vi.fn();
      renderHeader({ archived: true, onUnarchive });
      const revert = document.querySelector(
        '[data-testid="column-header-revert-groceries"]',
      );
      expect(revert).toBeTruthy();
      fireEvent.click(revert!);
      expect(onUnarchive).toHaveBeenCalledWith("cat-1");
    });

    it("BUG2: trash revealed via a summary-cell tap still fires onPermanentDelete", () => {
      const onPermanentDelete = vi.fn();
      renderHeader({ archived: true, onPermanentDelete });
      // Reveal by tapping a summary cell (column-wide reveal), then click trash.
      const overspent = document.querySelector(
        '[data-testid="column-header-groceries-overspent"]',
      );
      fireEvent.click(overspent!);
      const trash = document.querySelector(
        '[data-testid="column-header-trash-groceries"]',
      );
      // Hidden state carries opacity-0 + pointer-events-none — both must be gone.
      expect(trash!.className).not.toContain("opacity-0");
      expect(trash!.className).not.toContain("pointer-events-none");
      fireEvent.click(trash!);
      expect(onPermanentDelete).toHaveBeenCalledWith("cat-1");
    });

    it("FEATURE3: clicking the overspent cell reveals the pen (reveal lifted to header root)", () => {
      renderHeader();
      const overspent = document.querySelector(
        '[data-testid="column-header-groceries-overspent"]',
      );
      fireEvent.click(overspent!);
      const pen = document.querySelector(
        '[data-testid="column-header-pen-groceries"]',
      );
      expect(pen!.className).not.toContain("opacity-0");
      expect(pen!.className).not.toContain("pointer-events-none");
    });

    it("FEATURE3: clicking the balance (left) cell reveals the pen", () => {
      renderHeader();
      const balance = document.querySelector(
        '[data-testid="column-header-groceries-balance"]',
      );
      fireEvent.click(balance!);
      const pen = document.querySelector(
        '[data-testid="column-header-pen-groceries"]',
      );
      expect(pen!.className).not.toContain("opacity-0");
      expect(pen!.className).not.toContain("pointer-events-none");
    });

    it("FEATURE3: header root carries the group class + column-header-root testid", () => {
      renderHeader();
      const root = document.querySelector('[data-testid="column-header-root"]');
      expect(root).toBeTruthy();
      expect(root!.className).toContain("group");
    });
  });
});
