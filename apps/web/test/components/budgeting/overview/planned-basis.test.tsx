/**
 * planned-basis.test.tsx — which limit "How far off plan" measures against
 * (260805 request).
 *
 * The percent/zł switch went: a percentage of a limit is a step away from the
 * money, and the money is what you act on. What the pill track carries instead
 * is the BASELINE — what the limit averaged across the range, or what it is set
 * to now.
 *
 * 260807: the two readings became PAST and FUTURE. Past is what the range
 * actually ran on — the average limit. Future is the limit the reserve chart
 * says this category will need, worked out from what it holds, what it has
 * spent and what it has scheduled. The switch is always offered now: "what will
 * I need" is a question with an answer whether or not a limit ever moved.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const dto: { current: Record<string, unknown> } = { current: {} };

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/components/common/user-timezone-provider", () => ({
  useUserTimezone: () => "Europe/Warsaw",
}));
vi.mock("@/hooks/use-overview-planned", () => ({
  useOverviewPlanned: () => ({
    data: dto.current,
    isPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/use-budget-data", () => ({
  useCategories: () => ({ data: [{ id: "c1", name: "Food" }] }),
}));
vi.mock("@/hooks/use-member-ui-prefs", () => ({
  useMemberUiPrefs: () => ({ prefs: {}, isLoaded: true, save: () => {} }),
}));
// The section is collapsed until someone opens it; this one is about what it
// draws once open.
vi.mock("@/components/budgeting/bdp-ui-state", () => ({
  usePersistedSectionOpen: () => [true, () => {}],
  useBdpUiStore: () => null,
}));
// The limit dialog reads the current needs/wants split and writes a new one;
// neither belongs to what this file is about, and both pull in a QueryClient.
const summaryDto: { current: unknown } = { current: undefined };
vi.mock("@/hooks/use-spendings-summary", () => ({
  useSpendingsSummary: () => ({ data: summaryDto.current }),
}));
vi.mock("@/hooks/use-set-category-limit", () => ({
  useSetCategoryLimit: () => ({ mutateAsync: async () => {} }),
}));
// What the limit dialog is handed — it opens FROM this chart, so it has to
// propose the figure the bar just drew.
const limitRows: { current: unknown[] } = { current: [] };
vi.mock("@/components/budgeting/overview/limit-rebalance", () => ({
  LimitRebalance: ({ rows }: { rows: unknown[] }) => {
    limitRows.current = rows;
    return <div data-testid="limit-dialog" />;
  },
}));
const fitDto: { current: unknown } = { current: undefined };
vi.mock("@/hooks/use-reserve-fit", () => ({
  useReserveFit: () => ({ data: fitDto.current }),
  useSaveReserveFitExclusions: () => ({ mutate: () => {} }),
}));

// The chart records the baseline it was handed so the test can read it back.
vi.mock("@/components/budgeting/charts/diverging-bar-chart", () => ({
  OverviewDivergingBarChart: ({
    data,
    valueKey,
    tooltipExtra,
  }: {
    data: Record<string, unknown>[];
    valueKey: string;
    tooltipExtra?: (
      row: Record<string, unknown>,
    ) => { label?: string; value?: string; value2?: string }[];
  }) => (
    <div
      data-testid="avg-chart"
      data-value-key={valueKey}
      data-rows={data.map((d) => String(d.name)).join(",")}
      data-planned={String(data[0]?.planned)}
      data-gap={String(data[0]?.gap)}
      data-tooltip={JSON.stringify(
        (data[0] ? (tooltipExtra?.(data[0]) ?? []) : []).map((r) => r.value),
      )}
      data-tooltip-rows={JSON.stringify(
        data[0] ? (tooltipExtra?.(data[0]) ?? []) : [],
      )}
    />
  ),
  varianceColor: () => "#fff",
  plannedGapColor: () => "#fff",
  varianceColorForRange: () => "#fff",
  reserveFitColor: () => "#fff",
  divergingDomain: () => [-100, 100],
  signedMoney: (f: (n: number) => string) => (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${f(Math.abs(n))}`,
}));

const { PlannedSection } = await import(
  "@/components/budgeting/overview/planned-section"
);

/** Food averaged 500 across the range but is set to 800 now; it spent 600. */
const row = {
  category_id: "c1",
  name: "Food",
  planned_avg_cents: "50000",
  real_avg_cents: "60000",
  needs_avg_cents: "0",
  planned_total_cents: "150000",
  real_total_cents: "180000",
  planned_current_cents: "80000",
};

const base = {
  currency: "PLN",
  timeline: [
    { label: "2026-01", planned_cents: "50000", real_cents: "60000" },
  ],
  plannedAvgVsReal: [row],
  scheduledPerMonth: [],
  rangeTotals: {
    planned_cents: "150000",
    spent_cents: "180000",
    within_limit_cents: "150000",
    reserve_used_cents: "0",
    overspent_cents: "30000",
  },
  limits_moved: true,
};

const RANGE = { preset: "last3Months", from: "2025-11-01", to: "2026-01-31" };

beforeEach(() => {
  dto.current = { ...base };
  // The reserve chart's answer is per-test; leaking one test's empty rows into
  // the next filtered every category out of the Future view.
  fitDto.current = {
    rows: [
      {
        category_id: "c1",
        suggested_limit_cents: "120000",
        suggested_delta_cents: "40000",
      },
    ],
  };
});

const chart = () => screen.getByTestId("avg-chart");

describe("How far off plan — which limit it measures against", () => {
  it("plots money, not a percentage", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(chart().getAttribute("data-value-key")).toBe("gap");
    expect(screen.queryByTestId("overview-planned-scale")).toBeNull();
  });

  it("measures against the PAST — the average limit — by default", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    // 600 spent against the 500 it averaged → +100 over.
    expect(chart().getAttribute("data-planned")).toBe("50000");
    expect(chart().getAttribute("data-gap")).toBe("10000");
  });

  it("draws what the category will COST against today's limit", async () => {
    // SUPERSEDES 260807, which drew the reserve walk's suggested change. The
    // walk weighs the reserve and the runway, so its answer was not the
    // difference between the two figures the tooltip listed above it — 2,500
    // and 2,215 with a difference of +1,314 (user, 260808). The bar is now the
    // plain subtraction: what an average month ahead costs, less the limit.
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          projected_monthly_cents: "120000",
          suggested_limit_cents: "120000",
          suggested_delta_cents: "40000",
        },
      ],
    };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    // Costs 1,200 a month against a limit of 800 → 400 short.
    expect(chart().getAttribute("data-gap")).toBe("40000");
  });

  it("draws nothing to change when the limit is exactly what it costs", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          // Costs 800, limit is 800.
          projected_monthly_cents: "80000",
          suggested_limit_cents: null,
          suggested_delta_cents: null,
        },
      ],
    };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-gap")).toBe("0");
  });

  it("leaves out a category the reserve engine never examined", async () => {
    // Reserve-EXCLUDED categories have no fit row at all. Drawing them at zero
    // reads as "this limit is right" for a category nothing was worked out for;
    // before this they silently fell back to a different formula entirely and
    // produced the only large bars on the chart (audit, 260807).
    fitDto.current = { rows: [] };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-rows")).toBe("");
  });

  // "What will I need" has an answer whether or not a limit ever moved, so the
  // switch no longer hides itself.
  it("offers the choice even when no limit moved in the range", () => {
    dto.current = { ...base, limits_moved: false };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(screen.queryByTestId("overview-planned-basis")).toBeTruthy();
  });

  it("shows the baseline it measures against, and not the other one", () => {
    // Both were listed while the switch was average-vs-current; each side now
    // has its own baseline and the other is a figure nobody reads (user,
    // 260807).
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const values = JSON.parse(chart().getAttribute("data-tooltip")!) as string[];
    expect(values.join(" ")).toContain("500");
    expect(values.join(" ")).not.toContain("800");
  });

  // A payload cached before the field existed must not read as a limit of zero.
  it("falls back to the average when a cached payload has no current limit", () => {
    dto.current = {
      ...base,
      plannedAvgVsReal: [{ ...row, planned_current_cents: undefined }],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(chart().getAttribute("data-planned")).toBe("50000");
  });
});

// 260806: the chart's own title has to say which limit it is judging against —
// the switch above it is easy to miss, and "How far off plan" reads the same
// whichever way it is set.
describe("How far off plan — saying what you are looking at", () => {
  const title = () => screen.getByTestId("overview-planned-title").textContent;

  it("names the average limit while that is the baseline", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(title()).toBe("planned.byCategoryAverage");
  });

  it("names the limit ahead once switched to the future", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(title()).toBe("planned.byCategoryFuture");
  });

  it("still names the baseline when no limit moved", () => {
    dto.current = { ...base, limits_moved: false };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(title()).toBe("planned.byCategoryAverage");
  });
});

describe("How far off plan — the tooltip", () => {
  const rows = () =>
    JSON.parse(
      screen.getByTestId("avg-chart").getAttribute("data-tooltip-rows")!,
    ) as { label?: string; value?: string; value2?: string }[];

  it("heads the first column with the month, not an abbreviation", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows()[0]!.value).toBe("planned.monthColumn");
    expect(rows()[0]!.value2).toBe("planned.totalColumn");
  });

  it("no longer lists today's limit at all", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().some((r) => r.label === "planned.currentLimit")).toBe(false);
  });

  it("calls the money that was spent Spent", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().some((r) => r.label === "planned.spent")).toBe(true);
    expect(rows().some((r) => r.label === "planned.real")).toBe(false);
  });

  it("calls the difference just Difference, on either side", async () => {
    // The baseline is named a line above; repeating it here said nothing.
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().at(-1)!.label).toBe("planned.difference");

    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(rows().at(-1)!.label).toBe("planned.difference");
  });
});

describe("How far off plan — each basis shows only its own baseline", () => {
  const rows = () =>
    JSON.parse(
      screen.getByTestId("avg-chart").getAttribute("data-tooltip-rows")!,
    ) as { label?: string; value?: string; value2?: string }[];

  it("PAST names the average limit and drops today's", () => {
    // The bar is measured against the average, so today's limit is a figure
    // nobody is reading — it was only ever there to justify the switch when the
    // switch was average-vs-current (user, 260807).
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const labels = rows().map((r) => r.label);
    expect(labels).toContain("planned.avgLimit");
    expect(labels).not.toContain("planned.currentLimit");
  });

  it("PAST calls the difference just that", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().at(-1)!.label).toBe("planned.difference");
  });

  it("FUTURE drops the average limit but keeps today's", async () => {
    // The average is history; the future reading is about today's limit and the
    // change the bar draws. Dropping every limit left the reader with a change
    // and nothing to relate it to (user, 260807).
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const labels = rows().map((r) => r.label);
    expect(labels).not.toContain("planned.avgLimit");
    expect(labels).toContain("planned.currentLimit");
  });

  // The three figures must be one piece of arithmetic (user, 260808). The bar
  // drew the reserve walk's suggested CHANGE while the rows above it listed
  // today's limit and the spend — 2,500 and 2,215 with a difference of +1,314,
  // which is not the difference between anything shown.
  it("FUTURE reads the spend as what the category will actually cost", async () => {
    const user = userEvent.setup();
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          name: "Car",
          held_cents: "0",
          needed_cents: "0",
          gap_cents: "0",
          // 1,064 of habit and schedule together, against a limit of 800.
          projected_monthly_cents: "106400",
          suggested_limit_cents: "500000",
          suggested_delta_cents: "420000",
          large_transactions: [],
        },
      ],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const r = rows();
    expect(
      r.find((x) => x.label === "planned.expectedSpend")!.value,
    ).toContain("1,064");
    // …and the difference is that against today's limit, nothing else.
    expect(r.at(-1)!.label).toBe("planned.difference");
    expect(r.at(-1)!.value).toContain("264");
  });

  it("FUTURE draws the bar from the same subtraction", async () => {
    const user = userEvent.setup();
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          name: "Car",
          held_cents: "0",
          needed_cents: "0",
          gap_cents: "0",
          projected_monthly_cents: "106400",
          suggested_limit_cents: "500000",
          suggested_delta_cents: "420000",
          large_transactions: [],
        },
      ],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    // 1,064 − 800 = 264, NOT the walk's 4,200.
    expect(
      screen.getByTestId("avg-chart").getAttribute("data-gap"),
    ).toBe("26400");
  });

  it("hands the limit dialog the very figure the bar drew", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          name: "Car",
          held_cents: "0",
          needed_cents: "0",
          gap_cents: "0",
          projected_monthly_cents: "106400",
          // The walk's own answer is deliberately different here: it weighs the
          // reserve and the runway. The dialog must follow the BAR (user,
          // 260808), or the two disagree about the same row again.
          suggested_limit_cents: "500000",
          suggested_delta_cents: "420000",
          large_transactions: [],
        },
      ],
    };
    // The dialog also needs to know how the limit is split today.
    summaryDto.current = {
      categories: [
        {
          categoryId: "c1",
          plannedCents: "80000",
          needsCents: "80000",
          wantsCents: "0",
          cushionCents: "0",
        },
      ],
    };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(
      (limitRows.current[0] as { suggestedLimitCents?: number } | undefined)
        ?.suggestedLimitCents,
    ).toBe(106400);
  });

  it("FUTURE does not repeat the limit it will need beside the spend", async () => {
    // A category with nothing scheduled needs exactly what it keeps spending,
    // so the two rows printed the same figure twice (user screenshot, 260808).
    // Today's limit plus the difference is the one to move to.
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const r = rows();
    expect(r.map((x) => x.label)).not.toContain("planned.futureLimit");
    expect(r.find((x) => x.label === "planned.currentLimit")!.value).toContain(
      "800",
    );
    expect(r.find((x) => x.label === "planned.expectedSpend")).toBeDefined();
    expect(r.at(-1)!.label).toBe("planned.difference");
  });

  it("FUTURE carries no range total — none of these accumulated", async () => {
    // A limit and an expected monthly spend are RATES. The total column belongs
    // to the past reading, where the money actually piled up (user, 260807).
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    for (const r of rows()) expect(r.value2).toBeUndefined();
  });

  it("FUTURE's difference is the same number the bar draws", async () => {
    // One subtraction, drawn once and written once.
    fitDto.current = {
      rows: [{ category_id: "c1", projected_monthly_cents: "120000" }],
    };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-gap")).toBe("40000");
    expect(rows().at(-1)!.value).toContain("400");
  });

  it("FUTURE calls the spending what it is — what you are expected to spend", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const labels = rows().map((r) => r.label);
    expect(labels).toContain("planned.expectedSpend");
    expect(labels).not.toContain("planned.spent");
  });
});
