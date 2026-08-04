/**
 * recurring-tooltip.test.tsx — the payments behind a category bar (260804).
 *
 * The by-month bar has always listed what makes it up; the by-category bar
 * showed only a total, so "Housing 1,200" left the member guessing which rules
 * were in it.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const barProps: Record<string, unknown>[] = [];
vi.mock("@/components/budgeting/charts/bar-chart", () => ({
  OverviewBarChart: (props: Record<string, unknown>) => {
    barProps.push(props);
    return <div data-testid="bar-chart" />;
  },
}));
vi.mock("@/components/budgeting/charts/area-chart", () => ({
  OverviewAreaChart: () => <div data-testid="area-chart" />,
}));

const plannedMock = vi.fn();
vi.mock("@/hooks/use-overview-planned", () => ({
  useOverviewPlanned: (...a: unknown[]) => plannedMock(...a),
}));
vi.mock("@/components/budgeting/bdp-ui-state", () => ({
  usePersistedSectionOpen: () => [true, () => {}],
}));

const { RecurringSection } =
  await import("@/components/budgeting/overview/recurring-section");

const DTO = {
  currency: "PLN",
  recurringPerMonth: [{ month: 1, planned_cents: "1000", items: [] }],
  recurringPerCategory: [
    {
      category_id: "housing",
      name: "Housing",
      planned_cents: "210000",
      items: [
        { name: "Rent", amount_cents: "200000" },
        { name: "Building insurance", amount_cents: "10000" },
      ],
    },
  ],
};

describe("Recurring payments, by category", () => {
  it("hands the tooltip every payment behind the bar", () => {
    barProps.length = 0;
    plannedMock.mockReturnValue({
      data: DTO,
      isPending: false,
      isError: false,
    });
    render(
      <RecurringSection
        budgetId="b1"
        range={{ from: "2026-01-01", to: "2026-12-31", key: "1Y" }}
      />,
    );
    expect(screen.getByTestId("bar-chart")).toBeTruthy();
    const extra = barProps.at(-1)?.tooltipExtra as (
      row: Record<string, unknown>,
    ) => { label: string; value: string }[];
    const rows = extra({ items: DTO.recurringPerCategory[0]!.items });
    expect(rows.map((r) => r.label)).toEqual(["Rent", "Building insurance"]);
  });

  it("says nothing extra for a payload cached before the list existed", () => {
    barProps.length = 0;
    plannedMock.mockReturnValue({
      data: {
        ...DTO,
        recurringPerCategory: [
          { category_id: "housing", name: "Housing", planned_cents: "210000" },
        ],
      },
      isPending: false,
      isError: false,
    });
    render(
      <RecurringSection
        budgetId="b1"
        range={{ from: "2026-01-01", to: "2026-12-31", key: "1Y" }}
      />,
    );
    const extra = barProps.at(-1)?.tooltipExtra as (
      row: Record<string, unknown>,
    ) => unknown[];
    expect(extra({})).toEqual([]);
  });
});
