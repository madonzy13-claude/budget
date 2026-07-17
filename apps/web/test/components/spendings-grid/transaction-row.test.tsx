/**
 * transaction-row.test.tsx — Vitest+RTL tests for TransactionRow.
 *
 * Reveal model: hover (hover-capable) or tap (touch) reveals chips.
 * Inline edit: single click on the amount while revealed; double-click is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionRow } from "../../../src/components/budgeting/spendings-grid/transaction-row";
import { TestQueryProvider } from "../../setup/query-client";

const mockDeleteMutate = vi.fn();
const mockUpdateMutate = vi.fn();
vi.mock("../../../src/hooks/use-delete-transaction", () => ({
  useDeleteTransaction: () => ({ mutate: mockDeleteMutate }),
}));
vi.mock("../../../src/hooks/use-update-transaction", () => ({
  useUpdateTransaction: () => ({ mutate: mockUpdateMutate }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useLocale: () => "en",
}));

const txn = {
  id: "txn-123",
  amountConvertedCents: "1500",
  currencyConverted: "USD",
  transactionDate: "2026-05-14",
  createdAt: "2026-02-13T15:43:00Z",
  note: null,
};

// Control whether the test "device" reports a hover-capable pointer.
function setHoverCapable(capable: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("hover: hover") ? capable : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderRow(props = {}) {
  return render(
    <TestQueryProvider>
      <TransactionRow
        txn={txn}
        budgetId="budget-1"
        month="2026-05"
        onEdit={vi.fn()}
        {...props}
      />
    </TestQueryProvider>,
  );
}

describe("TransactionRow", () => {
  beforeEach(() => {
    mockDeleteMutate.mockClear();
    mockUpdateMutate.mockClear();
    setHoverCapable(true);
  });

  it("has data-testid=txn-row-1500 (amountConvertedCents)", () => {
    renderRow();
    expect(screen.getByTestId("txn-row-1500")).toBeTruthy();
  });

  it("renders formatted amount text", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(row.textContent).toContain("15");
  });

  it("on focus shows an inline meta line: CREATION date (day + short month, NO year) + note", () => {
    renderRow({
      txn: {
        ...txn,
        transactionDate: "2026-05-14",
        createdAt: "2026-02-13T15:43:00Z",
        note: "Weekly shop",
      },
    });
    // No tooltip primitive is used anymore.
    expect(document.querySelector('[data-testid="txn-tooltip"]')).toBeNull();
    const row = screen.getByTestId("txn-row-1500");
    fireEvent.focus(row);
    const meta = screen.getByTestId("txn-row-meta");
    expect(meta.textContent?.trim()).toBe("13 Feb · Weekly shop"); // no year, + note
    expect(meta.textContent).not.toContain("2026"); // NO year
    expect(meta.textContent).not.toContain("15:43"); // NO time
    expect(meta.textContent).not.toContain("5/14/2026"); // NOT the spending date
  });

  it("meta line is just the date when the transaction has no note", () => {
    renderRow({ txn: { ...txn, note: null } });
    const row = screen.getByTestId("txn-row-1500");
    fireEvent.focus(row);
    const meta = screen.getByTestId("txn-row-meta");
    expect(meta.textContent?.trim()).toBe("13 Feb");
    expect(meta.textContent).not.toContain("·");
  });

  it("resting (unfocused) row shows no meta line", () => {
    renderRow({ txn: { ...txn, note: "Weekly shop" } });
    expect(
      document.querySelector('[data-testid="txn-row-meta"]'),
    ).toBeNull();
  });

  it("hover reveals the edit and delete chips; they persist while focused, hide on blur", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(
      document.querySelector('[data-testid="txn-action-edit"]'),
    ).toBeNull();
    fireEvent.mouseEnter(row); // r40b: focus-follows-mouse focuses the row too
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
    // r40b: the row stays the nav anchor after the mouse leaves (still focused),
    // so the chips persist; they only hide once focus actually leaves the row.
    fireEvent.mouseLeave(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    fireEvent.blur(row);
    expect(
      document.querySelector('[data-testid="txn-action-edit"]'),
    ).toBeNull();
  });

  it("keyboard focus (arrow-nav) reveals the chips even without hover", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(
      document.querySelector('[data-testid="txn-action-edit"]'),
    ).toBeNull();
    fireEvent.focus(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
  });

  it("touch (no hover): a tap reveals the chips", () => {
    setHoverCapable(false);
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(
      document.querySelector('[data-testid="txn-action-edit"]'),
    ).toBeNull();
    fireEvent.click(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
  });

  it("hover-capable: clicking the amount enters inline edit", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    expect(document.querySelector('input[inputmode="decimal"]')).toBeTruthy();
  });

  it("touch: a single tap on the amount toggles reveal and does NOT enter inline edit", () => {
    setHoverCapable(false);
    renderRow();
    fireEvent.click(screen.getByText("15"));
    // First tap reveals chips, does not start editing
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(document.querySelector('input[inputmode="decimal"]')).toBeNull();
    // Second tap on the amount toggles the reveal back off — still no edit
    fireEvent.click(screen.getByText("15"));
    expect(document.querySelector('input[inputmode="decimal"]')).toBeNull();
  });

  it("touch: a double-tap on the amount enters inline edit", () => {
    setHoverCapable(false);
    renderRow();
    fireEvent.doubleClick(screen.getByText("15"));
    expect(document.querySelector('input[inputmode="decimal"]')).toBeTruthy();
  });

  it("inline edit: committing the SAME value does not call update", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    const input = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    expect(input.value).toBe("15");
    fireEvent.blur(input);
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it("inline edit: committing a CHANGED value calls update with new cents", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    const input = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockUpdateMutate).toHaveBeenCalledWith({
      txId: "txn-123",
      amountCents: 2000,
    });
  });

  it("inline edit: clearing the value deletes the row", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    const input = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(mockDeleteMutate).toHaveBeenCalledWith("txn-123");
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it("inline edit: setting the value to 0 deletes the row", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    const input = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockDeleteMutate).toHaveBeenCalledWith("txn-123");
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  // Robust-minimal offline (260614-q1v): the offline write queue + per-row
  // pending/unsent marker were removed. A row is always rendered plainly —
  // there is no in-flight pending UI, spinner, or data-pending/data-unsent attr.
  it("renders no pending/unsent marker (offline write queue removed)", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(row.getAttribute("data-pending")).toBeNull();
    expect(row.getAttribute("data-unsent")).toBeNull();
    expect(row.querySelector(".animate-spin")).toBeNull();
    expect(document.querySelector('[data-testid^="txn-pending-"]')).toBeNull();
  });

  it("clicking the trash chip opens the AlertDialog and does NOT delete immediately", () => {
    renderRow();
    fireEvent.mouseEnter(screen.getByTestId("txn-row-1500"));
    fireEvent.click(screen.getByTestId("txn-action-delete"));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    // AlertDialog is now mounted
    expect(document.querySelector('[role="alertdialog"]')).toBeTruthy();
  });

  it("AlertDialog Confirm calls deleteMutation with the txn id", () => {
    renderRow();
    fireEvent.mouseEnter(screen.getByTestId("txn-row-1500"));
    fireEvent.click(screen.getByTestId("txn-action-delete"));
    fireEvent.click(screen.getByTestId("txn-row-delete-confirm"));
    expect(mockDeleteMutate).toHaveBeenCalledWith("txn-123");
  });

  it("clicking edit chip calls onEdit with txn id", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    fireEvent.mouseEnter(screen.getByTestId("txn-row-1500"));
    fireEvent.click(screen.getByTestId("txn-action-edit"));
    expect(onEdit).toHaveBeenCalledWith("txn-123");
  });

  it("action chips carry cursor-pointer", () => {
    renderRow();
    fireEvent.mouseEnter(screen.getByTestId("txn-row-1500"));
    expect(screen.getByTestId("txn-action-edit").className).toContain(
      "cursor-pointer",
    );
    expect(screen.getByTestId("txn-action-delete").className).toContain(
      "cursor-pointer",
    );
  });

  // r40 desktop keyboard nav: rows are focused programmatically (Arrow keys
  // via grid-key-nav) and act on Enter / Backspace. Tab order stays with the
  // quick-add inputs, so the row itself is tabIndex=-1.
  describe("keyboard interaction (r40)", () => {
    it("row is out of the tab order but marked for arrow navigation", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      expect(row.getAttribute("tabindex")).toBe("-1");
      expect(row.hasAttribute("data-txn-nav")).toBe(true);
    });

    it("Enter on the focused row opens the inline amount editor", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
      expect(screen.getByDisplayValue("15")).toBeTruthy();
    });

    it("Backspace on the focused row opens the delete confirmation", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Backspace" });
      expect(screen.getByTestId("txn-row-delete-confirm")).toBeTruthy();
      expect(mockDeleteMutate).not.toHaveBeenCalled(); // confirm first, never direct
    });

    it("Delete key also opens the delete confirmation (item 7)", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Delete" });
      expect(screen.getByTestId("txn-row-delete-confirm")).toBeTruthy();
      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it("Cmd/Ctrl+Enter opens the FULL editor (pen) instead of the inline edit", () => {
      const onEdit = vi.fn();
      renderRow({ onEdit });
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter", metaKey: true });
      expect(onEdit).toHaveBeenCalledWith(txn.id);
      expect(screen.queryByDisplayValue("15")).toBeNull(); // NOT inline editing
      fireEvent.keyDown(row, { key: "Enter", ctrlKey: true });
      expect(onEdit).toHaveBeenCalledTimes(2);
    });

    it("Backspace INSIDE the amount editor edits text, never deletes the row", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
      const editor = screen.getByDisplayValue("15");
      fireEvent.keyDown(editor, { key: "Backspace" });
      expect(screen.queryByTestId("txn-row-delete-confirm")).toBeNull();
    });

    it("focus styles the row like hover (elevated bg), no accent ring", () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      expect(row.className).toContain(
        "focus-visible:bg-[var(--surface-elevated-dark)]",
      );
      expect(row.className).not.toContain("focus-visible:ring");
    });

    it("re-focuses the ROW after an Enter-committed quick edit so navigation continues", async () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
      const editor = screen.getByDisplayValue("15");
      fireEvent.change(editor, { target: { value: "20" } });
      fireEvent.keyDown(editor, { key: "Enter" });
      await vi.waitFor(() => expect(document.activeElement).toBe(row));
    });

    it("re-focuses the ROW after Escape cancels the quick edit", async () => {
      renderRow();
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
      const editor = screen.getByDisplayValue("15");
      fireEvent.keyDown(editor, { key: "Escape" });
      await vi.waitFor(() => expect(document.activeElement).toBe(row));
    });

    it("readOnly (archived) rows ignore Enter and Backspace", () => {
      renderRow({ readOnly: true });
      const row = screen.getByTestId("txn-row-1500");
      row.focus();
      fireEvent.keyDown(row, { key: "Enter" });
      expect(screen.queryByDisplayValue("15")).toBeNull();
      fireEvent.keyDown(row, { key: "Backspace" });
      expect(screen.queryByTestId("txn-row-delete-confirm")).toBeNull();
    });
  });
});
