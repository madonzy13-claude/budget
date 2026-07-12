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
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// useCategories resolves the CONFIRM_DRAFT payload's category_id → name.
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [{ id: "cat-1", name: "Groceries" }] }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const dict: Record<string, string> = {
      "bdp.tasks.title.RESERVE_TOPUP": "Top up reserve by {amount}",
      // ICU select isn't exercised here (t is mocked); assert the new params
      // (amount + category, no name) get plumbed through.
      "bdp.tasks.title.CONFIRM_DRAFT": "Confirm {amount} — {category}",
      "bdp.tasks.title.CUSHION_BELOW_TARGET": "Cushion short by {shortfall}",
      "bdp.tasks.detail.RESERVE_TOPUP":
        "Open the Reserves tab and rebalance category amounts.",
      "bdp.tasks.detail.CONFIRM_DRAFT":
        "Open the Spendings tab and confirm the {ruleName} draft for {amount}.",
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
    expect(screen.getByText(/Confirm €1,000 — Groceries/)).toBeInTheDocument();
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
    expect(
      screen.getByText(/Confirm 1,000 zł — Groceries/),
    ).toBeInTheDocument();
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
      await screen.findByText(
        /Open the Spendings tab and confirm the Rent draft/,
      ),
    ).toBeInTheDocument();
  });
});
