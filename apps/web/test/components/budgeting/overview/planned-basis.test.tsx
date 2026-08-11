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
/** The member's stored picks — the section's ONE category filter. */
const prefsDto: { current: Record<string, unknown> } = { current: {} };
/** Every (key, value) the section has saved this test. */
const savedPrefs: [string, unknown][] = [];
const catsDto: { current: { id: string; name: string }[] } = {
  current: [{ id: "c1", name: "Food" }],
};

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
  useCategories: () => ({ data: catsDto.current }),
}));
vi.mock("@/hooks/use-member-ui-prefs", () => ({
  useMemberUiPrefs: () => ({
    prefs: prefsDto.current,
    isLoaded: true,
    save: (k: string, v: unknown) => {
      savedPrefs.push([k, v]);
    },
  }),
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
// Reset between tests: the dialog only renders when there is something to
// show, so a stale capture from the previous test reads as a pass for the
// very bug this file is meant to catch.
beforeEach(() => {
  limitRows.current = [];
});
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

// The yearly scheduled chart; records the rows + series colour it was handed.
vi.mock("@/components/budgeting/charts/bar-chart", () => ({
  OverviewBarChart: ({
    data,
    xKey,
    series,
  }: {
    data: Record<string, unknown>[];
    xKey: string;
    series: { key: string; label: string; color?: string }[];
  }) => (
    <div
      data-testid="scheduled-year-chart"
      data-x-key={xKey}
      data-rows={data.map((d) => String(d[xKey])).join(",")}
      data-values={data.map((d) => String(d.yearly)).join(",")}
      data-color={series[0]?.color ?? ""}
    />
  ),
}));

const { PlannedSection } =
  await import("@/components/budgeting/overview/planned-section");

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
  timeline: [{ label: "2026-01", planned_cents: "50000", real_cents: "60000" }],
  plannedAvgVsReal: [row],
  scheduledPerMonth: [],
  scheduledPerYear: [],
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
  savedPrefs.length = 0;
  prefsDto.current = {};
  catsDto.current = [{ id: "c1", name: "Food" }];
  dto.current = { ...base };
  // The reserve chart's answer is per-test; leaking one test's empty rows into
  // the next filtered every category out of the Future view.
  fitDto.current = {
    rows: [
      {
        category_id: "c1",
        // A real fit row always carries the projection — it is what the Future
        // bar is drawn from. Without it the row now reads as "nothing worked
        // out for this category", which is a different fixture entirely.
        projected_monthly_cents: "60000",
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

  // Limits are set in whole units and the dialog proposes whole ones, so what
  // survives a rebalance is a few groszy of rounding. Those groszy were still
  // drawn: with nothing bigger on the chart the axis zoomed into them and every
  // settled category came back as a full-length "−1 zł" bar (user, 260809,
  // after rebalancing every limit in a budget). Under a unit is not a change.
  it("draws a rebalanced limit as settled, not as a full-length bar", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          // Limit 800.00, cost 799.56 — the rounding the rebalance left behind.
          projected_monthly_cents: "79956",
          suggested_limit_cents: "80000",
          suggested_delta_cents: "44",
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

  it("still draws a change of a whole unit or more", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          projected_monthly_cents: "79000",
          suggested_limit_cents: "79000",
          suggested_delta_cents: "-1000",
        },
      ],
    };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-gap")).toBe("-1000");
  });

  // SUPERSEDES 260807's "leave it out". A reserve-EXCLUDED category has no fit
  // row, and hiding it showed 8 of 10 categories with no explanation (user,
  // 260810). It draws at zero, which is the truth — nothing about its limit
  // needs to change — and the meter above counts it the same way. What 260807
  // was actually protecting against was the FALLBACK formula that gave those
  // rows the largest bars on the chart; that is gone, and the guard with it.
  it("draws a category the reserve engine never examined, at zero", async () => {
    fitDto.current = { rows: [] };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-rows")).toBe("Food");
    expect(chart().getAttribute("data-gap")).toBe("0");
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
    const values = JSON.parse(
      chart().getAttribute("data-tooltip")!,
    ) as string[];
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

  it("calls the difference just Difference on the PAST side", async () => {
    // The baseline is named a line above; repeating it here said nothing. The
    // FUTURE side ends on the decision instead (user, 260809) — see the CTA
    // suite at the foot of this file.
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().at(-1)!.label).toBe("planned.difference");

    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    // 600 of expected spend against an 800 limit → it can come DOWN.
    expect(rows().at(-1)!.label).toBe("planned.decreaseLimitBy");
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
    expect(r.find((x) => x.label === "planned.expectedSpend")!.value).toContain(
      "1,064",
    );
    // …and the row ends on the decision that follows from it: today's 800 plus
    // the 264 it is short (user, 260809).
    expect(r.at(-1)!.label).toBe("planned.increaseLimitBy");
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
    expect(screen.getByTestId("avg-chart").getAttribute("data-gap")).toBe(
      "26400",
    );
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

  it("FUTURE gets the same meter the reserve chart has", async () => {
    // One line, read at a glance: what the limits add up to against what they
    // should (user, 260809). Same component, so the colours mean the same
    // thing — amber past the outline is slack, red short of it is missing.
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          name: "Car",
          held_cents: "0",
          needed_cents: "0",
          gap_cents: "0",
          projected_monthly_cents: "106400",
          large_transactions: [],
        },
      ],
    };
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
    expect(screen.queryByTestId("limit-level-bar")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const meter = screen.getByTestId("limit-level-bar");
    // 800 of limit against the 1,064 it should be.
    expect(meter.textContent).toContain("800");
    expect(meter.textContent).toContain("1,064");
    // …and it belongs UNDER the heading it is about (user, 260809).
    const title = screen.getByTestId("overview-planned-title");
    expect(
      title.compareDocumentPosition(meter) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps a category whose limit is already right in the dialog", async () => {
    // Two faces of one bug (user, 260809): a settled category never reached
    // the dialog at all, and a category REBALANCED inside it became settled
    // and vanished from under the finger that had just acted on it. The
    // reserve dialog keeps such rows and greys the button; this one dropped
    // them.
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          name: "Car",
          held_cents: "0",
          needed_cents: "0",
          gap_cents: "0",
          // Exactly today's limit — nothing to change.
          projected_monthly_cents: "80000",
          large_transactions: [],
        },
      ],
    };
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
    expect(limitRows.current).toHaveLength(1);
    expect(
      (limitRows.current[0] as { categoryId?: string } | undefined)?.categoryId,
    ).toBe("c1");
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
    expect(r.at(-1)!.label).toBe("planned.decreaseLimitBy");
  });

  it("FUTURE carries no range total — none of these accumulated", async () => {
    // A limit and an expected monthly spend are RATES. The total column belongs
    // to the past reading, where the money actually piled up (user, 260807).
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    // …the DECISION at the foot carries the change it makes, which is not a
    // total either — every other row stands alone.
    for (const r of rows())
      if (r.label !== "reserveFit.setLimit") expect(r.value2).toBeUndefined();
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
    // The bar's subtraction, now written as the change it asks for.
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

/**
 * The Future reading ends in a decision, so the last line IS the decision
 * (user, 260809). "Difference −11% · −331 zł" stated it as arithmetic and left
 * the reader to do the addition themselves.
 */
describe("How far off plan — the Future tooltip ends on the limit", () => {
  const rows = () =>
    JSON.parse(chart().getAttribute("data-tooltip-rows")!) as {
      label: string;
      value: string;
      value2?: string;
      cta?: boolean;
    }[];

  const openFuture = async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
  };

  it("says which way to move the limit, and by how much", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          // Costs 1,200 a month against a limit of 800.
          projected_monthly_cents: "120000",
          suggested_limit_cents: "120000",
          suggested_delta_cents: "40000",
        },
      ],
    };
    await openFuture();
    const last = rows()[rows().length - 1]!;
    // Costs 1,200 against a limit of 800 → the limit has to go UP by 400, and
    // a limit that has to rise is a shortfall: red (user, 260810).
    expect(last.label).toBe("planned.increaseLimitBy");
    expect(last.cta).toBe(true);
    expect(last.value).toContain("400");
    expect(last.value2).toBeUndefined();
    expect(last.ctaColor).toBe("var(--trading-down)");
    expect(rows().map((r) => r.label)).not.toContain("planned.difference");
  });

  it("calls a limit that can come DOWN a decrease, in the surplus colour", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          // Costs 500 against a limit of 800 → 300 of slack.
          projected_monthly_cents: "50000",
          suggested_limit_cents: "50000",
          suggested_delta_cents: "-30000",
        },
      ],
    };
    await openFuture();
    const last = rows()[rows().length - 1]!;
    expect(last.label).toBe("planned.decreaseLimitBy");
    expect(last.value).toContain("300");
    expect(last.ctaColor).toBe("var(--primary)");
  });

  it("asks for nothing when the limit is already right", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          projected_monthly_cents: "80000",
          suggested_limit_cents: "80000",
          suggested_delta_cents: "0",
        },
      ],
    };
    await openFuture();
    const labels = rows().map((r) => r.label);
    expect(labels).not.toContain("planned.increaseLimitBy");
    expect(labels).not.toContain("planned.decreaseLimitBy");
  });

  it("says the change in whole units, as the dialog will write it", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
          projected_monthly_cents: "119901",
          suggested_limit_cents: "119901",
          suggested_delta_cents: "39901",
        },
      ],
    };
    await openFuture();
    const last = rows()[rows().length - 1]!;
    // 1,199.01 of cost against a limit of 800 → 399.01 up, said in whole zł.
    expect(last.value).toContain("399");
  });

  it("leaves the PAST reading measuring the difference", async () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const labels = rows().map((r) => r.label);
    expect(labels).toContain("planned.difference");
    expect(labels).not.toContain("planned.increaseLimitBy");
  });
});

/**
 * The line above the bars has to agree with them (user, 260810).
 *
 * Every bar drew 0 and the meter still said "3 zł more than needed": the bars
 * snap a sub-złoty difference to zero — a limit is decided in whole złoty — but
 * the totals were summing the raw groszy, and eight categories of rounding came
 * to three złoty of disagreement.
 */
describe("How far off plan — the meter counts what the bars draw", () => {
  const meterText = async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    return screen.getByTestId("limit-level-bar").textContent ?? "";
  };

  /** Eight categories, each a few groszy under its limit — a rebalanced budget. */
  const eightSettled = () => {
    const cats = Array.from({ length: 8 }, (_, i) => `c${i + 1}`);
    dto.current = {
      ...base,
      plannedAvgVsReal: cats.map((id) => ({
        ...row,
        category_id: id,
        name: `Cat ${id}`,
        planned_current_cents: "90100",
      })),
    };
    summaryDto.current = {
      categories: cats.map((id) => ({
        categoryId: id,
        plannedCents: "90100",
        needsCents: "90100",
        wantsCents: "0",
        cushionCents: "0",
      })),
    };
    fitDto.current = {
      rows: cats.map((id) => ({
        category_id: id,
        // 901.00 of limit against 900.60 of cost: 40 groszy, eight times over.
        projected_monthly_cents: "90060",
        suggested_limit_cents: "90060",
        suggested_delta_cents: "-40",
      })),
    };
  };

  it("reads level when every bar reads zero", async () => {
    eightSettled();
    const text = await meterText();
    // 8 × 901 = 7,208 on both sides — not 7,208 against 7,205.
    expect(text).toContain("7,208");
    expect(text).not.toContain("7,205");
  });

  it("still counts a difference of a whole unit or more", async () => {
    eightSettled();
    fitDto.current = {
      rows: (fitDto.current as { rows: Record<string, unknown>[] }).rows.map(
        (r, i) =>
          i === 0
            ? {
                ...r,
                projected_monthly_cents: "80100",
                suggested_delta_cents: "-10000",
              }
            : r,
      ),
    };
    const text = await meterText();
    // One category 100 zł under: 7,208 of limit against 7,108 needed.
    expect(text).toContain("7,208");
    expect(text).toContain("7,108");
  });
});

/**
 * The meter counts EVERY limit (user, 260810).
 *
 * Counting only the categories the reserve engine tracks made the line
 * disagree with the timeline above it by exactly the excluded ones — 7,208
 * here against 8,708 there, the 1,500 of Housing and Subscriptions.
 */
describe("How far off plan — the meter counts every category", () => {
  it("includes a category the walk has no opinion about, on both sides", async () => {
    dto.current = {
      ...base,
      plannedAvgVsReal: [
        {
          ...row,
          category_id: "c1",
          name: "Food",
          planned_current_cents: "80000",
        },
        {
          ...row,
          category_id: "c2",
          name: "Housing",
          planned_current_cents: "100000",
        },
      ],
    };
    summaryDto.current = {
      categories: [
        {
          categoryId: "c1",
          plannedCents: "80000",
          needsCents: "80000",
          wantsCents: "0",
          cushionCents: "0",
        },
        {
          categoryId: "c2",
          plannedCents: "100000",
          needsCents: "100000",
          wantsCents: "0",
          cushionCents: "0",
        },
      ],
    };
    // Only Food is tracked; Housing is reserve-excluded and has no fit row.
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
    const meter = screen.getByTestId("limit-level-bar").textContent ?? "";
    // Limits 800 + 1,000 = 1,800; should be 1,200 + 1,000 = 2,200.
    expect(meter).toContain("1,800");
    expect(meter).toContain("2,200");
  });
});

/**
 * ONE filter for the section (user, 260810). It sits above the timeline and
 * governs everything under it: the per-category bars, the meter and the pie.
 * The pie's private picker is gone — two pickers disagreed about what "this
 * budget" meant.
 */
describe("Spendings plan — one category filter for the section", () => {
  const twoCategories = () => {
    catsDto.current = [
      { id: "c1", name: "Food" },
      { id: "c2", name: "Car" },
    ];
    dto.current = {
      ...base,
      plannedAvgVsReal: [
        {
          ...row,
          category_id: "c1",
          name: "Food",
          planned_current_cents: "80000",
        },
        {
          ...row,
          category_id: "c2",
          name: "Car",
          planned_current_cents: "50000",
        },
      ],
    };
    summaryDto.current = {
      categories: [
        {
          categoryId: "c1",
          plannedCents: "80000",
          needsCents: "80000",
          wantsCents: "0",
          cushionCents: "0",
        },
        {
          categoryId: "c2",
          plannedCents: "50000",
          needsCents: "50000",
          wantsCents: "0",
          cushionCents: "0",
        },
      ],
    };
    fitDto.current = { rows: [] };
  };

  it("offers exactly one picker", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(screen.getAllByTestId("overview-planned-category")).toHaveLength(1);
  });

  it("puts it above the timeline it used to hide under", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const picker = screen.getByTestId("overview-planned-category");
    const title = screen.getByText("planned.timelineTitle");
    expect(
      picker.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("narrows the per-category bars", async () => {
    twoCategories();
    prefsDto.current = { "planned-categories": ["c1"] };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    // The API hands back BOTH rows whatever the filter; the picking is here.
    expect(chart().getAttribute("data-rows")).toBe("Food");
  });

  it("narrows the meter with them", async () => {
    twoCategories();
    prefsDto.current = { "planned-categories": ["c1"] };
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const meter = screen.getByTestId("limit-level-bar").textContent ?? "";
    expect(meter).toContain("800");
    expect(meter).not.toContain("1,300");
  });

  it("counts everything when nothing is picked", async () => {
    twoCategories();
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(chart().getAttribute("data-rows")).toBe("Food,Car");
    expect(screen.getByTestId("limit-level-bar").textContent).toContain(
      "1,300",
    );
  });
});

/**
 * PAST or FUTURE is remembered per member, per budget — like the time range
 * (user, 260810). The in-memory store only survives a pill hop; this survives a
 * new device.
 */
describe("Spendings plan — the basis is remembered", () => {
  it("opens on the stored choice", () => {
    prefsDto.current = { "planned-basis": ["future"] };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    // The Future reading names the limit; the Past one measures the difference.
    const labels = JSON.parse(chart().getAttribute("data-tooltip-rows")!) as {
      label: string;
    }[];
    expect(labels.map((r) => r.label)).not.toContain("planned.difference");
  });

  it("opens on Past when nothing is stored", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const labels = JSON.parse(chart().getAttribute("data-tooltip-rows")!) as {
      label: string;
    }[];
    expect(labels.map((r) => r.label)).toContain("planned.difference");
  });

  it("still understands the name the FUTURE reading used to have", () => {
    // Stored before 260807, when it was called "current".
    prefsDto.current = { "planned-basis": ["current"] };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const labels = JSON.parse(chart().getAttribute("data-tooltip-rows")!) as {
      label: string;
    }[];
    expect(labels.map((r) => r.label)).not.toContain("planned.difference");
  });

  it("writes the choice down when it is made", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    expect(savedPrefs).toContainEqual(["planned-basis", ["future"]]);
  });
});

/**
 * A year of standing commitments, by category (user, 260811). The "by month"
 * chart answers what is coming and when; this one answers where the money goes
 * over a whole year, so a 40/month subscription and a 500/year renewal can be
 * compared. Deliberately NOT category-filtered.
 */
describe("scheduled payments per year, by category", () => {
  const yearChart = () => screen.queryByTestId("scheduled-year-chart");

  it("draws a grey bar per category, biggest first, straight from the payload", () => {
    dto.current = {
      ...base,
      scheduledPerYear: [
        { category_id: "c1", name: "Housing", amount_cents: "1200000" },
        { category_id: "c2", name: "Subscriptions", amount_cents: "98000" },
      ],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(yearChart()!.getAttribute("data-rows")).toBe(
      "Housing,Subscriptions",
    );
    expect(yearChart()!.getAttribute("data-values")).toBe("1200000,98000");
    expect(yearChart()!.getAttribute("data-color")).toBe(
      "var(--muted-foreground)",
    );
  });

  it("names the bucket for payments with no category", () => {
    dto.current = {
      ...base,
      scheduledPerYear: [
        { category_id: null, name: null, amount_cents: "36000" },
      ],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(yearChart()!.getAttribute("data-rows")).toBe(
      "planned.scheduledNoCategory",
    );
  });

  it("ignores the category filter — every category is drawn", () => {
    // Only c1 is picked for the rest of the section; the yearly chart still
    // shows both, because "where do the commitments go" needs all of them.
    prefsDto.current = { "planned-categories": ["c1"] };
    dto.current = {
      ...base,
      scheduledPerYear: [
        { category_id: "c1", name: "Housing", amount_cents: "1200000" },
        { category_id: "c2", name: "Subscriptions", amount_cents: "98000" },
      ],
    };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(yearChart()!.getAttribute("data-rows")).toBe(
      "Housing,Subscriptions",
    );
  });

  it("draws nothing when there is nothing standing", () => {
    dto.current = { ...base, scheduledPerYear: [] };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(yearChart()).toBeNull();
  });

  it("survives a payload cached before the chart existed", () => {
    const withoutIt: Record<string, unknown> = {
      ...(base as never as Record<string, unknown>),
    };
    delete withoutIt.scheduledPerYear;
    dto.current = withoutIt;
    expect(() =>
      render(<PlannedSection budgetId="b1" range={RANGE as never} />),
    ).not.toThrow();
    expect(yearChart()).toBeNull();
  });
});
