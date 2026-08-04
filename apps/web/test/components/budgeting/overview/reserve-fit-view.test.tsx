/**
 * reserve-fit-view.test.tsx — the reserve-sizing block (260804).
 *
 * The bar answers "how far off is this buffer"; the list under it is where the
 * member overrules the history — every large spend counted by default, unticking
 * one says "that won't happen again". A recurring charge shows its cadence,
 * because rare-and-certain (September insurance) must NOT be unticked.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
  useLocale: () => "en",
}));

vi.mock("@/components/budgeting/charts/diverging-bar-chart", () => ({
  OverviewDivergingBarChart: ({
    data,
    categoryKey,
  }: {
    data: Record<string, unknown>[];
    categoryKey: string;
  }) => (
    <div
      data-testid="fit-chart"
      data-rows={data.map((d) => String(d[categoryKey])).join(",")}
    />
  ),
  varianceColorForRange: () => "#fff",
}));

const { ReserveFitView } =
  await import("@/components/budgeting/overview/reserve-fit-view");

const DTO = {
  currency: "PLN",
  rows: [
    {
      category_id: "sport",
      name: "Sport",
      held_cents: "460000",
      needed_cents: "0",
      gap_cents: "460000",
      worst_month: "2026-03",
      worst_overage_cents: "480000",
      overage_months: 1,
      months_counted: 12,
      large_transactions: [
        {
          ledger_id: "tx-jump",
          transaction_date: "2026-03-14",
          note: "Parachute jump",
          amount_cents: "480000",
          recurring_cadence: null,
          excluded: false,
        },
      ],
    },
    {
      category_id: "car",
      name: "Car",
      held_cents: "100000",
      needed_cents: "500000",
      gap_cents: "-400000",
      worst_month: "2025-09",
      worst_overage_cents: "500000",
      overage_months: 1,
      months_counted: 12,
      large_transactions: [
        {
          ledger_id: "tx-ins",
          transaction_date: "2025-09-01",
          note: "Insurance",
          amount_cents: "500000",
          recurring_cadence: "YEARLY",
          excluded: false,
        },
      ],
    },
    {
      category_id: "new",
      name: "Newborn",
      held_cents: "0",
      needed_cents: "0",
      gap_cents: "0",
      worst_month: null,
      worst_overage_cents: "0",
      overage_months: 0,
      months_counted: 1,
      large_transactions: [],
    },
  ],
};

const view = (onToggle = vi.fn()) => {
  render(
    <ReserveFitView
      data={DTO}
      onToggle={onToggle}
      format={(c: number) => `${Math.round(c / 100)} zl`}
    />,
  );
  return onToggle;
};

describe("ReserveFitView", () => {
  it("draws a bar for every category with enough history", () => {
    view();
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Car,Sport",
    );
  });

  it("sets a barely-used category aside instead of sizing it", () => {
    view();
    expect(screen.getByTestId("reserve-fit-thin").textContent).toContain(
      "Newborn",
    );
  });

  it("lists each category's large spend, counted by default", async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByTestId("reserve-fit-oneoffs-sport"));
    const box = screen.getByTestId(
      "reserve-fit-tx-tx-jump",
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText(/Parachute jump/)).toBeTruthy();
  });

  it("shows the cadence of a spend that will come round again", async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByTestId("reserve-fit-oneoffs-car"));
    expect(
      screen.getByTestId("reserve-fit-recurs-tx-ins").textContent,
    ).toContain("YEARLY");
    expect(screen.queryByTestId("reserve-fit-recurs-tx-jump")).toBeNull();
  });

  it("unticking a spend reports it as excluded", async () => {
    const user = userEvent.setup();
    const onToggle = view();
    await user.click(screen.getByTestId("reserve-fit-oneoffs-sport"));
    await user.click(screen.getByTestId("reserve-fit-tx-tx-jump"));
    expect(onToggle).toHaveBeenCalledWith("tx-jump", true);
  });

  it("re-ticking one reports it counted again", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ReserveFitView
        data={{
          ...DTO,
          rows: [
            {
              ...DTO.rows[0]!,
              large_transactions: [
                { ...DTO.rows[0]!.large_transactions[0]!, excluded: true },
              ],
            },
          ],
        }}
        onToggle={onToggle}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-oneoffs-sport"));
    await user.click(screen.getByTestId("reserve-fit-tx-tx-jump"));
    expect(onToggle).toHaveBeenCalledWith("tx-jump", false);
  });

  it("says so when there is nothing to size at all", () => {
    render(
      <ReserveFitView
        data={{ currency: "PLN", rows: [] }}
        onToggle={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    expect(screen.queryByTestId("fit-chart")).toBeNull();
    expect(screen.getByTestId("reserve-fit-empty")).toBeTruthy();
  });
});
