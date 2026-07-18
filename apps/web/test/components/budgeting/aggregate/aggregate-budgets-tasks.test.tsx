import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AggregateBudgetsTasks } from "@/components/budgeting/aggregate/aggregate-budgets-tasks";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, prefetch: vi.fn() }),
}));
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes("b1")
        ? { tasks: [{ id: "t1", budget_id: "b1", kind: "RESERVE_TOPUP" }] }
        : { tasks: [] },
  })),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("AggregateBudgetsTasks", () => {
  it("lists every budget; budget links to overview and task links to the kind's pill", async () => {
    render(
      wrap(
        <AggregateBudgetsTasks
          budgets={[
            { id: "b1", name: "Home" },
            { id: "b2", name: "Travel" },
          ]}
        />,
      ),
    );
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("Travel")).toBeTruthy();

    // budget row → overview
    expect(
      screen.getByTestId("aggregate-bt-budget-b1").getAttribute("href"),
    ).toBe("/en/budgets/b1/overview");

    // b1's RESERVE_TOPUP task → clicking navigates to the reserves pill (pillFor).
    const taskRow = await screen.findByTestId("aggregate-bt-task-t1");
    fireEvent.click(taskRow);
    expect(pushMock).toHaveBeenCalledWith("/en/budgets/b1/reserves");

    // b2 has no pending tasks
    expect(await screen.findByText("no_tasks")).toBeTruthy();
  });
});
