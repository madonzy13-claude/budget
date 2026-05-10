/**
 * recurring-rule-form.test.tsx — Vitest+RTL tests for RecurringRuleForm.
 * D-01-d: edit mode pre-checks "Also apply to future occurrences"; submit body
 * must contain `applyToFuture: true` by default.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock next-intl with the keys used by the form
vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      "rule.title": "New recurring rule",
      "rule.editTitle": "Edit recurring rule",
      "rule.saveButton": "Save rule",
      "rule.cancelButton": "Cancel",
      "rule.amountLabel": "Amount",
      "rule.currencyLabel": "Currency",
      "rule.kindLabel": "Kind",
      "rule.kindExpense": "Expense",
      "rule.kindIncome": "Income",
      "rule.kindTransfer": "Transfer",
      "rule.accountLabel": "Account",
      "rule.cadenceLabel": "Cadence",
      "rule.monthly": "Monthly",
      "rule.weekly": "Weekly",
      "rule.anchorDayLabel": "On day",
      "rule.weekdayLabel": "On",
      "rule.firstDueLabel": "First due date",
      "rule.noteLabel": "Note (optional)",
      "rule.applyToFutureLabel": "Also apply to future occurrences",
      "rule.applyToFutureHelp": "Edits the upcoming pending drafts.",
    };
    return map[key] ?? key;
  },
}));

// Mock toast (sonner)
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { RecurringRuleForm } =
  await import("../../src/components/budgeting/recurring-rule-form");

describe("RecurringRuleForm — D-01-d edit-mode applyToFuture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("edit mode renders 'Also apply to future occurrences' checkbox, pre-checked", async () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-1",
          amount: "1500",
          currency: "USD",
          kind: "EXPENSE",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          firstDueDate: "2026-06-01",
          accountId: "acc-1",
          categoryId: null,
          note: null,
        }}
      />,
    );
    const checkbox = screen.getByLabelText(/Also apply to future occurrences/i);
    expect(checkbox).toBeTruthy();
    // Radix Checkbox uses data-state attribute or aria-checked
    expect(
      checkbox.getAttribute("aria-checked") === "true" ||
        checkbox.getAttribute("data-state") === "checked",
    ).toBe(true);
  });

  it("edit mode submit (no interaction) sends applyToFuture:true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-2",
          amount: "1500",
          currency: "USD",
          kind: "EXPENSE",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          firstDueDate: "2026-06-01",
          accountId: "acc-1",
          categoryId: null,
          note: null,
        }}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    const saveBtn = screen.getByRole("button", { name: /Save rule/i });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      applyToFuture: boolean;
    };
    expect(body.applyToFuture).toBe(true);
  });

  it("edit mode unticking checkbox sends applyToFuture:false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-3",
          amount: "1500",
          currency: "USD",
          kind: "EXPENSE",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          firstDueDate: "2026-06-01",
          accountId: "acc-1",
          categoryId: null,
          note: null,
        }}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    const checkbox = screen.getByLabelText(/Also apply to future occurrences/i);
    fireEvent.click(checkbox); // toggle off
    const saveBtn = screen.getByRole("button", { name: /Save rule/i });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      applyToFuture: boolean;
    };
    expect(body.applyToFuture).toBe(false);
  });

  it("create mode does NOT render the apply-to-future checkbox", () => {
    render(
      <RecurringRuleForm open={true} onOpenChange={vi.fn()} mode="create" />,
    );
    expect(
      screen.queryByLabelText(/Also apply to future occurrences/i),
    ).toBeNull();
  });
});
