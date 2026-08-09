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
    onPlanBand,
    tooltipExtra,
  }: {
    data: Record<string, unknown>[];
    categoryKey: string;
    valueKey: string;
    formatValue?: (n: number) => string;
    onPlanBand?: boolean;
    tooltipExtra?: (row: Record<string, unknown>) => unknown;
  }) => (
    <div
      data-testid="fit-chart"
      data-rows={data.map((d) => String(d[categoryKey])).join(",")}
      data-value-key={valueKey}
      data-money={String(typeof formatValue === "function")}
      data-band={String(onPlanBand)}
      data-tooltips={JSON.stringify(data.map((d) => tooltipExtra?.(d) ?? null))}
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

vi.mock("@/components/budgeting/overview/reserve-rebalance", () => ({
  ReserveRebalance: ({
    rows,
    onRebalance,
  }: {
    rows: { categoryId: string; heldCents: number; neededCents: number }[];
    onRebalance: (id: string, cents: number) => Promise<number>;
  }) => (
    <div>
      <span data-testid="rebalance" data-rows={JSON.stringify(rows)} />
      <button
        type="button"
        data-testid="rebalance-run"
        onClick={() => void onRebalance("car", 500000)}
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
          scheduled_cadence: null,
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
          scheduled_cadence: "YEARLY",
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

const view = (onSave = vi.fn(), onRebalance = vi.fn(async () => 0)) => {
  render(
    <ReserveFitView
      data={DTO}
      onSave={onSave}
      onRebalance={onRebalance}
      format={(c: number) => `${Math.round(c / 100)} zl`}
      formatExact={(c: number) => `${(c / 100).toFixed(2)} zl`}
    />,
  );
  return onSave;
};

describe("ReserveFitView", () => {
  // 260805: shortest first. The list is a queue of things to do, and a buffer
  // that cannot cover its next charge outranks one holding money it does not
  // need — the reader should not have to scroll past every surplus to find it.
  it("draws a bar per category, shortest reserve first", () => {
    view();
    // Car is −80%, Newborn 0%, Sport +100% (holds 4,600, needs nothing).
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Car,Newborn,Sport",
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
    // In the chart's own order, which now leads with the shortest reserve.
    expect(dialogProps).toEqual([
      { ledger_id: "tx-ins", category_name: "Car" },
      { ledger_id: "tx-jump", category_name: "Sport" },
    ]);
  });

  // 260805: the two dialogs sit in opposite corners of the chart's header —
  // one-offs on the right where it has always been, rebalance on the left, so
  // neither can shove the centred scale switch off its axis.
  it("puts the rebalance dialog in the chart's left corner", () => {
    view();
    const left = screen.getByTestId("reserve-fit-corner-left");
    expect(within(left).getByTestId("rebalance")).toBeTruthy();
    expect(
      within(screen.getByTestId("reserve-fit-corner")).getByTestId("one-offs"),
    ).toBeTruthy();
  });

  // The %/zł switch that used to hold this row open has gone (260805). Without
  // a real row the box collapsed to nothing and took both buttons' hit areas
  // with it — every rebalance E2E scenario failed on an unclickable trigger.
  it("keeps both corner buttons in a row that stands up on its own", () => {
    view();
    const left = screen.getByTestId("reserve-fit-corner-left");
    const right = screen.getByTestId("reserve-fit-corner");
    const row = left.parentElement!;
    expect(row).toBe(right.parentElement);
    expect(row.className).not.toContain("absolute");
    expect(left.className).not.toContain("absolute");
    expect(right.className).not.toContain("absolute");
  });

  it("hands the rebalance dialog what every reserve holds and needs", () => {
    view();
    const rows = JSON.parse(
      screen.getByTestId("rebalance").getAttribute("data-rows")!,
    );
    // Every category, in the chart's own order.
    expect(rows).toEqual([
      {
        categoryId: "car",
        name: "Car",
        heldCents: 100000,
        neededCents: 500000,
      },
      { categoryId: "new", name: "Newborn", heldCents: 0, neededCents: 0 },
      { categoryId: "sport", name: "Sport", heldCents: 460000, neededCents: 0 },
    ]);
  });

  it("passes a rebalance straight through", async () => {
    const user = userEvent.setup();
    const onRebalance = vi.fn(async () => 500000);
    view(vi.fn(), onRebalance);
    await user.click(screen.getByTestId("rebalance-run"));
    expect(onRebalance).toHaveBeenCalledWith("car", 500000);
  });

  it("passes a save straight through", async () => {
    const user = userEvent.setup();
    const onSave = view();
    await user.click(screen.getByTestId("one-offs-save"));
    expect(onSave).toHaveBeenCalledWith({ add: ["tx-jump"], remove: [] });
  });

  // 260804: the same chart reads in zł when the member asks — "1,900 too much"
  // is what you act on; "240% too much" is only how far off it is.
  // 260805: a green stripe down the middle claimed a tolerance this chart's
  // colours never grant — short is red at any size.
  it("asks for no corridor down the middle", () => {
    view();
    expect(screen.getByTestId("fit-chart").getAttribute("data-band")).toBe(
      "false",
    );
  });

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
    // percent: Car (−80%) leads, Tiny (+300%) sinks to the bottom
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Car,Newborn,Sport,Tiny",
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
    // money: Car is 4,000 short, then the balanced row, then the surpluses with
    // the largest last
    expect(screen.getByTestId("fit-chart").getAttribute("data-rows")).toBe(
      "Car,Newborn,Tiny,Sport",
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
      "reserveFit.aboveTarget",
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

describe("ReserveFitView — what the tooltip tells you to do", () => {
  /** The tooltip rows the chart would draw for `name`. */
  const tooltipFor = (name: string) => {
    const chart = screen.getByTestId("fit-chart");
    const rows = chart.getAttribute("data-rows")!.split(",");
    const all = JSON.parse(chart.getAttribute("data-tooltips")!) as {
      label: string;
      value: string;
      value2?: string;
      conj?: string;
    }[][];
    return all[rows.indexOf(name)]!;
  };

  const withSuggestion = (
    categoryId: string,
    extra: Record<string, unknown>,
  ) => ({
    ...DTO,
    rows: DTO.rows.map((r) =>
      r.category_id === categoryId ? { ...r, ...extra } : r,
    ),
  });

  const renderWith = (data: unknown) =>
    render(
      <ReserveFitView
        data={data as never}
        onSave={vi.fn()}
        onRebalance={vi.fn(async () => 0)}
        format={(c: number) => `${Math.round(c / 100)} zl`}
        formatExact={(c: number) => `${(c / 100).toFixed(2)} zl`}
      />,
    );

  const labels = (name: string) => tooltipFor(name).map((r) => r.label);

  /**
   * The limit belongs to the Future chart, which is where it is decided and
   * where the dialog that writes it lives. Saying it here too was the same
   * decision in two places, and every disagreement between the two - the
   * rounding, the basis, the and/or - came out of keeping both (user, 260809).
   */
  it("says nothing about the limit, even when the row carries a suggestion", () => {
    renderWith(
      withSuggestion("car", {
        suggested_limit_cents: "313000",
        suggested_delta_cents: "-10300",
        suggested_needed_cents: "1731500",
        suggested_direction: "lower",
      }),
    );
    expect(labels("Car")).not.toContain("reserveFit.setLimit");
  });

  it("asks a short reserve for the money it is missing", () => {
    renderWith(DTO);
    // Car holds 1,000 against 5,000 needed.
    const rows = tooltipFor("Car");
    expect(rows[0]!.label).toBe("reserveFit.held");
    expect(rows[0]!.value).toBe("1000 zl");
    expect(rows[1]!.label).toBe("reserveFit.needed");
    expect(rows[1]!.value).toBe("5000 zl");
    const add = rows.find((r) => r.label === "reserveFit.addToReserve")!;
    expect(add.value).toBe("4000 zl");
  });

  it("offers a fat reserve the money it is sitting on", () => {
    renderWith(DTO);
    // Sport holds 4,600 and needs nothing.
    const out = tooltipFor("Sport").find(
      (r) => r.label === "reserveFit.withdraw",
    )!;
    expect(out.value).toBe("4600 zl");
  });

  it("says there is nothing to do when the reserve is already right", () => {
    renderWith(DTO);
    expect(labels("Newborn")).toContain("reserveFit.balanced");
  });

  it("never mentions the runway", () => {
    renderWith(DTO);
    for (const row of tooltipFor("Car")) {
      expect(row.value).not.toMatch(/mo\b/);
      expect(row.label).not.toMatch(/month/i);
    }
  });

  // A difference under a whole unit is not an instruction (260808).
  it("reads a difference of groszy as balanced", () => {
    renderWith(
      withSuggestion("sport", {
        held_cents: "172001",
        needed_cents: "172000",
        gap_cents: "1",
      }),
    );
    expect(labels("Sport")).toContain("reserveFit.balanced");
  });
});
