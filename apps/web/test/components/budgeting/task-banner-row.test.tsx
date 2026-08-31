/**
 * task-banner-row.test.tsx — Vitest + RTL coverage for TaskBannerRow as a
 * read-only row inside the per-pill slider (Tasks-Redesign UAT round 2).
 *
 * Contract under test:
 *   - Row renders title interpolated from `bdp.tasks.title.<KIND>` w/ payload
 *     vars (T-03-06-03 / T-07-08-01 sanitisation invariant preserved).
 *   - Row is NOT clickable: no onClick, no router.push, no API call.
 *   - "More" trigger opens a Dialog with the long-form description from
 *     `bdp.tasks.detail.<KIND>`.
 *   - data-task-id + data-task-kind attributes present for E2E selectors.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Still mocked because the row imports the hook, but the CONFIRM_DRAFT title
// no longer resolves a category name — it names the scheduled payment.
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [{ id: "cat-1", name: "Groceries" }] }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "bdp.tasks.title.RESERVE_TOPUP": "Top up reserve by {amount}",
      // ICU select isn't exercised here (t is mocked); assert the new params
      // (amount + ruleName) get plumbed through.
      "bdp.tasks.title.CONFIRM_DRAFT": "Confirm {amount} ({ruleName})",
      "bdp.tasks.title.CUSHION_BELOW_TARGET": "Cushion short by {shortfall}",
      "bdp.tasks.detail.RESERVE_TOPUP":
        "Open the Reserves tab and rebalance category amounts.",
      "bdp.tasks.detail.CONFIRM_DRAFT":
        "Review the {ruleName} draft for {amount} below and confirm it.",
      "bdp.tasks.detail.CUSHION_BELOW_TARGET":
        "Transfer {shortfall} into a cushion wallet, or lower the target.",
      "bdp.tasks.more": "More",
    };
    const tpl = dict[key] ?? key;
    if (!vars) return tpl;
    return Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(new RegExp(`{${k}}`, "g"), String(v)),
      tpl,
    );
  },
}));

import {
  TaskBannerRow,
  type TaskSummary,
} from "@/components/budgeting/task-banner-row";

function makeTask(
  kind: TaskSummary["kind"],
  payload: Record<string, unknown> = {},
): TaskSummary {
  const defaults: Record<TaskSummary["kind"], Record<string, unknown>> = {
    RESERVE_TOPUP: { shortfall_cents: 5000, currency: "EUR" },
    CUSHION_BELOW_TARGET: { shortfall_cents: 3000, currency: "EUR" },
    CONFIRM_DRAFT: {
      draft_id: "d1",
      rule_name: "Rent",
      category_id: "cat-1",
      amount_cents: 100000,
      currency: "EUR",
    },
  };
  return {
    id: `task-${kind}`,
    budget_id: "b1",
    kind,
    status: "PENDING",
    payload: { ...defaults[kind], ...payload },
    created_at: new Date().toISOString(),
  };
}

describe("TaskBannerRow — read-only row", () => {
  it("renders the title interpolated with payload (RESERVE_TOPUP)", () => {
    render(
      <TaskBannerRow
        task={makeTask("RESERVE_TOPUP")}
        budgetId="b1"
        locale="en"
      />,
    );
    expect(screen.getByText(/Top up reserve by/)).toBeInTheDocument();
  });

  it("renders the title interpolated with payload (CONFIRM_DRAFT)", () => {
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT")}
        budgetId="b1"
        locale="en"
      />,
    );
    // fmt now always uses "en" → symbol (€1,000), not the ISO code.
    expect(screen.getByText(/€1,000 \(Rent\)/)).toBeInTheDocument();
  });

  it("uses the short sign AFTER the amount for suffix currencies (zł), not the ISO code", () => {
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT", { currency: "PLN" })}
        budgetId="b1"
        locale="en"
      />,
    );
    // narrow sign, suffix convention: "1,000 zł" — NOT "PLN 1,000".
    expect(screen.getByText(/1,000 zł \(Rent\)/)).toBeInTheDocument();
    expect(screen.queryByText(/PLN/)).not.toBeInTheDocument();
  });

  it("renders the title interpolated with payload (CUSHION_BELOW_TARGET)", () => {
    render(
      <TaskBannerRow
        task={makeTask("CUSHION_BELOW_TARGET")}
        budgetId="b1"
        locale="en"
      />,
    );
    expect(screen.getByText(/Cushion short by/)).toBeInTheDocument();
  });

  it("exposes data-task-id and data-task-kind for E2E", () => {
    render(
      <TaskBannerRow
        task={makeTask("RESERVE_TOPUP")}
        budgetId="b1"
        locale="en"
      />,
    );
    const row = document.querySelector("[data-task-id]")!;
    expect(row.getAttribute("data-task-id")).toBe("task-RESERVE_TOPUP");
    expect(row.getAttribute("data-task-kind")).toBe("RESERVE_TOPUP");
  });

  it("the row itself is not a button — no onClick, no role=button", () => {
    render(
      <TaskBannerRow
        task={makeTask("RESERVE_TOPUP")}
        budgetId="b1"
        locale="en"
      />,
    );
    const row = document.querySelector("[data-task-id]")!;
    expect(row.tagName.toLowerCase()).toBe("div");
    expect(row.getAttribute("role")).toBe("listitem");
  });

  it('"More" trigger opens a dialog with the kind-specific detail', async () => {
    const user = userEvent.setup();
    render(
      <TaskBannerRow
        task={makeTask("RESERVE_TOPUP")}
        budgetId="b1"
        locale="en"
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(
      await screen.findByText(/Open the Reserves tab and rebalance/),
    ).toBeInTheDocument();
  });

  it("interpolates payload vars into the detail text too", async () => {
    const user = userEvent.setup();
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT")}
        budgetId="b1"
        locale="en"
      />,
    );
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(
      await screen.findByText(/Review the Rent draft for €1,000 below/),
    ).toBeInTheDocument();
  });
});

describe("TaskBannerRow — CONFIRM_DRAFT jumps to the draft", () => {
  // RTL cleans up what it rendered; the stand-in draft node is appended by
  // hand, so it would leak into the "draft is not on the page" case and make
  // that test pass for the wrong reason.
  afterEach(() => {
    document.querySelectorAll("[data-draft-id]").forEach((n) => n.remove());
  });

  /** Render the row with a matching draft node in the document. */
  function renderWithDraft(draftId = "d1") {
    const draft = document.createElement("div");
    draft.setAttribute("data-draft-id", draftId);
    const scrollIntoView = vi.fn();
    (draft as unknown as { scrollIntoView: unknown }).scrollIntoView =
      scrollIntoView;
    document.body.appendChild(draft);
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT")}
        budgetId="b1"
        locale="en"
      />,
    );
    return { draft, scrollIntoView };
  }

  it("renders the amount + payment name as a button", () => {
    renderWithDraft();
    // "Confirm " stays plain text; only the part that identifies the draft is
    // the target, so the row does not read as one big link.
    const jump = screen.getByRole("button", { name: /€1,000 \(Rent\)/ });
    expect(jump).toBeInTheDocument();
  });

  it("scrolls the matching draft row into view when clicked", async () => {
    const user = userEvent.setup();
    const { scrollIntoView } = renderWithDraft();
    await user.click(screen.getByRole("button", { name: /€1,000 \(Rent\)/ }));
    expect(scrollIntoView).toHaveBeenCalled();
    // inline:"center" brings the category COLUMN across the horizontal
    // scroller; block:"nearest" must not drag the page under the sticky header.
    expect(scrollIntoView.mock.calls[0]?.[0]).toMatchObject({
      block: "nearest",
      inline: "center",
    });
  });

  it("flags the draft so it can be highlighted on arrival", async () => {
    const user = userEvent.setup();
    const { draft } = renderWithDraft();
    await user.click(screen.getByRole("button", { name: /€1,000 \(Rent\)/ }));
    // Scrolling alone still leaves the user hunting the row among its
    // neighbours; the flash attribute is what makes it findable.
    expect(draft.getAttribute("data-draft-flash")).toBe("");
  });

  it("does nothing when the draft is not on the page", async () => {
    // Different month, or the aggregate page — the click must be inert, not
    // throw and take the banner down with it.
    const user = userEvent.setup();
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT")}
        budgetId="b1"
        locale="en"
      />,
    );
    await user.click(screen.getByRole("button", { name: /€1,000 \(Rent\)/ }));
    expect(document.querySelector("[data-draft-flash]")).toBeNull();
  });

  it("the row is still a listitem, not a button", () => {
    renderWithDraft();
    const row = document.querySelector("[data-task-id]")!;
    expect(row.getAttribute("role")).toBe("listitem");
  });

  it("falls back to the category when the payment has no name", () => {
    // Defensive: every CONFIRM_DRAFT comes from a scheduled payment, so
    // rule_name should be set. If it ever isn't, the parenthesised half must
    // still say something useful rather than render "( )".
    renderWithDraft();
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT", { rule_name: "" })}
        budgetId="b1"
        locale="en"
      />,
    );
    expect(
      screen.getByRole("button", { name: /€1,000 \(Groceries\)/ }),
    ).toBeInTheDocument();
  });

  it("renders no jump button when neither a payment name nor a category resolves", () => {
    renderWithDraft();
    render(
      <TaskBannerRow
        task={makeTask("CONFIRM_DRAFT", { rule_name: "", category_id: "nope" })}
        budgetId="b1"
        locale="en"
      />,
    );
    // Nothing to name the draft by — plain text, not an empty link.
    expect(screen.getAllByRole("button", { name: "More" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /\(\)/ })).toBeNull();
  });

  it("other kinds render no jump button", () => {
    render(
      <TaskBannerRow
        task={makeTask("RESERVE_TOPUP")}
        budgetId="b1"
        locale="en"
      />,
    );
    // Only "More" — a reserve shortfall has no single row to scroll to.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
