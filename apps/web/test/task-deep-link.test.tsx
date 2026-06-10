/**
 * task-deep-link.test.tsx
 *
 * Verifies the D-PH7-30 deep-link consumer: PillTaskSlider auto-expands the
 * matching pending row when focusTaskId is in the list, and silently does
 * nothing (D-14 silent-land) when the id is absent — no toast, no expand.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "./setup/query-client";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

// ---- mocks ----------------------------------------------------------------

const toastMock = { error: vi.fn(), success: vi.fn() };
vi.mock("sonner", () => ({ toast: toastMock }));

vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    if (key === "bdp.pillSlider.collapsedHeaderMany")
      return `${vars?.count} tasks pending`;
    if (key === "bdp.pillSlider.collapsedHeaderOne") return "1 task pending";
    return key;
  },
}));

// ---- component (import after mocks) ---------------------------------------
import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";

// ---- helpers --------------------------------------------------------------

function makeTask(id: string): TaskSummary {
  return {
    id,
    budget_id: "b1",
    kind: "RESERVE_TOPUP",
    status: "PENDING",
    payload: { shortfall_cents: 5000, currency: "EUR" },
    created_at: new Date().toISOString(),
  };
}

const TASK_IN_LIST = makeTask("task-abc");
const TASK_NOT_IN_LIST = makeTask("task-xyz");

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- tests ----------------------------------------------------------------

describe("task deep-link consumer (PillTaskSlider focusTaskId)", () => {
  it("(a) focusTaskId in pending list → slider expanded + row rendered", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[TASK_IN_LIST]}
          focusTaskId={TASK_IN_LIST.id}
        />
      </TestQueryProvider>,
    );

    // Header button should be expanded (it's the first button — the expand/collapse toggle)
    const buttons = screen.getAllByRole("button");
    const header = buttons[0]!;
    expect(header.getAttribute("aria-expanded")).toBe("true");

    // The matching row should be in the DOM
    expect(
      container.querySelector(`[data-testid="task-banner-${TASK_IN_LIST.id}"]`),
    ).not.toBeNull();
  });

  it("(b) D-14 silent-land: focusTaskId NOT in list → no expansion, toast NOT called", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[TASK_IN_LIST]}
          focusTaskId={TASK_NOT_IN_LIST.id}
        />
      </TestQueryProvider>,
    );

    // Slider should remain collapsed
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");

    // No rows visible
    expect(container.querySelector("[data-task-id]")).toBeNull();

    // No toast invoked (D-14 silent-land: no notification of any kind)
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("focusTaskId absent → default collapsed behavior", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[TASK_IN_LIST]}
        />
      </TestQueryProvider>,
    );

    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-task-id]")).toBeNull();
  });
});
