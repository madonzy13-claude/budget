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
// One stable spy, so a test can assert WHICH caches a save refreshes.
const invalidateMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateMock,
    setQueryData: vi.fn(),
  }),
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
  invalidateMock.mockReset();
  writeMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

/** The query keys a save asked React Query to refresh, as dotted strings. */
const invalidatedKeys = () =>
  invalidateMock.mock.calls.map((c) =>
    ((c[0] as { queryKey?: unknown[] })?.queryKey ?? []).join("."),
  );

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

describe("saving a payment refreshes what it changed", () => {
  // Saving a payment that is due materialises its draft server-side. The form
  // refreshed the TASKS query, so the "confirm" task appeared immediately — but
  // never the drafts query, so the draft row itself was missing until a full
  // page reload (user, 260902). A task pointing at a row that is not on screen
  // is worse than neither.
  const editValues = {
    ruleId: "r1",
    categoryId: null,
    amount: "250",
    currency: "PLN",
    cadence: "ONCE" as const,
    cadenceAnchor: null,
    weeklyDow: null,
    yearlyMonth: null,
    note: "Kite",
    firstDueDate: "2027-05-05",
  };

  function renderEdit() {
    return render(
      <ScheduledPaymentForm
        open
        onOpenChange={vi.fn()}
        mode="edit"
        budgetId="b1"
        categories={CATEGORIES}
        defaultCurrency="PLN"
        onSaved={vi.fn()}
        initialValues={editValues}
      />,
    );
  }

  it("editing refreshes the drafts the grid draws, not just the task badge", async () => {
    renderEdit();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    await waitFor(() => expect(invalidatedKeys()).toContain("drafts.b1"));
    // The task badge still refreshes — this adds a cache, it does not move one.
    expect(invalidatedKeys()).toContain("tasks.b1.pending");
  });

  it("refreshes the forecast under the key it is actually registered with", async () => {
    // useProjection registers ["budget", id, "projection"] — an invalidate on
    // ["projection", id] would match nothing and fail silently, which is the
    // same class of bug as the one being fixed here.
    renderEdit();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidatedKeys()).toContain("budget.b1.projection"),
    );
  });

  it("editing refreshes the summary the column headers read", async () => {
    // A new draft changes what the category has left to spend, so the header
    // above the row has to move with it.
    renderEdit();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidatedKeys()).toContain("spendings-summary.b1"),
    );
  });

  it("creating refreshes them too", async () => {
    // The create path materialises drafts the same way and had the same gap.
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "12");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    await waitFor(() => expect(invalidatedKeys()).toContain("drafts.b1"));
  });
});

/**
 * Naming a new category in the picker records INTENT only. The category is
 * created on submit, immediately before the rule that will carry it (user,
 * 261014) — so a form left unfinished leaves no stray category behind, and the
 * rule can be attached to an id that did not exist when the form opened.
 */
describe("Scheduled rule form — a category created on save", () => {
  /** Every URL the form wrote to, in order. */
  const urls = () => writeMock.mock.calls.map((c) => String(c[0]));

  async function nameANewCategory(name: string) {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "100");
    await user.click(screen.getByTestId("category-combobox-trigger"));
    fireEvent.change(await screen.findByTestId("category-combobox-input"), {
      target: { value: name },
    });
    await user.click(screen.getByTestId("category-combobox-create"));
    return user;
  }

  it("creates the category FIRST, then the rule", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).endsWith("/categories")
            ? { category: { id: "cat-new" } }
            : {},
      }),
    );
    await nameANewCategory("Fuel");
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    expect(urls()[0]).toContain("/categories");
    expect(urls()[1]).toContain("/scheduled-payments");
  });

  it("attaches the rule to the id the create returned", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).endsWith("/categories")
            ? { category: { id: "cat-new" } }
            : {},
      }),
    );
    await nameANewCategory("Fuel");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    expect(sentBody()?.category_id).toBe("cat-new");
  });

  it("sends the typed name to the create", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).endsWith("/categories")
            ? { category: { id: "cat-new" } }
            : {},
      }),
    );
    await nameANewCategory("Fuel");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(writeMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ name: "Fuel" });
  });

  it("does not write the rule when the category could not be created", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: !String(url).endsWith("/categories"),
        json: async () => ({}),
      }),
    );
    await nameANewCategory("Fuel");
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(urls().some((u) => u.includes("/scheduled-payments"))).toBe(false);
  });

  it("writes only the rule when an EXISTING category is picked", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "100");
    await user.click(screen.getByTestId("category-combobox-trigger"));
    await user.click(await screen.findByText("Housing"));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(urls().some((u) => u.includes("/categories"))).toBe(false);
    expect(sentBody()?.category_id).toBe(CATEGORIES[0]!.id);
  });
});

/**
 * Save stayed disabled after naming a NEW category (user, 261014, screenshot:
 * "Some new category" chosen, "Save payment" greyed out).
 *
 * The guard read `!categoryId`, and `categoryId` is only set for a category
 * that already exists — a named-but-not-yet-created one has no id until the
 * save itself creates it. So the one path the picker was built for could never
 * be submitted. It has to gate on a CHOICE having been made, whichever kind.
 */
describe("Scheduled rule form — Save with a new category named", () => {
  const saveButton = () =>
    screen.getByRole("button", { name: /rule.saveButton/i });

  it("enables Save once a new category is named", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.nameLabel"), "Test");
    await user.type(screen.getByLabelText("rule.amountLabel"), "15");
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByTestId("category-combobox-trigger"));
    fireEvent.change(await screen.findByTestId("category-combobox-input"), {
      target: { value: "Some new category" },
    });
    await user.click(screen.getByTestId("category-combobox-create"));

    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it("still enables Save for an existing category", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.nameLabel"), "Test");
    await user.type(screen.getByLabelText("rule.amountLabel"), "15");
    await user.click(screen.getByTestId("category-combobox-trigger"));
    await user.click(await screen.findByText("Housing"));
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it("keeps Save disabled while no category is chosen at all", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.nameLabel"), "Test");
    await user.type(screen.getByLabelText("rule.amountLabel"), "15");
    expect(saveButton()).toBeDisabled();
  });
});

/**
 * A category created on save has to show up in the picker the NEXT time a rule
 * is added (user, 261014: "I don't see newly created category in list").
 *
 * The form invalidated ["budget", id, "categories"], but the picker's list is
 * fetched under ["categories-lite", id] — a different key, so nothing
 * refetched and the new category stayed invisible until a reload. Both keys
 * are live: the grid and the settings list read different ones.
 */
describe("Scheduled rule form — the new category reaches the next picker", () => {
  it("refreshes the list the picker itself reads", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).endsWith("/categories")
            ? { category: { id: "cat-new" } }
            : {},
      }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "100");
    await user.click(screen.getByTestId("category-combobox-trigger"));
    fireEvent.change(await screen.findByTestId("category-combobox-input"), {
      target: { value: "Fuel" },
    });
    await user.click(screen.getByTestId("category-combobox-create"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    expect(invalidatedKeys()).toContain("categories-lite.b1");
  });

  it("still refreshes the grid's own categories key", async () => {
    writeMock.mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).endsWith("/categories")
            ? { category: { id: "cat-new" } }
            : {},
      }),
    );
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("rule.amountLabel"), "100");
    await user.click(screen.getByTestId("category-combobox-trigger"));
    fireEvent.change(await screen.findByTestId("category-combobox-input"), {
      target: { value: "Fuel" },
    });
    await user.click(screen.getByTestId("category-combobox-create"));
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(2));
    expect(invalidatedKeys()).toContain("budget.b1.categories");
  });
});
