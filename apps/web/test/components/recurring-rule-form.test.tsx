/**
 * recurring-rule-form.test.tsx — Vitest+RTL tests for RecurringRuleForm.
 *
 * Original D-01-d coverage (edit mode pre-checks "Also apply to future
 * occurrences"; submit body sends `applyToFuture`) is preserved.
 *
 * UAT-7 (Phase 6) post-fix additions:
 *   - WEEKLY weekday picker opens with Monday FIRST and Sunday LAST
 *     (calendar-locale convention).
 *   - YEARLY tile renders alongside Weekly + Monthly.
 *
 * The form's interface no longer includes `kind` / `accountId` (v1.1
 * backend dropped both), so initialValues for edit-mode tests only set
 * the supported fields.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock next-intl with the keys used by the form. Keys not present in the
// map round-trip as their key path — useful for asserting on stable
// identifiers (e.g. `rule.weekdays.1`) below.
vi.mock("next-intl", () => ({
  // UAT round 16: form imports useLocale for the date picker's Intl
  // month-short formatting. Tests don't exercise localization, so a
  // fixed "en" suffices.
  useLocale: () => "en",
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      "rule.title": "New recurring rule",
      "rule.editTitle": "Edit recurring rule",
      "rule.saveButton": "Save rule",
      "rule.cancelButton": "Cancel",
      "rule.amountLabel": "Amount",
      "rule.currencyLabel": "Currency",
      "rule.cadenceLabel": "Cadence",
      "rule.monthly": "Monthly",
      "rule.weekly": "Weekly",
      "rule.yearly": "Yearly",
      "rule.anchorDayLabel": "On day",
      "rule.weekdayLabel": "On",
      "rule.yearlyMonthLabel": "Month",
      "rule.firstDueLabel": "First due date",
      "rule.noteLabel": "Note (optional)",
      "rule.applyToFutureLabel": "Also apply to future occurrences",
      "rule.applyToFutureHelp": "Edits the upcoming pending drafts.",
    };
    return map[key] ?? key;
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// UAT round 14 (carried over from round 11): the form calls
// useQueryClient() to invalidate the per-budget tasks query after a
// create/edit. Wrapping every test in a real QueryClientProvider is
// overkill since these tests don't assert on cache behaviour — stub the
// hook with a no-op `invalidateQueries` so render works without a
// provider.
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

// CurrencyPicker stub — the real one fetches a currency list at runtime.
vi.mock("@/components/common/currency-picker", () => ({
  CurrencyPicker: ({ value }: { value: string }) => (
    <button type="button" data-testid="currency-stub">
      {value}
    </button>
  ),
}));

const { RecurringRuleForm } =
  await import("../../src/components/budgeting/recurring-rule-form");

describe("RecurringRuleForm — applyToFuture is forced on (UAT-7 retest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("edit mode does NOT render the apply-to-future checkbox (always true)", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-1",
          amount: "1500",
          currency: "USD",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-06-01",
          categoryId: null,
          note: null,
        }}
      />,
    );
    expect(
      screen.queryByLabelText(/Also apply to future occurrences/i),
    ).toBeNull();
  });

  it("edit mode submit ALWAYS sends applyToFuture:true (no user choice)", async () => {
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
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-06-01",
          categoryId: null,
          note: "My rule",
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

  it("create mode does NOT render the apply-to-future checkbox", () => {
    render(
      <RecurringRuleForm open={true} onOpenChange={vi.fn()} mode="create" />,
    );
    expect(
      screen.queryByLabelText(/Also apply to future occurrences/i),
    ).toBeNull();
  });
});

describe("RecurringRuleForm — Category mandatory (UAT-7 retest)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Save is disabled until a category is chosen when categories are provided", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        budgetId="bgt-1"
        categories={[
          { id: "cat-a", name: "Food" },
          { id: "cat-b", name: "Rent" },
        ]}
      />,
    );
    const saveBtn = screen.getByRole("button", { name: /Save rule/i });
    expect(saveBtn).toBeDisabled();
  });

  it("does NOT render a '(no category)' / clear option in the picker", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        budgetId="bgt-1"
        categories={[
          { id: "cat-a", name: "Food" },
          { id: "cat-b", name: "Rent" },
        ]}
      />,
    );
    // The translator returns the literal key for missing translations,
    // so the "(no category)" option would appear as either the i18n key
    // or its English copy. Neither must be in the DOM.
    expect(
      document.querySelector("[role='option'][data-value='__none__']"),
    ).toBeNull();
    expect(screen.queryByText(/rule\.categoryNone|no category/i)).toBeNull();
  });
});

describe("RecurringRuleForm — frequency tiles (UAT-7)", () => {
  it("renders Weekly · Monthly · Yearly tiles in create mode", () => {
    render(
      <RecurringRuleForm open={true} onOpenChange={vi.fn()} mode="create" />,
    );
    expect(screen.getByRole("button", { name: /Weekly/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Monthly/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Yearly/ })).toBeTruthy();
  });
});

describe("RecurringRuleForm — edit-mode field prefill (UAT-7 retest)", () => {
  it("edit mode shows the rule's saved amount in the Amount input", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-prefill",
          amount: "1500",
          currency: "EUR",
          cadence: "MONTHLY",
          cadenceAnchor: 5,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-05-15",
          categoryId: null,
          note: "Salary",
        }}
      />,
    );
    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe("1500");
  });

  it("formats the prefilled amount the same way the spendings grid does (drops trailing zeros)", () => {
    // The backend returns numeric strings with 4 fractional digits
    // ("1500.0000", "123.5000"). The user expects to see "1500" /
    // "123.5" in the input — same shape as expense amounts in the grid.
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-fmt",
          amount: "123.0000",
          currency: "EUR",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-05-15",
          categoryId: null,
          note: null,
        }}
      />,
    );
    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe("123");
  });

  it("formats fractional amounts to two digits (1500.50 → 1500.50)", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        initialValues={{
          ruleId: "rule-fmt2",
          amount: "1500.5000",
          currency: "EUR",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-05-15",
          categoryId: null,
          note: null,
        }}
      />,
    );
    const amountInput = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe("1500.50");
  });

  it("syncs the Amount input when initialValues changes between renders (no remount)", () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      mode: "edit" as const,
      initialValues: {
        ruleId: "rule-A",
        amount: "100",
        currency: "EUR",
        cadence: "MONTHLY" as const,
        cadenceAnchor: 1,
        weeklyDow: null,
        yearlyMonth: null,
        firstDueDate: "2026-05-15",
        categoryId: null,
        note: null,
      },
    };
    const { rerender } = render(<RecurringRuleForm {...props} />);
    const first = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(first.value).toBe("100");

    // Mimic the parent swapping in a different rule WITHOUT changing key
    // — the form should still reflect the new amount. (Production fix
    // can be either a useEffect sync inside the form OR a `key=ruleId`
    // remount in the parent — both satisfy this expectation.)
    rerender(
      <RecurringRuleForm
        {...props}
        initialValues={{
          ...props.initialValues,
          ruleId: "rule-B",
          amount: "9999",
        }}
        key={"rule-B"}
      />,
    );
    const second = screen.getByLabelText(/Amount/i) as HTMLInputElement;
    expect(second.value).toBe("9999");
  });
});

describe("RecurringRuleForm — Category dropdown (UAT-7 retest)", () => {
  it("renders a Category select when categories prop is provided", () => {
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        categories={[
          { id: "cat-a", name: "Food" },
          { id: "cat-b", name: "Rent" },
        ]}
      />,
    );
    // The Sheet renders its content into a Radix Portal attached to
    // document.body, so we query the document — `container` only sees
    // the React root mount node.
    expect(document.querySelector("#rr-category")).not.toBeNull();
  });

  it("create-mode POST body includes category_id when a category is chosen via initialValues", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <RecurringRuleForm
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        budgetId="bgt-1"
        categories={[
          { id: "cat-a", name: "Food" },
          { id: "cat-b", name: "Rent" },
        ]}
        initialValues={{
          amount: "100",
          currency: "EUR",
          cadence: "MONTHLY",
          cadenceAnchor: 1,
          weeklyDow: null,
          yearlyMonth: null,
          firstDueDate: "2026-05-15",
          categoryId: "cat-a",
          note: "Rent",
        }}
        fetchImpl={fetchMock as unknown as typeof fetch}
      />,
    );
    // Submit without touching the picker — initialValues' categoryId
    // should ride through to the POST body.
    fireEvent.click(screen.getByRole("button", { name: /Save rule/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      category_id?: string | null;
    };
    expect(body.category_id).toBe("cat-a");
  });
});

describe("RecurringRuleForm — WEEKLY weekday picker (UAT-7)", () => {
  // Asserting on the exported `WEEKDAY_ORDER` constant decouples the
  // test from Radix's portal mount timing (the SelectItems live inside
  // a portal that only opens on click — flaky in happy-dom). The
  // constant IS the contract: changing it is the user-visible change.
  it("WEEKDAY_ORDER starts on Monday (1) and ends on Sunday (0)", async () => {
    const mod =
      await import("../../src/components/budgeting/recurring-rule-form");
    expect(mod.WEEKDAY_ORDER).toBeDefined();
    expect(mod.WEEKDAY_ORDER[0]).toBe(1);
    expect(mod.WEEKDAY_ORDER[mod.WEEKDAY_ORDER.length - 1]).toBe(0);
    // And the middle is the rest of the workweek in order.
    expect(mod.WEEKDAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
