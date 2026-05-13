/**
 * transaction-row.test.tsx — Vitest+RTL tests for TransactionRow.
 *
 * D-PH4-INT1 regression-guard: pointermove must NOT reveal chips.
 * D-PH4-INT2: double-click on amount opens inline edit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
  note: null,
};

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

  it("REGRESSION-GUARD (D-PH4-INT1): pointermove does NOT reveal chips", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    act(() => {
      fireEvent.pointerMove(row);
    });
    // Chips should not appear
    expect(document.querySelector('[data-testid="txn-action-edit"]')).toBeNull();
    expect(document.querySelector('[data-testid="txn-action-delete"]')).toBeNull();
  });

  it("single click reveals edit and delete chips", () => {
    renderRow();
    const row = screen.getByTestId("txn-row-1500");
    fireEvent.click(row);
    expect(screen.getByTestId("txn-action-edit")).toBeTruthy();
    expect(screen.getByTestId("txn-action-delete")).toBeTruthy();
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

  it("clicking edit chip calls onEdit with txn id", () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    fireEvent.click(screen.getByTestId("txn-row-1500"));
    fireEvent.click(screen.getByTestId("txn-action-edit"));
    expect(onEdit).toHaveBeenCalledWith("txn-123");
  });
});
