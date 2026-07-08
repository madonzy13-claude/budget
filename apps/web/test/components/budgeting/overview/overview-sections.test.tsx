/**
 * overview-sections.test.tsx — Vitest + RTL for the Overview sections composition
 * (Phase 11, 11-09). Verifies: all four sections start collapsed (lazy — no chart
 * mounted), expanding Planned enables its fetch + mounts a chart, changing the
 * range re-keys the Planned fetch (new from/to), and toggling Wealth to investments
 * switches the view + shows the pie. Hooks + chart wrappers are mocked so the test
 * exercises composition logic, not recharts rendering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [{ id: "c1", name: "Food", colorKey: null }] }),
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
  OverviewPieChart: () => <div data-testid="pie-chart" />,
}));

import { OverviewSections } from "@/components/budgeting/overview/overview-sections";

function renderSections() {
  return render(<OverviewSections budgetId="b1" />);
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
    },
  ],
  recurringPerMonth: [{ month: 1, planned_cents: "10000" }],
  recurringPerCategory: [
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
  it("renders four sections collapsed by default (no chart mounted)", () => {
    renderSections();
    expect(
      screen.getByRole("button", { name: "sections.planned" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "sections.overspent" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "sections.reserves" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "sections.wealth" }),
    ).toBeTruthy();
    // collapsed → no chart bodies, and the section hooks are disabled
    expect(screen.queryByTestId("line-chart")).toBeNull();
    expect(lastOpts(plannedMock).enabled).toBe(false);
  });

  it("expanding Planned enables its fetch and mounts the timeline chart", async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole("button", { name: "sections.planned" }));
    expect(lastOpts(plannedMock).enabled).toBe(true);
    // Timeline (Planned vs Real) + Recurring-by-month are now Simple Area charts.
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
