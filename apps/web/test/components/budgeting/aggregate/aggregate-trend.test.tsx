import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "UTC",
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
// BDP wealth section renders an AREA chart (not line) + the shared range selector.
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: ({ data }: { data: any[] }) => (
    <div data-testid="area">{data.length}</div>
  ),
}));
vi.mock("@/components/budgeting/overview/range-selector", () => ({
  RangeSelector: () => <div data-testid="range-selector" />,
}));

describe("AggregateTrend", () => {
  it("renders the area chart + range selector + grow badge", () => {
    render(<AggregateTrend includeIds={["b1", "b2"]} />);
    expect(screen.getByTestId("aggregate-trend")).toBeTruthy();
    expect(screen.getByTestId("range-selector")).toBeTruthy();
    expect(screen.getByTestId("area").textContent).toBe("2");
    // range-scoped grow badge (amount + signed %)
    expect(screen.getByTestId("aggregate-trend-grow").textContent).toMatch(
      /130\.0%/,
    );
  });
});
