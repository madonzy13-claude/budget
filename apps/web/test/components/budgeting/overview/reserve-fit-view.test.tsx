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
import messages from "../../../../messages/en.json";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  // Echoes the KEY (so assertions stay readable) but resolves it against the
  // real en.json first and throws when it is missing: a typo'd key rendered as
  // a silent MISSING_MESSAGE in production while every test passed (260804).
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, unknown>) => {
      const path = `${ns}.${key}`.split(".");
      let node: unknown = messages;
      for (const part of path) {
        node = (node as Record<string, unknown> | undefined)?.[part];
        if (node === undefined)
          throw new Error(`missing i18n key: ${path.join(".")}`);
      }
      return vars ? `${key}:${Object.values(vars).join(",")}` : key;
    },
  useLocale: () => "en",
}));

vi.mock("@/components/budgeting/charts/diverging-bar-chart", () => ({
  OverviewDivergingBarChart: ({
    data,
    categoryKey,
    valueKey,
    formatValue,
  }: {
    data: Record<string, unknown>[];
    categoryKey: string;
    valueKey: string;
    formatValue?: (n: number) => string;
  }) => (
    <div
      data-testid="fit-chart"
      data-rows={data.map((d) => String(d[categoryKey])).join(",")}
      data-value-key={valueKey}
      data-money={String(typeof formatValue === "function")}
      data-samples={JSON.stringify({
        positive: formatValue?.(4600),
        negative: formatValue?.(-4600),
        zero: formatValue?.(0),
      })}
    />
  ),
  varianceColorForRange: () => "#fff",
  reserveFitColor: () => "#fff",
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
    // Sport is +100% (holds 4,600, needs nothing), Newborn 0%, Car −80%:
    // most over-held at the top, by percent (260804).
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Sport,Newborn,Car",
    );
  });

  // 260804: no "too little history" row — a one-month category is judged on
  // its one month, like every other.
  it("draws even a barely-used category", () => {
    view();
    expect(screen.queryByTestId("reserve-fit-thin")).toBeNull();
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toContain(
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

  // 260804: the same chart reads in zł when the member asks — "1,900 too much"
  // is what you act on; "240% too much" is only how far off it is.
  it("plots percent by default", () => {
    view();
    const chart = screen.getByTestId("fit-chart");
    expect(chart.getAttribute("data-value-key")).toBe("pct");
    expect(chart.getAttribute("data-money")).toBe("false");
  });

  it("plots the money gap when the scale says so", () => {
    render(
      <ReserveFitView
        data={DTO}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
        scale="amount"
      />,
    );
    const chart = screen.getByTestId("fit-chart");
    expect(chart.getAttribute("data-value-key")).toBe("gapCents");
    expect(chart.getAttribute("data-money")).toBe("true");
  });

  // 260804: the bar is a signed gap, so money must carry its sign the way the
  // percent labels always have — "+4,600" reads as slack, "4,600" reads as a
  // balance.
  it("signs the money labels", () => {
    render(
      <ReserveFitView
        data={DTO}
        onSave={vi.fn()}
        format={(c: number) => `${c} zl`}
        scale="amount"
      />,
    );
    const fmt = JSON.parse(
      screen.getByTestId("fit-chart").getAttribute("data-samples")!,
    );
    expect(fmt.positive).toBe("+4600 zl");
    expect(fmt.negative).toBe("−4600 zl");
    expect(fmt.zero).toBe("0 zl");
  });

  it("keeps the one-offs button out of the switch's row", () => {
    render(
      <ReserveFitView
        data={DTO}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
        scaleSwitch={<span data-testid="the-switch" />}
      />,
    );
    const corner = screen.getByTestId("reserve-fit-corner");
    expect(within(corner).getByTestId("one-offs")).toBeTruthy();
    expect(within(corner).queryByTestId("the-switch")).toBeNull();
  });

  it("orders the bars by money when the chart is read in money", () => {
    const tiny = {
      ...DTO.rows[0]!,
      category_id: "tiny",
      name: "Tiny",
      held_cents: "4000",
      needed_cents: "1000",
      gap_cents: "3000",
      large_transactions: [],
    };
    const data = { ...DTO, rows: [...DTO.rows, tiny] };
    const { unmount } = render(
      <ReserveFitView
        data={data}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    // percent: Tiny (+300%) leads
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Tiny,Sport,Newborn,Car",
    );
    unmount();
    render(
      <ReserveFitView
        data={data}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
        scale="amount"
      />,
    );
    // money: Sport's 4,600 dwarfs Tiny's 30
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Sport,Tiny,Newborn,Car",
    );
  });

  it("says the running month is left out, and hosts the section's switch", () => {
    render(
      <ReserveFitView
        data={DTO}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
        scaleSwitch={<span data-testid="the-switch" />}
      />,
    );
    expect(screen.getByTestId("reserve-fit-ongoing-note")).toBeTruthy();
    expect(screen.getByTestId("the-switch")).toBeTruthy();
  });

  // 260804: held against needed reads as a pipe — outline = what the history
  // asked for, fill = what is actually there (reserve-level-bar.test.tsx covers
  // the layers themselves; this pins the wiring).
  it("meters what is held inside the target's outline", () => {
    view();
    expect(screen.getByTestId("reserve-bar-target")).toBeTruthy();
    expect(screen.getByTestId("reserve-bar-covered")).toBeTruthy();
  });

  it("hands it the section's totals", () => {
    view();
    // Sport 4,600 held / 0 needed; Car 1,000 / 5,000 → 5,600 held, 5,000 needed.
    expect(screen.getByTestId("reserve-bar-held").textContent).toContain(
      "5600",
    );
    expect(screen.getByTestId("reserve-bar-action").textContent).toContain(
      "reserveFit.canWithdraw",
    );
  });

  it("sits on the money forecast's width", () => {
    view();
    const bar = screen.getByTestId("reserve-bar");
    expect(bar.style.marginLeft).toBe("8px");
    expect(bar.style.marginRight).toBe("8px");
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
