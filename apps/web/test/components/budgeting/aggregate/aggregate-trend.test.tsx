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
vi.mock("@/components/budgeting/charts/line-chart", () => ({
  OverviewLineChart: ({ data }: { data: any[] }) => (
    <div data-testid="line">{data.length}</div>
  ),
}));

describe("AggregateTrend", () => {
  it("renders the combined series", () => {
    render(<AggregateTrend includeIds={["b1", "b2"]} />);
    expect(screen.getByTestId("aggregate-trend")).toBeTruthy();
    expect(screen.getByTestId("line").textContent).toBe("2");
  });
});
