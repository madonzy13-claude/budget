import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    possessions_cents: "0",
    cash_cents: "60000",
    reserves_cents: "120000",
    cushion_cents: "50000",
    spent_month_cents: "30000",
    left_month_cents: "40000",
    overspent_total_cents: "0",
    overspent_count: 0,
    overspent_top_name: null,
    overspent_top_cents: "0",
    cushion_breached: false,
    reserves_status: "ok",
    cash_full_cents: "60000",
    reserves_full_cents: "120000",
    reserves_required_cents: "120000",
    cushion_required_cents: "0",
    cushion_saved_full_cents: "50000",
    cushion_required_full_cents: "0",
    cushion_monthly_cents: "0",
    cushion_real_months: 0,
    monthly_planned_cents: "20000",
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

vi.mock("next-intl", () => {
  const t: any = (k: string, v?: any) => (v?.pct ? `your ${v.pct}%` : k);
  // t.rich renders the <amt> chunk, so a note that masks its amount still puts
  // that amount in the tree. The chunk is handed the key, which is all this mock
  // has; the component ignores it and renders its own SlotAmount.
  t.rich = (k: string, v?: any) => (v?.amt ? v.amt(k) : k);
  return { useTranslations: () => t, useLocale: () => "en" };
});
// 260805: the range now comes from the user's stored picks, so the page waits
// for them before it draws anything.
const userPrefs: { current: Record<string, string[]>; loaded: boolean } = {
  current: {},
  loaded: true,
};
const savePref = vi.fn();
vi.mock("@/hooks/use-user-ui-prefs", () => ({
  useUserUiPrefs: () => ({
    prefs: userPrefs.current,
    isLoaded: userPrefs.loaded,
    save: savePref,
  }),
}));
const link = { degraded: false };
vi.mock("@/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: link.degraded ? "offline" : "online",
    degraded: link.degraded,
    reason: link.degraded ? "offline" : "online",
  }),
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
  RangeSelector: ({ value }: { value: { preset: string } }) => (
    <div data-testid="range-selector">
      <span data-testid="aggregate-range-value">{value.preset}</span>
    </div>
  ),
}));
vi.mock("@/components/budgeting/aggregate/aggregate-budgets-tasks", () => ({
  AggregateBudgetsTasks: () => <div data-testid="budgets-tasks" />,
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

  it("possessions are in net worth but shorten the retirement runway", async () => {
    // Same net worth + planned; the only difference is possessions_cents. The
    // runway pot excludes possessions, so more possessions → shorter runway.
    const base = {
      net_worth_cents: "1000000",
      monthly_planned_cents: "20000",
      my_share_pct: 100,
    };
    dataRef.current = {
      display_currency: "USD",
      budgets: [makeBudget({ ...base, possessions_cents: "0" })],
    };
    const { unmount } = render(<AggregateOverview />);
    const runwayNoPoss = screen.getByTestId(
      "aggregate-hero-runway",
    ).textContent;
    unmount();

    // possessions == net worth → the liquid pot is 0 → runway collapses to the
    // months-only branch, visibly different from the multi-year no-possession run.
    dataRef.current = {
      display_currency: "USD",
      budgets: [makeBudget({ ...base, possessions_cents: "1000000" })],
    };
    render(<AggregateOverview />);
    const runwayWithPoss = screen.getByTestId(
      "aggregate-hero-runway",
    ).textContent;
    expect(runwayWithPoss).not.toBe(runwayNoPoss);
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

  // The cushion card carried a Saved/Needed pair, which listed two figures and
  // left the subtraction to the reader — the same thing the BDP card dropped in
  // 260823. It now says the one sentence the BDP says, in the same three states
  // (user, 260825).
  it("says how the cushion stands instead of listing saved and needed", () => {
    render(<AggregateOverview />);
    const note = screen.getByTestId("aggregate-cushion-note");
    // Fixture: 50,000 saved against 0 required, twice over → a surplus.
    expect(note.getAttribute("data-state")).toBe("surplus");
    expect(screen.queryByText("saved")).toBeNull();
  });

  it("calls the cushion short when the household has not saved enough", () => {
    dataRef.current = {
      ...DATA,
      budgets: [
        makeBudget({
          cushion_saved_full_cents: "10000",
          cushion_required_full_cents: "90000",
        }),
      ],
    };
    render(<AggregateOverview />);
    expect(
      screen.getByTestId("aggregate-cushion-note").getAttribute("data-state"),
    ).toBe("short");
  });

  // A gap that rounds away to nothing is covered, not a surplus of zero — the
  // same 50-cent tolerance the BDP card applies.
  it("treats a gap that rounds to zero as covered", () => {
    dataRef.current = {
      ...DATA,
      budgets: [
        makeBudget({
          cushion_saved_full_cents: "90040",
          cushion_required_full_cents: "90000",
        }),
      ],
    };
    render(<AggregateOverview />);
    expect(
      screen.getByTestId("aggregate-cushion-note").getAttribute("data-state"),
    ).toBe("ok");
  });

  // Same move as the cushion tile: the reserves card listed a bare "Needed"
  // figure, while the BDP card next door says in one sentence whether the
  // reserves are in place, short, or over — and by how much (user, 260826).
  it("says whether the reserves are in place instead of listing what is needed", () => {
    render(<AggregateOverview />);
    // Fixture: 120,000 held against 120,000 required, twice over → in place.
    expect(
      screen.getByTestId("aggregate-reserves-note").getAttribute("data-state"),
    ).toBe("ok");
    expect(screen.queryByText("needed")).toBeNull();
  });

  it("calls the reserves short when they do not cover what is required", () => {
    dataRef.current = {
      ...DATA,
      budgets: [
        makeBudget({
          reserves_full_cents: "20000",
          reserves_required_cents: "120000",
        }),
      ],
    };
    render(<AggregateOverview />);
    expect(
      screen.getByTestId("aggregate-reserves-note").getAttribute("data-state"),
    ).toBe("short");
  });

  it("calls the reserves over when more is held than required", () => {
    dataRef.current = {
      ...DATA,
      budgets: [
        makeBudget({
          reserves_full_cents: "200000",
          reserves_required_cents: "120000",
        }),
      ],
    };
    render(<AggregateOverview />);
    expect(
      screen.getByTestId("aggregate-reserves-note").getAttribute("data-state"),
    ).toBe("surplus");
  });

  // A gap that rounds away is "in place", not an excess of nothing — the figures
  // print in whole units, so a 40-grosz surplus would otherwise read "0 extra".
  // The ICON reads the same state, so the two can never disagree.
  it("treats a reserves gap that rounds to zero as in place", () => {
    dataRef.current = {
      ...DATA,
      budgets: [
        makeBudget({
          reserves_full_cents: "120040",
          reserves_required_cents: "120000",
        }),
      ],
    };
    render(<AggregateOverview />);
    expect(
      screen.getByTestId("aggregate-reserves-note").getAttribute("data-state"),
    ).toBe("ok");
  });

  // The spend card's third row, ported from the BDP overview: a DEFICIT when a
  // forecast goes under, otherwise what is FREE TO MOVE, otherwise nothing.
  // "Upcoming" used to sit here unconditionally — a figure about next month's
  // plan answering a question about spare cash (user, 260826).
  it("shows the household deficit when a forecast goes under", () => {
    dataRef.current = {
      ...DATA,
      forecast_status: "red",
      forecast_shortfall_cents: "22000",
      forecast_free_to_move_cents: "0",
    };
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-spend-deficit")).toBeTruthy();
    expect(screen.queryByTestId("aggregate-spend-free-to-move")).toBeNull();
    expect(screen.queryByText("upcoming")).toBeNull();
  });

  it("shows what is free to move when nothing goes under", () => {
    dataRef.current = {
      ...DATA,
      forecast_status: "green",
      forecast_shortfall_cents: "0",
      forecast_free_to_move_cents: "33000",
    };
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-spend-free-to-move")).toBeTruthy();
    expect(screen.queryByTestId("aggregate-spend-deficit")).toBeNull();
  });

  // Same silence the BDP card keeps: no shortfall and nothing spare is not
  // worth a row, and it must not fall back to "Upcoming" either.
  it("shows neither row when there is nothing to say", () => {
    dataRef.current = {
      ...DATA,
      forecast_status: "green",
      forecast_shortfall_cents: "0",
      forecast_free_to_move_cents: "0",
    };
    render(<AggregateOverview />);
    expect(screen.queryByTestId("aggregate-spend-deficit")).toBeNull();
    expect(screen.queryByTestId("aggregate-spend-free-to-move")).toBeNull();
    expect(screen.queryByText("upcoming")).toBeNull();
    // The rest of the card survives.
    expect(screen.queryByText("spent")).not.toBeNull();
  });

  // A payload cached before the server computed these replays without them.
  it("shows neither row when the payload predates the figures", () => {
    dataRef.current = { ...DATA, forecast_status: "green" };
    render(<AggregateOverview />);
    expect(screen.queryByTestId("aggregate-spend-deficit")).toBeNull();
    expect(screen.queryByTestId("aggregate-spend-free-to-move")).toBeNull();
  });

  it("renders the day P/L block from the today-window grow (masked until revealed)", async () => {
    wealthRef.current = {
      display_currency: "USD",
      series: [{ label: "a", value_cents: "100" }],
      grow: { delta_cents: "5000", delta_pct: 2.5 },
    };
    render(<AggregateOverview />);
    const pl = screen.getByTestId("aggregate-hero-pl");
    // P/L is now privacy-masked (SlotAmount) like BDP — reveal, then read the
    // real values off the slots' aria-labels.
    fireEvent.click(within(pl).getAllByTestId("slot-amount")[0]);
    await waitFor(() => {
      const labels = within(pl)
        .getAllByTestId("slot-amount")
        .map((s) => s.getAttribute("aria-label"))
        .join(" ");
      expect(labels).toMatch(/2\.5%/);
      expect(labels).toMatch(/50/); // +$50
    });
  });

  it("renders a zero day P/L as flat — not a green gain", async () => {
    // No movement since the window opened: the hero P/L must read as neutral,
    // not as an up-arrow "+0.0%" gain.
    wealthRef.current = {
      display_currency: "USD",
      series: [{ label: "a", value_cents: "100" }],
      grow: { delta_cents: "0", delta_pct: 0 },
    };
    render(<AggregateOverview />);
    const pl = screen.getByTestId("aggregate-hero-pl");

    expect(pl.className).toContain("--muted-foreground");
    expect(pl.className).not.toContain("--trading-up");
    expect(pl.querySelector("svg")).toBeNull();

    fireEvent.click(within(pl).getAllByTestId("slot-amount")[0]);
    await waitFor(() => {
      const labels = within(pl)
        .getAllByTestId("slot-amount")
        .map((s) => s.getAttribute("aria-label"))
        .join(" ");
      expect(labels).not.toContain("+");
    });
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

// 260805: the range belongs to the PERSON, not the device — this page is scoped
// to no single budget, so it stores on the user row rather than a member row.
describe("AggregateOverview — remembered range", () => {
  beforeEach(() => {
    userPrefs.current = {};
    userPrefs.loaded = true;
    savePref.mockClear();
  });

  it("opens on the stored range", () => {
    userPrefs.current = { overviewRange: ["last12Months"] };
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-range-value").textContent).toBe(
      "last12Months",
    );
  });

  it("opens on six months when nothing is stored", () => {
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-range-value").textContent).toBe(
      "last6Months",
    );
  });

  // Drawing before the stored pick lands would fetch a trend for the default
  // range and then throw it away.
  it("draws nothing until the stored pick has landed", () => {
    userPrefs.loaded = false;
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-loading")).toBeTruthy();
  });
});

// 260806: offline, a query that has never run is PAUSED — it never succeeds and
// never errors. The page waits for the stored range before drawing, so a member
// whose picks were never cached sat on a skeleton forever with data right there
// in hand. Offline it stops waiting and takes its default.
describe("AggregateOverview — offline with no stored range", () => {
  beforeEach(() => {
    userPrefs.current = {};
    userPrefs.loaded = false;
    link.degraded = false;
  });
  afterEach(() => {
    link.degraded = false;
    userPrefs.loaded = true;
  });

  it("keeps waiting while the link is fine", () => {
    render(<AggregateOverview />);
    expect(screen.getByTestId("aggregate-loading")).toBeTruthy();
  });

  it("stops waiting once there is nothing to wait for", () => {
    link.degraded = true;
    render(<AggregateOverview />);
    expect(screen.queryByTestId("aggregate-loading")).toBeNull();
    expect(screen.getByTestId("aggregate-range-value").textContent).toBe(
      "last6Months",
    );
  });
});

/**
 * The all-budgets "Available to spend" card (user, 260811).
 *
 * It called its lower line "Left", while the per-budget card calls the same
 * quantity "Upcoming" — one number, two names. And it carried a green tick or a
 * red alert, which reads as a verdict on money that has not happened yet.
 * Across many budgets there is no single forecast to be right or wrong about,
 * so the card states the figures and passes no judgement: no icon at all.
 */
describe("AggregateOverview — available to spend", () => {
  beforeEach(() => {
    dataRef.current = DATA;
  });

  // The lower line used to be "Upcoming" — next month's plan, answering a
  // question about spare cash, and shown whether or not it meant anything. It is
  // now the BDP card's own third row: a deficit, or what is free to move, or
  // nothing (user, 260826).
  it("does not name the lower line 'upcoming' any more", () => {
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).queryByText("upcoming")).toBeNull();
    expect(within(card).queryByText("left")).toBeNull();
    // Spent stays — it is the one figure on this card that is simply a fact.
    expect(within(card).getByText("spent")).toBeTruthy();
  });

  it("goes green when every budget's forecast stays above water", () => {
    dataRef.current = { ...DATA, forecast_status: "green" };
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).getByTestId("aggregate-spend-good")).toBeTruthy();
    expect(within(card).queryByTestId("aggregate-spend-warn")).toBeNull();
    expect(within(card).queryByTestId("aggregate-spend-bad")).toBeNull();
  });

  it("goes yellow when a budget dips but the others could cover it", () => {
    dataRef.current = { ...DATA, forecast_status: "yellow" };
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).getByTestId("aggregate-spend-warn")).toBeTruthy();
    expect(within(card).queryByTestId("aggregate-spend-good")).toBeNull();
    expect(within(card).queryByTestId("aggregate-spend-bad")).toBeNull();
  });

  it("goes red when the holes are deeper than everything else together", () => {
    dataRef.current = { ...DATA, forecast_status: "red" };
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).getByTestId("aggregate-spend-bad")).toBeTruthy();
    expect(within(card).queryByTestId("aggregate-spend-good")).toBeNull();
  });

  it("falls back to cash-vs-upcoming for a payload cached before forecasts", () => {
    // Fixture cash 4,000 vs upcoming 800 → covered.
    dataRef.current = DATA;
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).getByTestId("aggregate-spend-good")).toBeTruthy();
  });

  it("…and shows red on that fallback when cash does not cover it", () => {
    dataRef.current = {
      ...DATA,
      budgets: [makeBudget({ cash_cents: "10000", left_month_cents: "90000" })],
    };
    render(<AggregateOverview />);
    const card = screen.getByTestId("aggregate-card-available-to-spend");
    expect(within(card).getByTestId("aggregate-spend-bad")).toBeTruthy();
  });
});
