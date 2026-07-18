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
    cushion_cents: "50000",
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
      net_worth_cents: "340000",
      investments_cents: "0",
      cash_cents: "340000",
      reserves_cents: "0",
      cushion_cents: "0",
      my_share_pct: 100,
    }),
  ],
};

const { dataRef, wealthRef } = vi.hoisted(() => ({
  dataRef: { current: undefined as any },
  wealthRef: { current: undefined as any },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: any) =>
    v?.pct ? `your ${v.pct}%` : k,
  useLocale: () => "en",
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useBudgetsAggregate: () => ({
    data: dataRef.current,
    isPending: false,
    isError: false,
  }),
  useAggregateWealth: () => ({ data: wealthRef.current, isPending: false }),
}));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: () => <div data-testid="pie-chart" />,
}));
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: () => <div data-testid="area-chart" />,
}));
vi.mock("@/components/budgeting/overview/range-selector", () => ({
  RangeSelector: () => <div data-testid="range-selector" />,
}));

beforeEach(() => {
  dataRef.current = DATA;
  wealthRef.current = undefined;
});

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

  it("excludes an included:false budget from the hero sum", async () => {
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
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
    expect(hero.textContent).not.toMatch(/10,?000/);
  });

  it("does not render a per-budget breakdown (budgets banner removed)", () => {
    render(<AggregateOverview />);
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Travel")).toBeNull();
    expect(screen.queryByTestId("aggregate-share-b1")).toBeNull();
  });

  it("shows the incl-investments hero sub-line and a cushion card", () => {
    render(<AggregateOverview />);
    expect(screen.getByText("incl_investments")).toBeTruthy();
    expect(screen.getByText("cushion")).toBeTruthy();
  });

  it("renders the day P/L block from the today-window grow", () => {
    wealthRef.current = {
      display_currency: "USD",
      series: [{ label: "a", value_cents: "100" }],
      grow: { delta_cents: "5000", delta_pct: 2.5 },
    };
    render(<AggregateOverview />);
    const pl = screen.getByTestId("aggregate-hero-pl");
    expect(pl.textContent).toMatch(/2\.5%/);
    expect(pl.textContent).toMatch(/50/); // +$50
  });

  it("fx_unavailable budget is excluded from the hero sum", async () => {
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
    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
  });
});
