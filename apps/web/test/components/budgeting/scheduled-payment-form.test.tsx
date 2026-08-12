/**
 * scheduled-payment-form.test.tsx — saving a rule with a comma amount (260803).
 *
 * The API takes a decimal STRING and accepts a dot only. The form sent whatever
 * was typed, so a comma keyboard ("73,8" — the Polish layout's decimal key) was
 * rejected and every save died on a bare "Failed to create rule" (user report).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { writeMock, toastError } = vi.hoisted(() => ({
  writeMock: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/lib/offline-write", () => ({
  clientApiWrite: writeMock,
  isOfflineWriteError: () => false,
}));
vi.mock("@/hooks/use-offline-write-toast", () => ({
  useOfflineWriteToast: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

import { ScheduledPaymentForm } from "@/components/budgeting/scheduled-payment-form";

const CATEGORIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Housing" },
];

function renderForm() {
  return render(
    <ScheduledPaymentForm
      open
      onOpenChange={vi.fn()}
      mode="create"
      budgetId="b1"
      categories={CATEGORIES}
      defaultCurrency="PLN"
      onSaved={vi.fn()}
    />,
  );
}

/** The JSON body of the last write the form issued. */
const sentBody = () => {
  const call = writeMock.mock.calls[writeMock.mock.calls.length - 1];
  const init = call?.[1] as { body?: string } | undefined;
  return init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
};

beforeEach(() => {
  writeMock.mockReset();
  toastError.mockReset();
  writeMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

describe("Scheduled rule form — amount", () => {
  it("sends a comma amount as the dot decimal the API accepts", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "73,8");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(sentBody()?.amount).toBe("73.8");
  });

  it("leaves a dot amount exactly as typed", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "1500.25");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(sentBody()?.amount).toBe("1500.25");
  });

  it("says so on a nonsense amount instead of round-tripping a doomed save", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "abc");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe("Scheduled payment form — a payment that happens once", () => {
  it("offers 'one time' alongside the rhythms", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "rule.once" })).toBeTruthy();
  });

  it("hides the last-date field once it is picked", async () => {
    const user = userEvent.setup();
    renderForm();
    // A one-time payment's deadline IS its date, so asking for a second one
    // would be asking the same question twice (user, 260807).
    expect(screen.queryByLabelText("rule.lastDueLabel")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "rule.once" }));
    expect(screen.queryByLabelText("rule.lastDueLabel")).toBeNull();
  });

  it("hides the day / weekday / month selectors too", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "rule.once" }));
    expect(screen.queryByLabelText("rule.anchorDayLabel")).toBeNull();
    expect(screen.queryByLabelText("rule.weekdayLabel")).toBeNull();
    expect(screen.queryByLabelText("rule.yearlyMonthLabel")).toBeNull();
  });

  it("still asks WHEN — the date is the whole payment", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "rule.once" }));
    expect(screen.queryByLabelText("rule.dateLabel")).toBeTruthy();
  });

  it("sends cadence ONCE with no selector, its deadline being its date", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "250");
    await user.click(screen.getByRole("button", { name: "rule.once" }));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const body = sentBody()!;
    expect(body.cadence).toBe("ONCE");
    expect(body.cadence_anchor).toBeUndefined();
    expect(body.weekly_dow).toBeUndefined();
    expect(body.yearly_month).toBeUndefined();
    // The form asks for the date once and derives the deadline from it — the
    // same value create-scheduled-payment.ts stores for a ONCE row anyway.
    expect(body.end_date).toBe(body.first_due_date);
  });

  it("going back to a rhythm brings the last-date field back", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "rule.once" }));
    await user.click(screen.getByRole("button", { name: "rule.monthly" }));
    expect(screen.queryByLabelText("rule.lastDueLabel")).toBeTruthy();
  });
});

describe("Scheduled payment form — editing a one-time payment", () => {
  it("sends the date, since there is no pattern to recompute it from", async () => {
    render(
      <ScheduledPaymentForm
        open
        onOpenChange={vi.fn()}
        mode="edit"
        budgetId="b1"
        categories={CATEGORIES}
        defaultCurrency="PLN"
        onSaved={vi.fn()}
        initialValues={{
          ruleId: "r1",
          categoryId: null,
          amount: "250",
          currency: "PLN",
          cadence: "ONCE",
          cadenceAnchor: null,
          weeklyDow: null,
          yearlyMonth: null,
          note: "New sofa",
          firstDueDate: "2027-05-05",
        }}
      />,
    );
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    const edits = (sentBody()!.edits ?? {}) as Record<string, unknown>;
    expect(edits.cadence).toBe("ONCE");
    expect(edits.nextDueDate).toBe("2027-05-05");
  });

  // Moving the date is the ONLY thing there is to change about when a one-time
  // payment happens, and it was the one edit the form refused: the stored rule
  // carries end_date = its own date, the last-date field is hidden for ONCE, so
  // the hidden value stayed on the OLD date and the submit guard read the move
  // as "deadline before first due" (user, 260809 — Japan, 1 Aug → 1 Nov 2027).
  it("lets the date move forward — the deadline moves with it", async () => {
    const user = userEvent.setup();
    render(
      <ScheduledPaymentForm
        open
        onOpenChange={vi.fn()}
        mode="edit"
        budgetId="b1"
        categories={CATEGORIES}
        defaultCurrency="PLN"
        onSaved={vi.fn()}
        initialValues={{
          ruleId: "r1",
          categoryId: null,
          amount: "17000",
          currency: "PLN",
          cadence: "ONCE",
          cadenceAnchor: null,
          weeklyDow: null,
          yearlyMonth: null,
          note: "Japan",
          firstDueDate: "2027-08-01",
          endDate: "2027-08-01",
        }}
      />,
    );
    await user.clear(screen.getByLabelText("rule.dateLabel"));
    await user.type(screen.getByLabelText("rule.dateLabel"), "2027-11-01");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
    const edits = (sentBody()!.edits ?? {}) as Record<string, unknown>;
    expect(edits.nextDueDate).toBe("2027-11-01");
    // The deadline follows the date rather than pinning it to the old one.
    expect(edits.endDate).toBe("2027-11-01");
  });
});

/**
 * The date field is bound to the rule's NEXT occurrence, which marches forward
 * every time one is generated. Calling it "first due date" while EDITING said
 * the opposite: a yearly tier change created in 2023 showed "15 Oct 2026", and
 * that reads as the day it started (user, 260809).
 */
describe("the date field says which date it is", () => {
  const renderEdit = () =>
    render(
      <ScheduledPaymentForm
        open
        onOpenChange={vi.fn()}
        mode="edit"
        budgetId="b1"
        ruleId="r1"
        categories={CATEGORIES}
        defaultCurrency="PLN"
        onSaved={vi.fn()}
        initialValues={{
          name: "Tier change (winter)",
          amount: "200",
          currency: "PLN",
          categoryId: CATEGORIES[0]!.id,
          cadence: "YEARLY",
          yearlyMonth: 10,
          cadenceAnchor: 15,
          firstDueDate: "2026-10-15",
          endDate: null,
        }}
      />,
    );

  it("calls it the NEXT due date when editing", () => {
    renderEdit();
    expect(screen.getByText("rule.nextDueLabel")).toBeTruthy();
    expect(screen.queryByText("rule.firstDueLabel")).toBeNull();
  });

  it("…and the FIRST due date when creating, which is what it is then", () => {
    renderForm();
    expect(screen.getByText("rule.firstDueLabel")).toBeTruthy();
    expect(screen.queryByText("rule.nextDueLabel")).toBeNull();
  });
});
