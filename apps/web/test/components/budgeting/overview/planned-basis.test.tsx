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

  it("draws the CHANGE each limit needs, not spending against it", async () => {
    // Measuring spending against the suggested limit cancelled itself out: the
    // limit is built FROM that same mean spend, so the bar reduced to an
    // arithmetic residue and nine categories in ten drew exactly zero (audit,
    // 260807). The change is the thing the household actually makes.
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
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
    // Today 800, needed 1,200 → raise it by 400.
    expect(chart().getAttribute("data-gap")).toBe("40000");
  });

  it("draws nothing to change when the reserve chart suggests nothing", async () => {
    fitDto.current = {
      rows: [
        {
          category_id: "c1",
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

  it("FUTURE drops the average limit — it is not the baseline any more", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisFuture" }),
    );
    const labels = rows().map((r) => r.label);
    expect(labels).not.toContain("planned.avgLimit");
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
