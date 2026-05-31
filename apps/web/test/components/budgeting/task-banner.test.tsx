/**
 * task-banner.test.tsx — Vitest + RTL coverage for the TaskBanner client wrapper.
 *
 * Tests cover BDP-03 banner behavior:
 *   - empty unmount (D-PH3-14)
 *   - count chip + collapsed/expanded toggle (aria-expanded)
 *   - Escape-to-collapse
 *   - row mount: kind chip + ENABLED action button (Phase 7 Plan 07-08 D-PH7-25)
 *   - deterministic 60s polling (D-PH3-13) via vi.useFakeTimers + advanceTimersByTimeAsync
 *
 * Plan 07-08 changes:
 *   - TaskKind union narrowed to RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET.
 *   - Action button is enabled (no disabled, no aria-disabled). The Phase 3 "Coming
 *     soon" tooltip is gone — per-kind wiring lives in TaskBannerRow now.
 *
 * Hard rule: NO it.skip / test.skip on the polling test (Plan 03-06 grep gate).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
  extractBudgetIdFromPath: (p: string) => {
    const m = /^\/[a-z]{2}\/budgets\/([0-9a-fA-F-]{8,})/.exec(p);
    return m?.[1] ?? null;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === "bdp.tasks.count") {
      const n = (vars?.count as number) ?? 0;
      return n === 1 ? `${n} task pending` : `${n} tasks pending`;
    }
    return key;
  },
}));

import { TaskBanner } from "@/components/budgeting/task-banner";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

const mkTask = (id: string, kind: TaskSummary["kind"]): TaskSummary => ({
  id,
  budget_id: "b1",
  kind,
  status: "PENDING",
  payload: {},
  created_at: "2026-05-12T20:00:00Z",
});

const t1 = mkTask("t1", "RESERVE_TOPUP");
const t2 = mkTask("t2", "CONFIRM_DRAFT");
const t3 = mkTask("t3", "CUSHION_BELOW_TARGET");

describe("TaskBanner", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [t1] }),
    });
  });

  it("renders null when initialTasks is empty (D-PH3-14)", () => {
    const { container } = render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[]} />
      </TestQueryProvider>,
    );
    expect(container.querySelector('[data-testid="task-banner"]')).toBeNull();
  });

  it("renders collapsed row with the i18n count for 3 tasks", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1, t2, t3]} />
      </TestQueryProvider>,
    );
    expect(screen.getByText("3 tasks pending")).toBeTruthy();
  });

  it("collapsed banner has expand control with aria-expanded false", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1]} />
      </TestQueryProvider>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking expand sets aria-expanded true and renders 3 task rows", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1, t2, t3]} />
      </TestQueryProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("listitem").length).toBe(3);
  });

  it("clicking expand again collapses and unmounts rows", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1, t2, t3]} />
      </TestQueryProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(screen.getAllByRole("listitem").length).toBe(3);
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("listitem").length).toBe(0);
  });

  it("pressing Escape while expanded collapses", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1, t2]} />
      </TestQueryProvider>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("each task row shows kind chip and ENABLED action button (Plan 07-08 D-PH7-25)", () => {
    render(
      <TestQueryProvider>
        <TaskBanner budgetId="b1" locale="en" initialTasks={[t1]} />
      </TestQueryProvider>,
    );
    const triggerBtn = screen.getByRole("button");
    fireEvent.click(triggerBtn);
    const row = screen.getAllByRole("listitem")[0]!;
    // The kind key falls through the i18n mock (returns the raw key) so the row
    // textContent still carries the RESERVE_TOPUP literal for assertion.
    expect(row.textContent).toMatch(/RESERVE_TOPUP/);
    const actionButtons = row.querySelectorAll("button");
    expect(actionButtons.length).toBeGreaterThanOrEqual(1);
    const actionBtn = actionButtons[
      actionButtons.length - 1
    ] as HTMLButtonElement;
    expect(actionBtn.disabled).toBe(false);
    expect(actionBtn.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("polls every 60s when mounted (fake timers, advanceTimersByTimeAsync — REQUIRED)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      render(
        <TestQueryProvider>
          <TaskBanner budgetId="b1" locale="en" initialTasks={[t1]} />
        </TestQueryProvider>,
      );
      const callsBeforeTick = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      const callsAfterTick = fetchMock.mock.calls.length;
      expect(callsAfterTick).toBeGreaterThan(callsBeforeTick);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterTick);
    } finally {
      vi.useRealTimers();
    }
  });
});
