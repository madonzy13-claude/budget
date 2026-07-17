import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from "@testing-library/react";
import { AggregateOverview } from "@/components/budgeting/aggregate/aggregate-overview";

const DATA = {
  display_currency: "USD",
  budgets: [
    {
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
    },
    {
      id: "b2",
      name: "Travel",
      default_currency: "EUR",
      member_count: 1,
      my_share_pct: 100,
      net_worth_cents: "340000",
      investments_cents: "0",
      cash_cents: "340000",
      reserves_cents: "0",
      cushion_cents: "0",
      spent_month_cents: "10000",
      left_month_cents: "5000",
      overspent_total_cents: "0",
      overspent_count: 0,
      cushion_breached: false,
      reserves_status: "ok",
      pending_tasks: 0,
      health: "green",
      included: true,
      fx_unavailable: false,
    },
  ],
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: any) =>
    v?.pct ? `your ${v.pct}%` : k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useBudgetsAggregate: () => ({ data: DATA, isPending: false, isError: false }),
  useSetAggregationFlag: () => ({ mutate: vi.fn() }),
}));

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
  });

  it("renders a my-share badge when share < 100", () => {
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-share-b1").textContent).toMatch(/60/);
    expect(screen.queryByTestId("aggregate-share-b2")).toBeNull(); // 100% → no badge
  });
});
