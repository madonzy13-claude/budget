import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AggregateComposition } from "@/components/budgeting/aggregate/aggregate-composition";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/components/budgeting/charts/pie-chart", () => ({
  OverviewPieChart: ({ data }: { data: any[] }) => (
    <div data-testid="pie">{data.map((d) => d.name).join(",")}</div>
  ),
}));

describe("AggregateComposition", () => {
  it("passes cash / investments / reserves slices to the pie", () => {
    render(
      <AggregateComposition
        cashCents="60000"
        investmentsCents="240000"
        reservesCents="120000"
        currency="USD"
        locale="en"
      />,
    );
    expect(screen.getByTestId("pie").textContent).toContain("cash");
    expect(screen.getByTestId("pie").textContent).toContain("investments");
    expect(screen.getByTestId("pie").textContent).toContain("reserves");
  });

  it("filters out zero-value slices", () => {
    render(
      <AggregateComposition
        cashCents="60000"
        investmentsCents="0"
        reservesCents="0"
        currency="USD"
        locale="en"
      />,
    );
    const text = screen.getByTestId("pie").textContent ?? "";
    expect(text).toContain("cash");
    expect(text).not.toContain("investments");
    expect(text).not.toContain("reserves");
  });

  it("renders nothing when all slices are zero", () => {
    render(
      <AggregateComposition
        cashCents="0"
        investmentsCents="0"
        reservesCents="0"
        currency="USD"
        locale="en"
      />,
    );
    expect(screen.queryByTestId("pie")).toBeNull();
    expect(screen.queryByTestId("aggregate-composition")).toBeNull();
  });
});
