/**
 * transaction-edit-form.test.tsx — Vitest+RTL tests for TransactionEditForm.
 * TDD RED: fails until TransactionEditForm is implemented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      "transactions.edit.title": "Edit transaction",
      "transactions.edit.saveButton": "Save changes",
      "transactions.edit.cancelButton": "Cancel",
      "transactions.edit.kindFieldHint": "Kind cannot be changed",
      "transactions.edit.alreadyCorrected": "Transaction was edited by someone else",
      "transactions.capture.amountLabel": "Amount",
      "transactions.capture.currencyLabel": "Currency",
      "transactions.capture.dateLabel": "Date",
      "transactions.capture.noteLabel": "Note (optional)",
      "transactions.capture.accountLabel": "Account",
    };
    return map[key] ?? key;
  },
  useFormatter: () => ({
    relativeTime: (date: Date) => date.toISOString(),
  }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import the component AFTER vi.mock so mocks take effect
const { TransactionEditForm } = await import(
  "../../src/components/budgeting/transaction-edit-form"
);

const baseTransaction = {
  id: "tx-001",
  kind: "EXPENSE" as const,
  amountOrig: "100.00",
  currencyOrig: "USD",
  amountDefault: "92.50",
  currencyDefault: "EUR",
  fxRate: "0.925",
  fxRateDate: "2026-05-08",
  fxProvider: "frankfurter",
  transactionDate: "2026-05-08",
  note: "Coffee",
  accountId: "acc-001",
  categoryId: null,
  transferGroupId: null,
  correctsId: null,
};

describe("TransactionEditForm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders with pre-filled fields from original transaction", () => {
    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const amountInput = screen.getByTestId("amount-input");
    expect((amountInput as HTMLInputElement).value).toBe("100.00");
  });

  it("renders note pre-filled", () => {
    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const noteInput = screen.getByTestId("note-input");
    expect((noteInput as HTMLInputElement).value).toBe("Coffee");
  });

  it("kind field is disabled (immutable post-creation)", () => {
    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    // Kind should be shown as disabled/read-only text, not a tab button
    const kindHint = screen.queryByText(/Kind cannot be changed/i);
    expect(kindHint).toBeTruthy();
  });

  it("shows Save changes button", () => {
    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId("edit-submit-button")).toBeTruthy();
  });

  it("submits to POST /api/transactions/:id/correct", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: async () => ({ correctionId: "corr-001", originalId: "tx-001" }),
    });

    const onSuccess = vi.fn();
    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    );

    // Change the note to trigger edits (without change, form calls onCancel)
    const noteInput = screen.getByTestId("note-input");
    await userEvent.clear(noteInput);
    await userEvent.type(noteInput, "Changed note");

    const submitBtn = screen.getByTestId("edit-submit-button");
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/transactions/tx-001/correct"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Idempotency-Key": expect.any(String),
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows error toast on 409 AlreadyCorrected", async () => {
    mockFetch.mockResolvedValueOnce({
      status: 409,
      ok: false,
      json: async () => ({ error: "already_corrected" }),
    });

    render(
      <TransactionEditForm
        transaction={baseTransaction}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Change note to trigger edits
    const noteInput = screen.getByTestId("note-input");
    await userEvent.clear(noteInput);
    await userEvent.type(noteInput, "Some change");

    const submitBtn = screen.getByTestId("edit-submit-button");
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    // Error rendered inline
    await waitFor(() => {
      expect(screen.queryByText(/edited by someone else/i)).toBeTruthy();
    });
  });
});
