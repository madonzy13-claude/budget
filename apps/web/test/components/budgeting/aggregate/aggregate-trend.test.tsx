import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-budgets-aggregate", () => ({
  useAggregateWealth: () => ({
    data: {
      display_currency: "USD",
      series: [
        { label: "Jan", value_cents: "100000" },
        { label: "Feb", value_cents: "230000" },
      ],
      grow: { delta_cents: "130000", delta_pct: 130 },
    },
    isPending: false,
  }),
}));
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: ({ data }: { data: any[] }) => (
    <div data-testid="area">{data.length}</div>
  ),
}));

const RANGE = {
  preset: "last6Months" as const,
  from: "2026-01-01",
  to: "2026-06-30",
};

describe("AggregateTrend", () => {
  it("renders the growth row (signed amount + %) and the area chart; no inline range selector", () => {
    render(<AggregateTrend includeIds={["b1", "b2"]} range={RANGE} />);
    expect(screen.getByTestId("aggregate-trend")).toBeTruthy();
    expect(screen.getByTestId("area").textContent).toBe("2");
    // signed amount block + PctStat %
    expect(screen.getByTestId("aggregate-trend-grow").textContent).toMatch(
      /\+.*1,?300/,
    );
    // the range selector is a SEPARATE piece owned by the parent — not here
    expect(screen.queryByTestId("overview-range-selector")).toBeNull();
  });
});
