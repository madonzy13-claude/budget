/**
 * overview-sections.test.tsx — Vitest + RTL for the Overview sections composition
 * (Phase 11, 11-09). Verifies: all four sections start collapsed (lazy — no chart
 * mounted), expanding Planned enables its fetch + mounts a chart, changing the
 * range re-keys the Planned fetch (new from/to), and toggling Wealth to investments
 * switches the view + shows the pie. Hooks + chart wrappers are mocked so the test
 * exercises composition logic, not recharts rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { plannedMock, overspentMock, wealthMock } = vi.hoisted(() => ({
  plannedMock: vi.fn(),
  overspentMock: vi.fn(),
  wealthMock: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/hooks/use-overview-planned", () => ({
  useOverviewPlanned: plannedMock,
}));
vi.mock("@/hooks/use-overview-overspent", () => ({
  useOverviewOverspent: overspentMock,
}));
vi.mock("@/hooks/use-overview-wealth", () => ({
  useOverviewWealth: wealthMock,
}));
// The reserves section grew a reserve-fit block (260804); this suite exercises
// composition, not that block's own data.
// The Planned section's limit dialog reads the current needs/wants split and
// writes a new one — neither is what this file is about, and both want a
// QueryClient.
vi.mock("@/hooks/use-spendings-summary", () => ({
  useSpendingsSummary: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-set-category-limit", () => ({
  useSetCategoryLimit: () => ({ mutateAsync: async () => {} }),
}));
vi.mock("@/hooks/use-one-off-candidates", () => ({
  // The one-off dialog pages its own list; these tests are about the charts.
  useOneOffCandidates: () => ({
    data: { pages: [] },
    hasNextPage: false,
    fetchNextPage: () => {},
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-reserve-fit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-reserve-fit")>()),
  useReserveFit: () => ({ data: undefined, isPending: false, isError: false }),
  useSaveReserveFitExclusions: () => ({ mutate: () => {} }),
}));
vi.mock("@/hooks/use-update-reserve-adjustment", () => ({
  useUpdateReserveAdjustment: () => ({
    mutateAsync: async () => ({ reserveCents: "0" }),
  }),
}));
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({
    data: [
      { id: "c1", name: "Food", colorKey: null },
      { id: "c2", name: "Investments", colorKey: null, isInvestment: true },
    ],
  }),
}));
// The category pickers read the member's stored picks from the server (260802);
// here nobody has picked anything, so both charts show everything.
const { prefsMock } = vi.hoisted(() => ({
  prefsMock: { value: {} as Record<string, string[]> },
}));
vi.mock("@/hooks/use-member-ui-prefs", () => ({
  useMemberUiPrefs: () => ({
    prefs: prefsMock.value,
    isLoaded: true,
    save: async () => {},
  }),
}));
// WealthSection reads the (prefetched) overview cards for its capitalization pie.
vi.mock("@/hooks/use-overview-cards", () => ({
  useOverviewCards: () => ({
    data: {
      investment_value_cents: "50000",
      spendings: { wallet_cents: "30000" },
      reserves: { wallet_cents: "20000" },
      cushion: { total_cents: "10000" },
    },
  }),
}));

// Stub the chart wrappers — recharts rendering is covered by the 11-02 smoke test.
vi.mock("@/components/budgeting/charts/line-chart", () => ({
  OverviewLineChart: () => <div data-testid="line-chart" />,
}));
vi.mock("@/components/budgeting/charts/bar-chart", () => ({
  OverviewBarChart: () => <div data-testid="bar-chart" />,
}));
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: () => <div data-testid="area-chart" />,
}));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: ({
    maskValue,
    data,
    outerRing,
    nameKey,
  }: {
    maskValue?: boolean;
    data?: Record<string, unknown>[];
    nameKey?: string;
    outerRing?: { data: Record<string, unknown>[]; nameKey?: string };
  }) => (
    <div
      data-testid="pie-chart"
      data-mask={String(!!maskValue)}
      data-slices={(data ?? [])
        .map((d) => String(d[nameKey ?? "name"]))
        .join(",")}
      data-ring={(outerRing?.data ?? [])
        .map((d) => String(d[outerRing?.nameKey ?? "name"]))
        .join(",")}
    />
  ),
}));

import { OverviewSections } from "@/components/budgeting/overview/overview-sections";

function renderSections(props: { amountPrivacyEnabled?: boolean } = {}) {
  return render(<OverviewSections budgetId="b1" {...props} />);
}

const PLANNED = {
  currency: "USD",
  bucket: "monthly",
  timeline: [{ label: "2026-01", planned_cents: "20000", real_cents: "18000" }],
  plannedAvgVsReal: [
    {
      category_id: "c1",
      name: "Food",
      planned_avg_cents: "20000",
      real_avg_cents: "18000",
      needs_avg_cents: "20000",
    },
    {
      category_id: "c2",
      name: "Investments",
      planned_avg_cents: "50000",
      real_avg_cents: "50000",
      needs_avg_cents: "0",
    },
  ],
  rangeTotals: {
    planned_cents: "60000",
    spent_cents: "70000",
    within_limit_cents: "50000",
    reserve_used_cents: "0",
    overspent_cents: "20000",
  },
  scheduledPerMonth: [{ month: 1, planned_cents: "10000" }],
  scheduledPerCategory: [
    { category_id: "c1", name: "Food", planned_cents: "10000" },
  ],
};

const WEALTH = {
  currency: "USD",
  view: "capitalization",
  bucket: "monthly",
  series: [{ label: "2026-01", value_cents: "100000" }],
  grow: { delta_cents: "5000", delta_pct: 5.0 },
  monthly_avg_grow_pct: 4.0,
  dynamics: [{ label: "2026-02", pct: 10 }],
  pie: [{ holding_type: "equities", value_cents: "60000" }],
};

beforeEach(() => {
  prefsMock.value = {};
  plannedMock.mockReset();
  overspentMock.mockReset();
  wealthMock.mockReset();
  plannedMock.mockReturnValue({
    data: PLANNED,
    isPending: false,
    isError: false,
  });
  overspentMock.mockReturnValue({
    data: {
      currency: "USD",
      overspent_total_cents: "0",
      overspent_by_category: [],
      reserves_by_category: [],
    },
    isPending: false,
    isError: false,
  });
  wealthMock.mockReturnValue({
    data: WEALTH,
    isPending: false,
    isError: false,
  });
});

function lastOpts(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[mock.mock.calls.length - 1]?.[1] as {
    from: string;
    to: string;
    enabled: boolean;
    view?: string;
  };
}

describe("OverviewSections", () => {
  it("renders three sections collapsed by default (no chart mounted)", () => {
    renderSections();
    // 260803: Overspent lost its own collapsible and reads inside Planned.
    // 260804: so did the scheduled chart — one chart did not earn a section.
    for (const name of [
      "sections.planned",
      "sections.reserves",
      "sections.wealth",
    ])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "sections.overspent" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "sections.scheduled" }),
    ).toBeNull();
    // collapsed → no chart bodies. The DATA is another matter: since 260806 a
    // collapsed section still warms in the background, so the reader never pays
    // for opening one (see "warmed while still collapsed" below).
    expect(screen.queryByTestId("line-chart")).toBeNull();
  });

  // 260804: the scheduled-by-month chart moved in under the planned pie, and
  // the by-category one is gone — the section it lived in went with it.
  it("mounts the scheduled-by-month chart inside Planned", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByText("sections.planned"));
    expect(screen.getByText("planned.scheduledPerMonth")).toBeTruthy();
    expect(screen.queryByText("planned.scheduledPerCategory")).toBeNull();
  });

  it("expanding Planned enables its fetch and mounts the timeline chart", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.planned" }));
    expect(lastOpts(plannedMock).enabled).toBe(true);
    // Timeline (Planned vs Real) + Scheduled-by-month are now Simple Area charts.
    expect(screen.getAllByTestId("area-chart").length).toBeGreaterThan(0);
  });

  it("changing the range re-keys the Planned fetch with a new from", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.planned" }));
    const before = lastOpts(plannedMock).from;
    await user.click(screen.getByRole("button", { name: "3M" })); // last3Months
    const after = lastOpts(plannedMock).from;
    expect(after).not.toBe(before);
  });

  it("expanding Planned mounts the planned-by-category pie below the over/under chart", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.planned" }));
    // The pie (average planned spend per category over the selected range)
    // renders with its own label; Wealth stays collapsed so this is the only pie.
    expect(screen.getByText("planned.avgPie")).toBeTruthy();
    expect(screen.getByTestId("pie-chart")).toBeTruthy();
  });

  it("survives a CACHED payload from before rangeTotals existed", async () => {
    // The persisted query cache replays the previous deploy's DTO shape, so a
    // newly added field arrives undefined on the first paint. Reading it blind
    // took the whole tab down with "Something went wrong" (found in live
    // verification, 260803) — every returning user would meet that on any deploy
    // that adds a field.
    const old = { ...(PLANNED as Record<string, unknown>) };
    delete old.rangeTotals;
    plannedMock.mockReturnValue({
      data: old,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.planned" }));
    expect(screen.getByTestId("planned-totals")).toBeTruthy();
  });

  it("opens Planned on the range's three figures, not a by-category bar", () => {
    // 260803 user request: the "Amount over budget, by category" bar is gone;
    // what the range cost, what came out of the reserve and what went over is
    // the first thing the section says.
    renderSections();
    expect(screen.queryByTestId("planned-totals")).toBeNull();
    return userEvent
      .setup()
      .click(screen.getByRole("button", { name: "sections.planned" }))
      .then(() => {
        expect(screen.getByTestId("planned-totals")).toBeTruthy();
        expect(screen.queryByText("overspentByCategory")).toBeNull();
      });
  });

  it("toggling Wealth to investments switches the view and shows the pie", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.wealth" }));
    await user.click(
      screen.getByRole("button", { name: "wealth.investments" }),
    );
    expect(lastOpts(wealthMock).view).toBe("investments");
    expect(screen.getByTestId("pie-chart")).toBeTruthy();
  });
});

// The planned figures are a plan, not a balance: the member asked for them to
// stay readable while the rest of the page is redacted (260803).
describe("Planned — privacy", () => {
  it("shows the metric figures even with amount privacy on", async () => {
    const user = userEvent.setup();
    renderSections({ amountPrivacyEnabled: true });
    await user.click(screen.getByText("sections.planned"));
    const spent = await screen.findByTestId("planned-total-spent");
    expect(spent.textContent).toMatch(/\d/);
  });

  it("leaves the planned pie unmasked", async () => {
    const user = userEvent.setup();
    renderSections({ amountPrivacyEnabled: true });
    await user.click(screen.getByText("sections.planned"));
    const pies = await screen.findAllByTestId("pie-chart");
    expect(pies.map((p) => p.getAttribute("data-mask"))).not.toContain("true");
  });
});

// The picker narrows the SLICES only. The investing arc is budget-wide: hiding
// the category must not erase the plan's investing share (user, 260803).
describe("Planned pie — investments on both rings", () => {
  const pie = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByText("sections.planned"));
    const pies = await screen.findAllByTestId("pie-chart");
    return pies[pies.length - 1]!;
  };

  it("draws investments as a slice AND as an arc", async () => {
    const user = userEvent.setup();
    renderSections();
    const p = await pie(user);
    expect(p.getAttribute("data-slices")).toContain("Investments");
    expect(p.getAttribute("data-ring")).toContain("planned.ring.investments");
  });

  it("keeps the arc when the picker drops the investment category", async () => {
    // The section's ONE filter now governs the pie too (user, 260810) — its
    // private "planned-pie-categories" set is gone.
    prefsMock.value = { "planned-categories": ["c1"] };
    const user = userEvent.setup();
    renderSections();
    const p = await pie(user);
    expect(p.getAttribute("data-slices")).not.toContain("Investments");
    expect(p.getAttribute("data-ring")).toContain("planned.ring.investments");
  });
});

// 260804: both "How far off plan, by category" and "Is each reserve the right
// size?" judge whole months against their budget and leave the running month
// out. On a range holding nothing else there is nothing to judge, so they say
// so rather than draw a bar from half a month.
describe("charts that need a finished month", () => {
  it("stands the planned chart down on the running month alone", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByText("sections.planned"));
    // Default range is the running month.
    expect(screen.getByTestId("overview-planned-needs-month")).toBeTruthy();
  });

  it("brings it back as soon as the range reaches further", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByText("sections.planned"));
    await user.click(screen.getByRole("button", { name: "3M" }));
    expect(screen.queryByTestId("overview-planned-needs-month")).toBeNull();
  });
});

// 260806 (user request): a collapsed section used to fetch nothing, so opening
// it cost a wait — and offline a section nobody had opened had nothing at all to
// show. They warm in the background now, collapsed or not.
//
// 260827: and they no longer take turns. The waves that spaced them 700ms apart
// are gone; request-pool caps what is IN FLIGHT instead, which throttles the
// burst without leaving the network idle between turns. Measured on a cold
// load, the old clock left 1,781ms of a 3,553ms warm-up doing nothing.
describe("Overview sections — warmed while still collapsed", () => {
  const anyEnabled = (mock: ReturnType<typeof vi.fn>) =>
    mock.mock.calls.some(
      (c) => (c[1] as { enabled?: boolean } | undefined)?.enabled === true,
    );

  it("asks for a section's data before anyone opens it", async () => {
    await act(async () => {
      renderSections();
    });
    expect({
      planned: lastOpts(plannedMock).enabled,
      overspent: lastOpts(overspentMock).enabled,
      wealth: anyEnabled(wealthMock),
    }).toEqual({ planned: true, overspent: true, wealth: true });
  });

  // The inverse of the test that stood here. It asserted the heaviest section
  // was still WAITING on the first render, which was the whole point of the
  // waves. Nothing waits now — and nothing needs to, because the limit is on
  // concurrency rather than on the clock.
  it("asks for all of them at once, with no timer advanced", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => {
        renderSections();
      });
      // Not a single timer moved.
      expect({
        planned: lastOpts(plannedMock).enabled,
        overspent: lastOpts(overspentMock).enabled,
        wealth: anyEnabled(wealthMock),
      }).toEqual({ planned: true, overspent: true, wealth: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
