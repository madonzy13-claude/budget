import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";

const wealth = vi.fn(() => ({
  data: {
    display_currency: "USD",
    series: [
      { label: "Jan", value_cents: "100000" },
      { label: "Feb", value_cents: "230000" },
    ],
    grow: { delta_cents: "130000", delta_pct: 130 },
    invested_cents: null,
    pie: null,
  },
  isPending: false,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useAggregateWealth: (...args: unknown[]) => wealth(...(args as [])),
}));
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: ({ data }: { data: any[] }) => (
    <div data-testid="area">{data.length}</div>
  ),
}));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: ({ data }: { data: any[] }) => (
    <div data-testid="pie">
      {data.map((d) => d.name ?? d.holding_type).join(",")}
    </div>
  ),
}));

const RANGE = {
  preset: "last6Months" as const,
  from: "2026-01-01",
  to: "2026-06-30",
};
const CAP = {
  investmentsCents: "400000",
  cashCents: "300000",
  reservesCents: "0",
  cushionCents: "0",
  possessionsCents: "0",
};

function renderTrend(cap: typeof CAP = CAP) {
  return render(
    <AggregateTrend
      includeIds={["b1", "b2"]}
      range={RANGE}
      currency="USD"
      capitalization={cap}
    />,
  );
}

describe("AggregateTrend", () => {
  it("capitalization view: growth row + area chart + a where-it-sits pie", () => {
    renderTrend();
    expect(screen.getByTestId("area").textContent).toBe("2");
    // The growth metric is a BDP-parity CombinedStat: a "grow"/"loss" label with
    // the % above the money amount, both privacy SlotAmounts. Reveal, then read
    // the amount's aria-label.
    const grow = screen.getByText("grow").parentElement!;
    const slots = within(grow).getAllByTestId("slot-amount");
    expect(slots.length).toBe(2); // [0] = %, [1] = money amount
    fireEvent.click(slots[1]!);
    expect(slots[1]!.getAttribute("aria-label")).toMatch(/\+.*1,?300/);
    // capitalization pie built from the row sums (investments + cash)
    expect(screen.getByTestId("aggregate-cap-pie")).toBeTruthy();
    expect(screen.getByTestId("pie").textContent).toContain("investments");
    // no inline range selector (parent owns it)
    expect(screen.queryByTestId("overview-range-selector")).toBeNull();
  });

  // 260721 user feedback (7): possessions are part of capitalization → a slice
  // in the "where it sits" cap pie.
  it("possessions appear as a slice in the capitalization pie", () => {
    renderTrend({ ...CAP, possessionsCents: "150000" });
    expect(screen.getByTestId("pie").textContent).toContain("possessions");
  });

  it("no possessions slice when the possessions total is zero", () => {
    renderTrend({ ...CAP, possessionsCents: "0" });
    expect(screen.getByTestId("pie").textContent).not.toContain("possessions");
  });

  it("switching to Investments refetches with view=investments and shows the by-type pie", () => {
    wealth.mockReturnValueOnce({
      data: {
        display_currency: "USD",
        series: [{ label: "Feb", value_cents: "50000" }],
        grow: { delta_cents: "5000", delta_pct: 11.1 },
        invested_cents: "40000",
        pie: [{ holding_type: "stock", value_cents: "50000" }],
      },
      isPending: false,
    } as any);
    renderTrend();
    fireEvent.click(screen.getByTestId("aggregate-view-investments"));
    // last call passed view="investments"
    const call = wealth.mock.calls.at(-1)!;
    expect(call[3]).toBe("investments");
    expect(screen.getByTestId("aggregate-invest-pie")).toBeTruthy();
  });
});
