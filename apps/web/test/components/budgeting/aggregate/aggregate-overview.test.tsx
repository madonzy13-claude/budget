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

// vi.hoisted: these must exist before the vi.mock factory below runs (Vitest
// hoists vi.mock calls above regular module code) — a module-level mutable
// data ref (so individual tests can swap the fixture) and a mock-mutate fn
// tests assert against directly.
const { setFlagMutate, dataRef } = vi.hoisted(() => ({
  setFlagMutate: vi.fn(),
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
  useSetAggregationFlag: () => ({ mutate: setFlagMutate }),
}));
// The composition pie renders recharts (ResponsiveContainer/ResizeObserver),
// which jsdom doesn't support — stub it like every other pie-chart caller's
// tests do (see overview-sections.test.tsx).
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: () => <div data-testid="pie-chart" />,
}));

beforeEach(() => {
  dataRef.current = DATA;
  setFlagMutate.mockClear();
});

// Amounts render behind SlotAmount (masked by default, r41 privacy) — reveal
// (shared across every SlotAmount under one SlotRevealProvider); the
// mask→real scramble runs on a ~500ms interval, so wait for it to settle
// before reading digits out of textContent.
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

  it("excluding a budget drops it from the hero total", async () => {
    render(<AggregateOverview />);
    // exclude Travel BEFORE revealing — SlotAmount's mask/reveal only
    // resyncs to a new value on a reveal-state flip, so toggle first, then
    // reveal once to read the settled total.
    fireEvent.click(screen.getByTestId("aggregate-exclude-b2"));
    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // 660000 cents = $6,600
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
    expect(setFlagMutate).toHaveBeenCalledWith({
      budgetId: "b2",
      included: false,
    });
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
    const row = screen.getByText("Broken").closest("div")!;
    expect(within(row).getByText(/rate_unavailable|unavailable/i)).toBeTruthy();
    // no health dot for an fx_unavailable row
    expect(row.querySelector(".rounded-full")).toBeNull();
    // no net-worth figure (no SlotAmount) rendered for this row
    expect(within(row).queryByTestId("slot-amount")).toBeNull();
    // no exclude toggle either — nothing to include/exclude on a row that's
    // never summable
    expect(screen.queryByTestId("aggregate-exclude-b3")).toBeNull();

    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // only b1 (660000 = $6,600) sums in — b3 is never included regardless of
    // its (huge) net_worth_cents
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
  });

  it("a server-excluded budget is NOT summed into the hero on first render (mount-race guard)", async () => {
    dataRef.current = {
      display_currency: "USD",
      budgets: [
        makeBudget({}),
        makeBudget({
          id: "b2",
          name: "Travel",
          net_worth_cents: "340000",
          included: false, // server says: excluded
        }),
      ],
    };
    render(<AggregateOverview />);
    const hero = screen.getByTestId("aggregate-hero");
    reveal(hero);
    // FIRST render must already reflect the server exclusion: only b1 sums
    // in (660000 = $6,600), never the transient 660000+340000=$10,000.
    await waitFor(() => expect(hero.textContent).toMatch(/6,?600/));
    expect(hero.textContent).not.toMatch(/10,?000/);
  });
});
