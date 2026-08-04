/**
 * reserve-fit-view.test.tsx — the reserve-sizing block (260804).
 *
 * The bar answers "how far off is this buffer". Overruling the history moved
 * into one dialog (reserve-fit-one-offs.tsx, tested there); this file covers
 * what the block itself decides: which rows get a bar, which are set aside as
 * too new to judge, and that every category's large spend reaches the dialog
 * carrying the category it belongs to.
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

vi.mock("@/components/budgeting/overview/reserve-fit-one-offs", () => ({
  ReserveFitOneOffs: ({
    candidates,
    onSave,
  }: {
    candidates: { ledger_id: string; category_name: string }[];
    onSave: (d: { add: string[]; remove: string[] }) => void;
  }) => (
    <div>
      <span
        data-testid="one-offs"
        data-candidates={JSON.stringify(
          candidates.map((c) => ({
            ledger_id: c.ledger_id,
            category_name: c.category_name,
          })),
        )}
      />
      <button
        type="button"
        data-testid="one-offs-save"
        onClick={() => onSave({ add: ["tx-jump"], remove: [] })}
      />
    </div>
  ),
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

const view = (onSave = vi.fn()) => {
  render(
    <ReserveFitView
      data={DTO}
      onSave={onSave}
      format={(c: number) => `${Math.round(c / 100)} zl`}
    />,
  );
  return onSave;
};

describe("ReserveFitView", () => {
  it("draws a bar per category, fattest reserve first", () => {
    view();
    // Sport holds 4,600 over; Car is 4,000 short — over-held at the top (260804).
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Sport,Car",
    );
  });

  it("sets a barely-used category aside instead of sizing it", () => {
    view();
    expect(screen.getByTestId("reserve-fit-thin").textContent).toContain(
      "Newborn",
    );
  });

  it("hands the dialog every category's large spend, tagged with its category", () => {
    view();
    const dialogProps = JSON.parse(
      screen.getByTestId("one-offs").getAttribute("data-candidates")!,
    );
    expect(dialogProps).toEqual([
      { ledger_id: "tx-jump", category_name: "Sport" },
      { ledger_id: "tx-ins", category_name: "Car" },
    ]);
  });

  it("passes a save straight through", async () => {
    const user = userEvent.setup();
    const onSave = view();
    await user.click(screen.getByTestId("one-offs-save"));
    expect(onSave).toHaveBeenCalledWith({ add: ["tx-jump"], remove: [] });
  });

  it("says so when there is nothing to size at all", () => {
    render(
      <ReserveFitView
        data={{ currency: "PLN", rows: [] }}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    expect(screen.queryByTestId("fit-chart")).toBeNull();
    expect(screen.getByTestId("reserve-fit-empty")).toBeTruthy();
  });
});
