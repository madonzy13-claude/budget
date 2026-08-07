/**
 * planned-basis.test.tsx — which limit "How far off plan" measures against
 * (260805 request).
 *
 * The percent/zł switch went: a percentage of a limit is a step away from the
 * money, and the money is what you act on. What the pill track carries instead
 * is the BASELINE — what the limit averaged across the range, or what it is set
 * to now.
 *
 * The two only differ when a limit MOVED inside the range, and that is exactly
 * when the switch appears. With a steady limit it would be two names for one
 * number.
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
vi.mock("@/hooks/use-reserve-fit", () => ({
  useReserveFit: () => ({ data: undefined }),
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
      data-planned={String(data[0]?.planned)}
      data-gap={String(data[0]?.gap)}
      data-tooltip={JSON.stringify(
        (tooltipExtra?.(data[0] ?? {}) ?? []).map((r) => r.value),
      )}
      data-tooltip-rows={JSON.stringify(tooltipExtra?.(data[0] ?? {}) ?? [])}
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
  recurringPerMonth: [],
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
});

const chart = () => screen.getByTestId("avg-chart");

describe("How far off plan — which limit it measures against", () => {
  it("plots money, not a percentage", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(chart().getAttribute("data-value-key")).toBe("gap");
    expect(screen.queryByTestId("overview-planned-scale")).toBeNull();
  });

  it("measures against the average limit by default", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    // 600 spent against the 500 it averaged → +100 over.
    expect(chart().getAttribute("data-planned")).toBe("50000");
    expect(chart().getAttribute("data-gap")).toBe("10000");
  });

  it("measures against the current limit once switched", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(screen.getByRole("button", { name: "planned.basisCurrent" }));
    // …and against the 800 it is set to now, the same spending is 200 UNDER.
    expect(chart().getAttribute("data-planned")).toBe("80000");
    expect(chart().getAttribute("data-gap")).toBe("-20000");
  });

  // With a steady limit the two readings are the same number, so offering the
  // choice would be noise.
  it("offers no choice when no limit moved in the range", () => {
    dto.current = { ...base, limits_moved: false };
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(screen.queryByTestId("overview-planned-basis")).toBeNull();
  });

  it("shows BOTH limits in the tooltip, whichever is being measured against", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const values = JSON.parse(chart().getAttribute("data-tooltip")!) as string[];
    expect(values.join(" ")).toContain("500");
    expect(values.join(" ")).toContain("800");
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

  it("names today's limit once switched to it", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    await user.click(
      screen.getByRole("button", { name: "planned.basisCurrent" }),
    );
    expect(title()).toBe("planned.byCategoryCurrent");
  });

  // With no switch on offer the average IS the plan, so the title still names it
  // rather than going vague.
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

  // The current limit is a rate, not something that accumulated over the range:
  // there is no total to put beside it, and a repeat of the average's total
  // would be a lie. A dash says "not applicable" without leaving a hole.
  it("gives the current limit a dash where its total would be", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    const current = rows().find((r) => r.label === "planned.currentLimit")!;
    expect(current.value).toContain("800");
    expect(current.value2).toBe("—");
  });

  it("calls the money that was spent Spent", () => {
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().some((r) => r.label === "planned.spent")).toBe(true);
    expect(rows().some((r) => r.label === "planned.real")).toBe(false);
  });

  it("says which limit the difference is measured against", async () => {
    const user = userEvent.setup();
    render(<PlannedSection budgetId="b1" range={RANGE as never} />);
    expect(rows().at(-1)!.label).toBe("planned.differenceVsAverage");

    await user.click(
      screen.getByRole("button", { name: "planned.basisCurrent" }),
    );
    expect(rows().at(-1)!.label).toBe("planned.differenceVsCurrent");
  });
});
