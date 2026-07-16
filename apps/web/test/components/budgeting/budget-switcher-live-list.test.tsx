/**
 * budget-switcher-live-list.test.tsx — regression for the stale header
 * dropdown after accepting an invite.
 *
 * The (app) layout persists across soft navigations, so the server-passed
 * `budgets` prop is never refreshed — a budget joined via share link stayed
 * invisible in the switcher until a full reload. The switcher must overlay
 * the live ["active-budgets"] query on top of the SSR prop.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BudgetSwitcher,
  type BudgetSummary,
} from "../../../src/components/budgeting/budget-switcher";

const BUDGET_A: BudgetSummary = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "My Own Budget",
  memberCount: 1,
  default_currency: "USD",
  pendingTasksCount: 0,
};
const BUDGET_B: BudgetSummary = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Joined Family Budget",
  memberCount: 2,
  default_currency: "USD",
  pendingTasksCount: 0,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/components/common/nav-pending", () => ({
  useNavRouter: () => ({ push: vi.fn() }),
}));

// Scenario: the user just accepted an invite and landed on budget B's page,
// but the layout-rendered switcher prop still only knows about budget A.
vi.mock("next/navigation", () => ({
  usePathname: () => `/en/budgets/${BUDGET_B.id}/overview`,
}));

const fetchMock = vi.fn();
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: (...args: unknown[]) => fetchMock(...args),
}));

function renderSwitcher() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BudgetSwitcher
        budgets={[BUDGET_A]}
        activeBudgetId={BUDGET_B.id}
        locale="en"
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ budgets: [BUDGET_A, BUDGET_B] }),
  });
});

describe("Budget switcher live list", () => {
  it("shows a freshly joined budget without a full reload", async () => {
    renderSwitcher();
    // Live fetch overlays the stale SSR prop: the trigger resolves the
    // just-joined budget's name instead of rendering the empty placeholder.
    expect(await screen.findByText("Joined Family Budget")).toBeTruthy();
  });

  it("lists the joined budget in the dropdown", async () => {
    renderSwitcher();
    await screen.findByText("Joined Family Budget");
    fireEvent.click(screen.getByRole("button"));
    const rows = await screen.findAllByText("Joined Family Budget");
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.getAllByText("My Own Budget").length).toBeGreaterThan(0);
  });
});
