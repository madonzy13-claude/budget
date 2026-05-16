/**
 * transaction-row.test.tsx — Vitest+RTL tests for TransactionRow.
 *
 * Reveal model: hover (hover-capable) or tap (touch) reveals chips.
 * Inline edit: single click on the amount while revealed; double-click is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
        onRetry={vi.fn()}
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

  it("shows a tooltip with the locale-formatted date and note on hover", async () => {
    const user = userEvent.setup();
    renderRow({ txn: { ...txn, transactionDate: "2026-05-14", note: "Weekly shop" } });
    await user.hover(screen.getByText("15"));
    const tip = await screen.findByTestId("txn-tooltip");
    expect(tip.textContent).toContain("5/14/2026");
    expect(tip.textContent).toContain("Weekly shop");
  });

  it("tooltip omits the note line when the transaction has no note", async () => {
    const user = userEvent.setup();
    renderRow({ txn: { ...txn, transactionDate: "2026-05-14", note: null } });
    await user.hover(screen.getByText("15"));
    const tip = await screen.findByTestId("txn-tooltip");
    expect(tip.textContent).toContain("5/14/2026");
    expect(tip.textContent).not.toContain("Weekly shop");
  });

  it("hover reveals the edit and delete chips; mouse leave hides them", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(document.querySelector('[data-testid="txn-action-edit"]')).toBeNull();
    fireEvent.mouseEnter(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
    fireEvent.mouseLeave(row);
    expect(document.querySelector('[data-testid="txn-action-edit"]')).toBeNull();
  });

  it("touch (no hover): a tap reveals the chips", () => {
    setHoverCapable(false);
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    expect(document.querySelector('[data-testid="txn-action-edit"]')).toBeNull();
    fireEvent.click(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
  });

  it("hover-capable: clicking the amount enters inline edit", () => {
    renderRow();
    fireEvent.click(screen.getByText("15"));
    expect(
      document.querySelector('input[inputmode="decimal"]'),
    ).toBeTruthy();
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

  it("pending=true shows loading state", () => {
    renderRow({ txn: { ...txn, pending: true } });
    const row = screen.getByTestId("txn-row-1500");
    expect(row.getAttribute("data-pending")).toBe("true");
  });

  it("unsent=true shows retry state with data-unsent attribute", () => {
    renderRow({ txn: { ...txn, unsent: true } });
    const row = screen.getByTestId("txn-row-1500");
    expect(row.getAttribute("data-unsent")).toBe("true");
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
    expect(
      screen.getByTestId("txn-action-edit").className,
    ).toContain("cursor-pointer");
    expect(
      screen.getByTestId("txn-action-delete").className,
    ).toContain("cursor-pointer");
  });
});
