/**
 * task-banner-row.test.tsx — Vitest + RTL coverage for TaskBannerRow per-kind
 * action routing (Phase 7 Plan 07-08).
 *
 * UAT issue #2: whole row is now a single <button> (row-as-button UX).
 * No kind chip. No separate action label. Deep-link kinds show ChevronRight.
 *
 * Contract under test:
 *   - Row is ENABLED (no disabled, no aria-disabled).
 *   - RESERVE_TOPUP → router.push(/budgets/<id>/reserves?task=<id>)
 *   - CUSHION_BELOW_TARGET → router.push(/budgets/<id>/wallets?task=<id>&focus=cushion)
 *   - CONFIRM_DRAFT → POST /recurring-rules/drafts/:id/confirm via clientApiFetch
 *   - CONFIRM_DRAFT success → onResolved callback
 *   - CONFIRM_DRAFT error → sonner toast.error
 *   - Loading state: button disabled + Loader2 spinner + aria-busy
 *   - i18n title sanitization (T-07-08-01): React text-node escaping protects
 *     against payload markup injection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Mocks ──────────────────────────────────────────────────────────────────
// vi.mock factories are HOISTED above all top-level decls. Share spies between
// the factory and the test body via vi.hoisted — bare `const` crashes with
// "Cannot access before initialization" because mock bodies run first.
const { pushMock, fetchMock, toastErrorMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  fetchMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
  extractBudgetIdFromPath: () => null,
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    // Minimal i18n stub mirroring Plan 07-08 contract: ICU-style {placeholder}
    // interpolation for the keys we care about; unknown keys return raw.
    const dict: Record<string, string> = {
      "bdp.tasks.title.RESERVE_TOPUP": "Top up reserve by {amount}",
      "bdp.tasks.title.CONFIRM_DRAFT": "Confirm {ruleName} — {amount}",
      "bdp.tasks.title.CUSHION_BELOW_TARGET": "Cushion short by {shortfall}",
      "bdp.tasks.kind.RESERVE_TOPUP": "Reserve",
      "bdp.tasks.kind.CONFIRM_DRAFT": "Draft",
      "bdp.tasks.kind.CUSHION_BELOW_TARGET": "Cushion",
      "bdp.tasks.action.RESERVE_TOPUP.label": "Fix reserve",
      "bdp.tasks.action.RESERVE_TOPUP.ariaLabel":
        "Go to Reserves to fix top-up",
      "bdp.tasks.action.CONFIRM_DRAFT.label": "Confirm draft",
      "bdp.tasks.action.CUSHION_BELOW_TARGET.label": "Top up cushion",
      "bdp.tasks.action.CUSHION_BELOW_TARGET.ariaLabel":
        "Go to Wallets to top up cushion",
      "bdp.tasks.confirmError": "Could not confirm draft. Try again.",
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

type RenderProps = {
  task: TaskSummary;
  budgetId?: string;
  locale?: string;
  onResolved?: (taskId: string) => void;
};

function renderRow({
  task,
  budgetId = "b1",
  locale = "en",
  onResolved,
}: RenderProps) {
  return render(
    <TaskBannerRow
      task={task}
      budgetId={budgetId}
      locale={locale}
      onResolved={onResolved}
    />,
  );
}

const baseTask = (
  partial: Partial<TaskSummary> & { kind: TaskSummary["kind"] },
): TaskSummary => ({
  id: "t1",
  budget_id: "b1",
  kind: partial.kind,
  status: "PENDING",
  payload: {},
  created_at: "2026-05-12T20:00:00Z",
  ...partial,
});

describe("TaskBannerRow", () => {
  beforeEach(() => {
    pushMock.mockReset();
    fetchMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("row is a single enabled button (no disabled, no aria-disabled)", () => {
    renderRow({
      task: baseTask({
        kind: "RESERVE_TOPUP",
        payload: { shortfall_cents: "5000", currency: "EUR" },
      }),
    });
    const button = screen.getByRole("button");
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
    // No kind chip rendered
    expect(screen.queryByText("Reserve")).toBeNull();
    // No separate action label
    expect(screen.queryByText("Fix reserve")).toBeNull();
  });

  it("RESERVE_TOPUP click → router.push(/budgets/b1/reserves?task=t1)", async () => {
    renderRow({
      task: baseTask({
        kind: "RESERVE_TOPUP",
        payload: { shortfall_cents: "5000", currency: "EUR" },
      }),
    });
    await userEvent.click(screen.getByRole("button"));
    expect(pushMock).toHaveBeenCalledWith("/budgets/b1/reserves?task=t1");
  });

  it("CUSHION_BELOW_TARGET click → router.push(/budgets/b1/wallets?task=t1&focus=cushion)", async () => {
    renderRow({
      task: baseTask({
        kind: "CUSHION_BELOW_TARGET",
        payload: { shortfall_cents: "3000", currency: "EUR" },
      }),
    });
    await userEvent.click(screen.getByRole("button"));
    expect(pushMock).toHaveBeenCalledWith(
      "/budgets/b1/wallets?task=t1&focus=cushion",
    );
  });

  it("CONFIRM_DRAFT click → POST /recurring-rules/drafts/:id/confirm + onResolved called", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
    const onResolved = vi.fn();
    renderRow({
      task: baseTask({
        kind: "CONFIRM_DRAFT",
        payload: {
          draft_id: "d1",
          rule_name: "Rent",
          amount_cents: "100000",
          currency: "EUR",
        },
      }),
      onResolved,
    });
    await userEvent.click(screen.getByRole("button"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/recurring-rules/drafts/d1/confirm",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Budget-ID": "b1" }),
      }),
    );
    expect(onResolved).toHaveBeenCalledWith("t1");
  });

  it("CONFIRM_DRAFT fetch error → sonner toast.error called", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    renderRow({
      task: baseTask({
        kind: "CONFIRM_DRAFT",
        payload: {
          draft_id: "d1",
          rule_name: "Rent",
          amount_cents: "100000",
          currency: "EUR",
        },
      }),
    });
    await userEvent.click(screen.getByRole("button"));
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("CONFIRM_DRAFT pending → button disabled + aria-busy + spinner svg renders", async () => {
    let resolveFetch: (v: unknown) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((res) => (resolveFetch = res)),
    );
    renderRow({
      task: baseTask({
        kind: "CONFIRM_DRAFT",
        payload: {
          draft_id: "d1",
          rule_name: "Rent",
          amount_cents: "100000",
          currency: "EUR",
        },
      }),
    });
    const button = screen.getByRole("button");
    await userEvent.click(button);
    // Pending state captured before fetch resolves
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
    // Resolve to clean up the dangling promise
    resolveFetch!({ ok: true, status: 200 });
  });

  it("RESERVE_TOPUP renders i18n title with formatted currency amount", () => {
    renderRow({
      task: baseTask({
        kind: "RESERVE_TOPUP",
        payload: { shortfall_cents: "5000", currency: "EUR" },
      }),
    });
    // "Top up reserve by €50.00" — Intl format may use NBSP between number and symbol
    // depending on the runtime locale; assert the recognisable parts.
    const text = screen.getByText(/Top up reserve by/).textContent ?? "";
    expect(text).toMatch(/50/);
    expect(text).toMatch(/€|EUR/);
  });

  it("payload fields are sanitized through i18n interpolation — never reach DOM as markup", () => {
    renderRow({
      task: baseTask({
        kind: "CONFIRM_DRAFT",
        payload: {
          draft_id: "d1",
          rule_name: "<img src=x onerror=alert(1)>",
          amount_cents: "1000",
          currency: "EUR",
        },
      }),
    });
    // React's default text-node escaping must drop the markup to text.
    expect(document.querySelector("img")).toBeNull();
  });

  it("row button aria-label is the task title (screen reader announces task name)", () => {
    renderRow({
      task: baseTask({
        kind: "RESERVE_TOPUP",
        payload: { shortfall_cents: "5000", currency: "EUR" },
      }),
    });
    const button = screen.getByRole("button");
    // aria-label is set to t(titleKey, titleParams) — contains the formatted text
    const label = button.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/Top up reserve by/);
  });

  it("RESERVE_TOPUP deep-link row shows ChevronRight indicator", () => {
    renderRow({
      task: baseTask({
        kind: "RESERVE_TOPUP",
        payload: { shortfall_cents: "5000", currency: "EUR" },
      }),
    });
    const button = screen.getByRole("button");
    // ChevronRight renders as an svg inside the button
    expect(button.querySelector("svg")).not.toBeNull();
  });
});
