import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { AggregateOverview } from "@/components/budgeting/aggregate/aggregate-overview";

function makeBudget(overrides: Record<string, unknown>) {
  return {
    id: "b1",
    name: "Home",
    default_currency: "USD",
    member_count: 2,
    my_share_pct: 60,
    net_worth_cents: "660000",
    investments_cents: "240000",
    cash_cents: "60000",
    reserves_cents: "120000",
    cushion_cents: "0",
    spent_month_cents: "30000",
    left_month_cents: "40000",
    overspent_total_cents: "0",
    overspent_count: 0,
    cushion_breached: false,
    reserves_status: "ok",
    pending_tasks: 1,
    health: "green",
    included: true,
    fx_unavailable: false,
    ...overrides,
  };
}

const DATA = {
  display_currency: "USD",
  budgets: [
    makeBudget({}),
    makeBudget({
      id: "b2",
      name: "Travel",
      default_currency: "EUR",
      member_count: 1,
      my_share_pct: 100,
      net_worth_cents: "340000",
      investments_cents: "0",
      cash_cents: "340000",
      reserves_cents: "0",
      spent_month_cents: "10000",
      left_month_cents: "5000",
      pending_tasks: 0,
    }),
  ],
};

const { dataRef } = vi.hoisted(() => ({
  dataRef: { current: undefined as any },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: any) =>
    v?.pct ? `your ${v.pct}%` : k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useBudgetsAggregate: () => ({
    data: dataRef.current,
    isPending: false,
    isError: false,
  }),
  useAggregateWealth: () => ({ data: undefined, isPending: false }),
}));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: () => <div data-testid="pie-chart" />,
}));
vi.mock("@/components/budgeting/charts/line-chart", () => ({
  OverviewLineChart: () => <div data-testid="line-chart" />,
}));

beforeEach(() => {
  dataRef.current = DATA;
});

// Amounts render behind SlotAmount (masked by default, r41 privacy) — reveal
// (shared across every SlotAmount under one SlotRevealProvider); the
// mask→real scramble runs on a ~500ms interval, so wait for it to settle.
function reveal(el: HTMLElement) {
  fireEvent.click(within(el).getByTestId("slot-amount"));
}

describe("AggregateOverview", () => {
  it("hero shows the summed net worth of included budgets", async () => {
    render(<AggregateOverview />);
    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // 660000 + 340000 = 1,000,000 cents = $10,000
    await waitFor(() => expect(hero.textContent).toMatch(/10,?000/));
  });

  it("does NOT render a budget the member has excluded (included:false)", () => {
    dataRef.current = {
      display_currency: "USD",
      budgets: [
        makeBudget({}),
        makeBudget({ id: "b2", name: "Travel", included: false }),
      ],
    };
    render(<AggregateOverview />);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.queryByText("Travel")).toBeNull(); // excluded → not rendered at all
  });

  it("an excluded budget is not summed into the hero either", async () => {
    dataRef.current = {
      display_currency: "USD",
      budgets: [
        makeBudget({}),
        makeBudget({
          id: "b2",
          name: "Travel",
          net_worth_cents: "340000",
          included: false,
        }),
      ],
    };
    render(<AggregateOverview />);
    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // only b1 (660000 = $6,600), never 660000+340000 = $10,000
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
    expect(hero.textContent).not.toMatch(/10,?000/);
  });

  it("renders a my-share badge when share < 100", () => {
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-share-b1").textContent).toMatch(/60/);
    expect(screen.queryByTestId("aggregate-share-b2")).toBeNull(); // 100% → no badge
  });

  it("fx_unavailable row shows the notice, no dot/figure, and is excluded from the hero sum", async () => {
    dataRef.current = {
      display_currency: "USD",
      budgets: [
        makeBudget({}),
        makeBudget({
          id: "b3",
          name: "Broken",
          net_worth_cents: "999999900",
          included: true,
          fx_unavailable: true,
        }),
      ],
    };
    render(<AggregateOverview />);
    // Row is an <li> in the breakdown card.
    const row = screen.getByText("Broken").closest("li")!;
    expect(within(row).getByText(/rate_unavailable|unavailable/i)).toBeTruthy();
    expect(row.querySelector(".rounded-full")).toBeNull(); // no health dot
    expect(within(row).queryByTestId("slot-amount")).toBeNull(); // no net-worth figure

    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // only b1 (660000 = $6,600) sums in — b3 never, despite its huge cents
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
  });
});
