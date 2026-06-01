import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "../../../setup/query-client";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
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
    if (key === "bdp.pillSlider.collapsedHeaderMany") {
      return `${vars?.count} tasks pending`;
    }
    if (key === "bdp.pillSlider.collapsedHeaderOne") {
      return "1 task pending";
    }
    return key;
  },
}));

import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";

function makeTask(kind: TaskSummary["kind"], i = 0): TaskSummary {
  return {
    id: `task-${kind}-${i}`,
    budget_id: "b1",
    kind,
    status: "PENDING",
    payload:
      kind === "RESERVE_TOPUP"
        ? { shortfall_cents: 5000, currency: "EUR" }
        : kind === "CUSHION_BELOW_TARGET"
          ? { shortfall_cents: 3000, currency: "EUR" }
          : {
              draft_id: "d1",
              rule_name: "Rent",
              amount_cents: 100000,
              currency: "EUR",
            },
    created_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("PillTaskSlider", () => {
  it("returns null when filtered task list is empty", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[]}
        />
      </TestQueryProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("filters by pill: reserves slider only shows RESERVE_TOPUP rows", () => {
    const tasks = [
      makeTask("RESERVE_TOPUP"),
      makeTask("CONFIRM_DRAFT"),
      makeTask("CUSHION_BELOW_TARGET"),
    ];
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={tasks}
        />
      </TestQueryProvider>,
    );
    const rows = container.querySelectorAll("[data-task-id]");
    expect(rows.length).toBe(1);
  });

  it("1 task → expanded on initial mount (aria-expanded=true)", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[makeTask("RESERVE_TOPUP")]}
        />
      </TestQueryProvider>,
    );
    expect(container.querySelector("[data-task-id]")).not.toBeNull();
    const header = screen
      .getAllByRole("button")
      .find((btn) => btn.hasAttribute("aria-expanded"))!;
    expect(header.getAttribute("aria-expanded")).toBe("true");
  });

  it("≥2 tasks → collapsed on initial mount (aria-expanded=false)", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[
            makeTask("RESERVE_TOPUP", 0),
            makeTask("RESERVE_TOPUP", 1),
          ]}
        />
      </TestQueryProvider>,
    );
    expect(container.querySelector("[data-task-id]")).toBeNull();
    const header = screen.getByRole("button");
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("click collapsed header expands the slider", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[
            makeTask("RESERVE_TOPUP", 0),
            makeTask("RESERVE_TOPUP", 1),
          ]}
        />
      </TestQueryProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelectorAll("[data-task-id]").length).toBe(2);
  });

  it("Escape collapses when expanded (1-task auto-expand path)", () => {
    const { container } = render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="reserves"
          initialTasks={[makeTask("RESERVE_TOPUP")]}
        />
      </TestQueryProvider>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector("[data-task-id]")).toBeNull();
  });

  it("data-testid='pill-task-slider' + data-pill='<pill>' for E2E", () => {
    render(
      <TestQueryProvider>
        <PillTaskSlider
          budgetId="b1"
          locale="en"
          pill="wallets"
          initialTasks={[makeTask("CUSHION_BELOW_TARGET")]}
        />
      </TestQueryProvider>,
    );
    const root = screen.getByTestId("pill-task-slider");
    expect(root.getAttribute("data-pill")).toBe("wallets");
  });
});
