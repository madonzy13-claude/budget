"use client";
/**
 * planned-section.tsx — Overview "Planned" section (11-09, SC4).
 *
 * Collapsible; lazy-fetches /overview/planned only when open. Renders the
 * Planned-vs-Real timeline (line: real solid yellow, planned dashed neutral), the
 * planned-avg-vs-real bar (Y=category) and the planned-share pie. Under the
 * timeline's picker sit the range's figures — the spend broken into limit /
 * reserve / overspend, and spent against planned (260803). The
 * recurring charts moved out to their own section. A category selector
 * (default = All categories) re-scopes the timeline. Charts via the 11-02 wrappers
 * only; string cents → Number here (recharts needs Numbers).
 */
import { useMemo, useState } from "react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import {
  CategoryMultiSelect,
  type PickableCategory,
} from "./category-multi-select";
import {
  effectiveCategoryIds,
  PLANNED_PIE_PREF,
  PLANNED_TIMELINE_PREF,
  prunePlannedCategories,
} from "@/lib/planned-category-filter";
import { useMemberUiPrefs } from "@/hooks/use-member-ui-prefs";
import { useTranslations, useLocale } from "next-intl";
import { OverviewSection } from "./overview-section";
import {
  usePersistedSectionOpen,
  useBdpUiStore,
} from "@/components/budgeting/bdp-ui-state";
import { CHART_THEME } from "@/components/budgeting/charts/chart-theme";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import {
  OverviewDivergingBarChart,
  varianceColorForRange,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import { hexForColorKey } from "@/lib/category-colors";
import { assignSliceColors } from "@/lib/slice-colors";
import { planRing, planSlices, type PlanRingKey } from "@/lib/plan-ring";
import { Customized } from "recharts";
import { PlanZoneLine } from "./plan-zone-line";
import { hasWantsSplit } from "@/lib/wants-split";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import {
  useReserveFit,
  useSaveReserveFitExclusions,
} from "@/hooks/use-reserve-fit";
import {
  ReserveFitOneOffs,
  type OneOffCandidate,
} from "./reserve-fit-one-offs";
import { signedMoney } from "./reserve-fit-view";
import { ChartNeedsCompletedMonth } from "./chart-needs-completed-month";
import { rangeHasCompletedMonth } from "@/lib/range-completed-month";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToRounded } from "@/lib/cents-format";
import { chartCompactCents, withDayStartBaseline } from "@/lib/chart-format";
import { formatChartDate, formatChartTimestamp } from "@/lib/chart-date-format";
import { labelToTimestamp } from "@/lib/chart-timestamp";
import { insertMonthResets } from "@/lib/month-reset";
import { appendTodayTail } from "@/lib/today-tail";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { todayInTz, type OverviewRange } from "@/lib/overview-range";
import { trimLeadingEmpty } from "@/lib/trim-leading-empty";
import { PlannedTotals } from "./planned-totals";

const NEUTRAL = "var(--muted-foreground)";

/** Actual-line colour per plan band (260801): green inside needs, yellow in the
 *  wants band, red past the whole plan. Shared by the stroke gradient + tooltip. */
const ZONE_COLOR = {
  under: "var(--trading-up)",
  between: "var(--primary)",
  over: "var(--trading-down)",
} as const;

/** Epoch ms → the same "13 Feb 2026" the rest of the charts use. */
function formatTs(ts: number, locale: string): string {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return formatChartDate(iso, locale);
}

function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-center text-[var(--muted-foreground)]">
      {children}
    </p>
  );
}

/** Planned-spend donut: each category's average planned amount over the selected
 * range (the same planned_avg_cents the over/under bar uses as its reference).
 * Colors follow the category's persisted colorKey where it is still free; the
 * rest take the next unused colour, so no two slices are ever the same. */
function PlannedByCategoryPie({
  rows,
  categories,
  title,
  allLabel,
  formatValue,
  maskValue = false,
  picked,
  onPick,
  pickable,
  isInvestment,
  ringLabel,
}: {
  rows: {
    category_id: string;
    name: string;
    planned_avg_cents: string;
    needs_avg_cents?: string;
  }[];
  categories: { name: string; colorKey?: unknown }[];
  /** Which category is THE investment one — it is neither a need nor a want. */
  isInvestment: (categoryId: string) => boolean;
  ringLabel: (key: PlanRingKey) => string;
  title: string;
  allLabel: string;
  formatValue: (n: number) => string;
  maskValue?: boolean;
  /** Categories to show; empty = all of them. */
  picked: string[];
  onPick: (ids: string[]) => void;
  pickable: PickableCategory[];
}) {
  // The pie has its own picker (260802 request): a slice the member drops here
  // stays on the timeline, and the other way round.
  const shown = picked.length ? new Set(picked) : null;
  const inView = rows.filter((c) => !shown || shown.has(c.category_id));
  // The outer ring: needs / wants summed across the SAME categories the slices
  // show, so narrowing the picker narrows them. The INVESTING arc is different —
  // it comes from every row in range, so dropping the investment category from
  // the picker hides its slice without erasing the plan's investing share
  // (user, 260803).
  const ring = planRing(inView, isInvestment, rows).map((a) => ({
    name: ringLabel(a.key),
    value: a.value,
    key: a.key,
  }));
  const RING_COLOR: Record<PlanRingKey, string> = {
    needs: "var(--chart-plan-needs)",
    wants: "var(--chart-plan-wants)",
    investments: "var(--chart-plan-invest)",
  };
  // Investments is a slice like any other category — and an arc outside.
  const data = planSlices(inView).map((c) => ({
    name: c.name,
    planned: Number(c.planned_avg_cents),
  }));
  if (data.length === 0) return null;

  // One colour per slice. Cycling the eight brand colours by index wrapped on a
  // budget with more than eight categories, and two slices came out identical
  // (user screenshot: Investments took Kids' green).
  const colorByName = assignSliceColors(
    data.map((r) => r.name),
    (name) =>
      hexForColorKey(
        (categories.find((c) => c.name === name)?.colorKey as string | null) ??
          null,
      ),
  );

  return (
    <div className="flex flex-col gap-2">
      <ChartLabel>{title}</ChartLabel>
      <CategoryMultiSelect
        categories={pickable}
        selected={picked}
        onCommit={onPick}
      />
      <OverviewPieChart
        data={data}
        nameKey="name"
        valueKey="planned"
        colorFor={(name) => colorByName.get(name) ?? NEUTRAL}
        formatValue={formatValue}
        allLabel={allLabel}
        maskValue={maskValue}
        outerRing={{
          data: ring,
          colorFor: (name) =>
            RING_COLOR[
              (ring.find((a) => a.name === name)?.key ?? "wants") as PlanRingKey
            ],
        }}
      />
    </div>
  );
}

export function PlannedSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, toggleOpen] = usePersistedSectionOpen("planned");
  // Persist the selected category across pill navigation (the carousel unmounts
  // this pane, so a plain useState would reset to "All categories" on return).
  const store = useBdpUiStore();
  // The picked categories are this MEMBER's own view of the budget, kept on
  // their member row rather than in one browser: opening the same budget on a
  // desktop used to show "All categories" again (user report, 260802). The pie
  // remembers its own set, so dropping a slice there leaves the timeline alone.
  const {
    prefs,
    isLoaded: prefsLoaded,
    save: savePrefs,
  } = useMemberUiPrefs(budgetId);
  const categoryIds = prefs[PLANNED_TIMELINE_PREF] ?? [];
  const pieCategoryIds = prefs[PLANNED_PIE_PREF] ?? [];
  const setCategoryIds = (ids: string[]) =>
    void savePrefs(PLANNED_TIMELINE_PREF, ids);
  const setPieCategoryIds = (ids: string[]) =>
    void savePrefs(PLANNED_PIE_PREF, ids);

  // Counting the month still in progress is opt-IN: half a month of spend drags
  // an average down against months that ran their full course (260802 request).
  // Only offered when the range holds the running month AND something else.
  const userTz = useUserTimezone();
  const todayIso = todayInTz(userTz).toString();
  // Month numbers → names for the recurring chart, in the member's locale.
  const monthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  const shortMonthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  const hasCompletedMonth = rangeHasCompletedMonth(
    range.from,
    range.to,
    todayIso,
  );
  const canDropRunningMonth =
    range.from <= todayIso &&
    todayIso <= range.to &&
    range.from.slice(0, 7) !== range.to.slice(0, 7);
  // 260804: the running month is ALWAYS out of the averages now — a note under
  // the chart says so — and the pill track it used to own switches the chart
  // between percent and money instead. Reading "1,900 zł too much" is what you
  // act on; "240% too much" is only how far off it is.
  const [scale, setScaleState] = useState<"pct" | "amount">(
    () => store?.overview.plannedScale ?? "pct",
  );
  const setScale = (v: "pct" | "amount") => {
    if (store) store.overview.plannedScale = v;
    setScaleState(v);
  };

  // The same one-off decisions the reserve chart uses — they come off THESE
  // averages too (260804). Same query key as the reserves section, so opening
  // both sections costs one request.
  const fit = useReserveFit(budgetId, {
    from: range.from,
    to: range.to,
    enabled: open,
  });
  const saveExclusions = useSaveReserveFitExclusions(budgetId);
  const oneOffCandidates: OneOffCandidate[] = (fit.data?.rows ?? []).flatMap(
    (r) =>
      (r.large_transactions ?? []).map((c) => ({
        ...c,
        category_id: r.category_id,
        category_name: r.name,
      })),
  );

  // Every category the budget has, investments included (260803 user request):
  // the picker offers exactly what the charts count, and both start ticked.
  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewPlanned(budgetId, {
    from: range.from,
    to: range.to,
    categoryIds: effectiveCategoryIds(
      categoryIds,
      categories.map((c) => c.id as string),
    ),
    excludeCurrentMonth: canDropRunningMonth,
    // Wait for the member's stored pick: firing before it lands fetches the
    // unfiltered chart and then throws it away a moment later.
    enabled: open && prefsLoaded,
  });

  // 260731: no needs/wants split → both series carry the same figure, and the
  // pink WANTS band would just double the green one (see lib/wants-split).
  const wantsSplitExists = hasWantsSplit(data?.timeline ?? []);
  // The whole range inside the month still running: the gap is not a verdict yet
  // (260803), which the totals strip and the by-category bars both key off.
  const rangeWithinRunningMonth =
    data?.rangeTotals?.range_within_running_month ?? false;

  // Timeline rows for the chart + the crossing gradient that colours the actual
  // line (grey inside the plan, red past it — cut at the exact crossing).
  // 260801 (user decision): each month stands on its own — at every boundary the
  // grey plan bands and the spend line drop to zero and the next month starts
  // again from there, instead of one line sliding across the boundary.
  const timelineRows = useMemo(
    () =>
      insertMonthResets(
        appendTodayTail(
          withDayStartBaseline(
            trimLeadingEmpty(
              (data?.timeline ?? []).map((p) => ({
                label: p.label,
                ts: labelToTimestamp(p.label, todayIso),
                real: Number(p.real_cents),
                needs: Number(p.needs_cents),
                wants: Number(p.wants_cents),
                withinLimit: Number(p.within_limit_cents ?? 0),
                reserveUsed: Number(p.reserve_used_cents ?? 0),
                overspent: Number(p.overspent_cents ?? 0),
              })),
              range.preset === "all" ? ["real", "needs", "wants"] : [],
            ),
            // Real spend starts at 0 (nothing spent yet); planned holds flat.
            ["real"],
            // The daily series is anchored to the window start server-side
            // (get-overview-planned), so it already begins at `from` — don't
            // prepend a day BEFORE it (that put 1M at "30 Jun", not the 1st).
            false,
          ),
          todayIso,
        ),
      ),
    [data?.timeline, range.preset, todayIso],
  );
  // More than one month in view → the axis names months, not days.
  const spansMonths =
    new Set(timelineRows.map((r) => r.label.slice(0, 7))).size > 1;
  // The overlay draws the spend line only where there IS spend: the running
  // month's tail carries the plan alone (real === null).
  const spentRows = useMemo(
    () =>
      timelineRows.filter(
        (r): r is typeof r & { real: number } => typeof r.real === "number",
      ),
    [timelineRows],
  );

  // Chart AXIS: bare + compact, no currency (r24 items 5/7). TOOLTIP: full $ (r25 #2).
  const ccy = data?.currency ?? "USD";
  const fmtY = chartCompactCents;
  const fmtTooltip = (n: number) =>
    centsToRounded(BigInt(Math.round(n)), ccy, "en", true);

  return (
    <OverviewSection
      testId="overview-section-planned"
      title={t("sections.planned")}
      open={open}
      onToggle={toggleOpen}
    >
      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      ) : (
        <>
          {/* Planned-vs-Real timeline. `wantsSplitExists` decides whether the
              WANTS band is drawn at all — see the series list below. */}
          <div className="flex flex-col gap-2">
            <ChartLabel>{t("planned.timelineTitle")}</ChartLabel>
            {/* 260731: the category filter belongs to THIS chart, so it sits
                under its label instead of floating above the whole section —
                and it uses the app's Select chrome, not a raw <select>. */}
            <CategoryMultiSelect
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                color:
                  hexForColorKey((c.colorKey as string | null) ?? null) ??
                  undefined,
              }))}
              selected={prunePlannedCategories(
                categoryIds,
                categories.map((c) => c.id),
              )}
              onCommit={setCategoryIds}
            />
            {/* Directly under the picker, because the picker narrows THESE too
                (260803 user request): the breakdown reads as the line's key,
                the comparison as how the range went against plan. */}
            {/* Optional-chained on purpose: the persisted query cache replays
                the PREVIOUS deploy's DTO shape, so a newly added field arrives
                undefined on the first paint. Reading it blind took the whole tab
                down with "Something went wrong" (260803). */}
            <PlannedTotals
              plannedCents={data.rangeTotals?.planned_cents ?? "0"}
              spentCents={data.rangeTotals?.spent_cents ?? "0"}
              withinLimitCents={data.rangeTotals?.within_limit_cents ?? "0"}
              reserveUsedCents={data.rangeTotals?.reserve_used_cents ?? "0"}
              overspentCents={data.rangeTotals?.overspent_cents ?? "0"}
              rangeWithinRunningMonth={rangeWithinRunningMonth}
              format={(cents) => centsToRounded(cents, ccy, "en", true)}
              // Deliberately NOT masked (user, 260803): these are the plan and
              // what it cost, not a balance — the figures the member reads while
              // the rest of the page stays redacted.
            />
            {data.timeline.length === 0 ? (
              <p className="text-num-sm text-[var(--muted-foreground)]">
                {t("empty.planned")}
              </p>
            ) : (
              <OverviewAreaChart
                // Remount when the tick set changes: moving a date label in
                // place left a ghost of its old position on iOS (user report),
                // and a fresh SVG cannot carry stale axis nodes across.
                key={`${range.preset}-${data.bucket}-${timelineRows.length}`}
                data={timelineRows}
                xKey="ts"
                xNumeric
                // Planned is split into NEEDS (essential base) + WANTS stacked ABOVE
                // it — the stack total = the planned limit, so "into wants" reads as
                // spending beyond needs. `real` is the actual-spend line on top.
                // 260801: the planned bands are pure BACKGROUND — needs grey,
                // wants a warm grey above it. All the meaning sits in the ACTUAL
                // line, which is stroked (no fill) in three zones: green below
                // needs, yellow between needs and needs+wants, red past the plan.
                // The cuts are solved on these same monotone curves, so they land
                // on the visual intersections (lib/actual-over-plan).
                series={[
                  {
                    key: "needs",
                    label: t("planned.needs"),
                    color: "var(--chart-plan-needs)",
                    stack: "planned",
                    curve: "linear" as const,
                    fillOpacity: 0.16,
                    strokeOpacity: 0.5,
                    noActiveDot: true,
                    // Background: under the grid (−100) and everything else.
                    zIndex: -200,
                    hideWhenZero: true,
                  },
                  ...(wantsSplitExists
                    ? [
                        {
                          key: "wants",
                          label: t("planned.wants"),
                          color: "var(--chart-plan-wants)",
                          stack: "planned",
                          curve: "linear" as const,
                          fillOpacity: 0.16,
                          strokeOpacity: 0.5,
                          noActiveDot: true,
                          zIndex: -200,
                          hideWhenZero: true,
                        },
                      ]
                    : []),
                  {
                    key: "real",
                    label: t("planned.real"),
                    color: CHART_THEME.neutral,
                    curve: "linear" as const,
                    // The visible actual line is the clipped <PlanZoneLine>
                    // overlay below; this series stays for the tooltip + hover dot
                    // but paints nothing (no fill, no stroke).
                    fillOpacity: 0,
                    strokeOpacity: 0,
                  },
                ]}
                // The hovered point's row takes its own zone's colour.
                overlay={
                  <Customized
                    component={(props: object) => (
                      <PlanZoneLine
                        {...props}
                        rows={spentRows}
                        colors={ZONE_COLOR}
                      />
                    )}
                  />
                }
                // Needs + Wants read as parts, so the row that closes them is
                // their total — not a section of its own (260801).
                summary={(row) =>
                  wantsSplitExists && Number(row.wants ?? 0) > 0
                    ? {
                        label: t("planned.total"),
                        value: fmtTooltip(
                          Number(row.needs ?? 0) + Number(row.wants ?? 0),
                        ),
                        plain: true,
                      }
                    : null
                }
                // The Actual row is replaced by the split below — the same three
                // parts the line is coloured in (260801 user request).
                tooltipOmitKeys={["real"]}
                tooltipExtra={(row) => {
                  const real = Number(row.real ?? 0);
                  const within = Number(row.withinLimit ?? 0);
                  const reserve = Number(row.reserveUsed ?? 0);
                  // Split the point's RUNNING total across the month's parts in
                  // the order they are spent, so the rows always sum to it.
                  const fromPlan = Math.min(real, within);
                  const fromReserve = Math.min(
                    Math.max(real - within, 0),
                    reserve,
                  );
                  const over = Math.max(real - within - reserve, 0);
                  const parts = [
                    {
                      label: t("planned.fromPlan"),
                      value: fmtTooltip(fromPlan),
                      color: ZONE_COLOR.under,
                    },
                    ...(fromReserve > 0
                      ? [
                          {
                            label: t("planned.fromReserve"),
                            value: fmtTooltip(fromReserve),
                            color: ZONE_COLOR.between,
                          },
                        ]
                      : []),
                    ...(over > 0
                      ? [
                          {
                            label: t("planned.overspent"),
                            value: fmtTooltip(over),
                            color: ZONE_COLOR.over,
                          },
                        ]
                      : []),
                  ];
                  // One part IS the total — repeating it says nothing.
                  return parts.length > 1
                    ? [
                        ...parts,
                        { label: t("planned.total"), value: fmtTooltip(real) },
                      ]
                    : parts;
                }}
                formatY={fmtY}
                formatTooltip={fmtTooltip}
                // Past 1M the axis names MONTHS: which day a monthly point sits
                // on (a month end, or today) is noise (260801 user request). The
                // tooltip still names the full day.
                xTickPerMonth={spansMonths}
                xTickFormat={(v) =>
                  formatChartTimestamp(
                    Number(v),
                    locale,
                    spansMonths ? "month" : "day",
                  )
                }
                // The tooltip names the DAY a point stands for: a monthly point
                // carries its month's value as of the last day (clamped to today
                // while the month is still running).
                labelFormat={(v) => formatTs(Number(v), locale)}
                // 260731 (user decision): the CHARTS always show real numbers — masking
                // them made the shapes unreadable. The privacy blur stays on the hero
                // cards + totals, which is where a shoulder-surfer actually reads a figure.
                maskAmounts={false}
              />
            )}
          </div>

          {/* Over / under budget, by category — PERCENT variance around a centre
              line (260731, user request). Amounts made a big rent line dwarf a
              small-but-3x-over coffee line; variance puts every category on one
              scale. Right = spent more than planned, left = less, ±10% = on plan
              (shaded band). Sorted most-over first so the problems sit at the top. */}
          {/* A range holding nothing but the month still running has no finished
              month to judge, and this chart judges whole months — so it says so
              instead of drawing a bar from half a month (user, 260804). */}
          {!hasCompletedMonth ? (
            <ChartNeedsCompletedMonth
              title={t("planned.avgByCategory")}
              testId="overview-planned-needs-month"
            />
          ) : (
            data.plannedAvgVsReal.length > 0 && (
              <div className="flex flex-col gap-2">
                <ChartLabel>{t("planned.avgByCategory")}</ChartLabel>
                {/* Percent or money — the same pill track the running-month
                  toggle used to own (260804 request). */}
                {/* The switch stays centred; the one-offs button floats in the
                  chart's corner so it never shoves it off-centre (260804). */}
                <div className="relative flex items-center justify-center">
                  <SegmentedToggle
                    className="text-caption"
                    testId="overview-planned-scale"
                    label={t("planned.scale")}
                    value={scale}
                    onChange={(v) => setScale(v as "pct" | "amount")}
                    options={[
                      { value: "pct", label: t("planned.scalePct") },
                      { value: "amount", label: t("planned.scaleAmount") },
                    ]}
                  />
                  <div
                    data-testid="overview-planned-corner"
                    className="absolute right-0 top-0"
                  >
                    <ReserveFitOneOffs
                      candidates={oneOffCandidates}
                      onSave={(delta) => saveExclusions.mutate(delta)}
                      format={fmtTooltip}
                    />
                  </div>
                </div>
                <OverviewDivergingBarChart
                  data={data.plannedAvgVsReal
                    .map((c) => {
                      const real = Number(c.real_avg_cents);
                      const planned = Number(c.planned_avg_cents);
                      const pct =
                        planned > 0
                          ? ((real - planned) / planned) * 100
                          : real > 0
                            ? 100
                            : 0;
                      return {
                        name: c.name,
                        real,
                        planned,
                        pct,
                        gap: real - planned,
                        realTotal: Number(c.real_total_cents),
                        plannedTotal: Number(c.planned_total_cents),
                      };
                    })
                    // Ordered the way the chart is being READ (260804).
                    .sort((a, b) =>
                      scale === "amount" ? b.gap - a.gap : b.pct - a.pct,
                    )}
                  categoryKey="name"
                  valueKey={scale === "amount" ? "gap" : "pct"}
                  formatValue={
                    scale === "amount"
                      ? // Signed, like the percent labels: the bar is a GAP, so
                        // "+1,900" reads as overspend and "−320" as room left.
                        signedMoney((n) =>
                          centsToRounded(
                            BigInt(Math.round(n)),
                            ccy,
                            "en",
                            true,
                          ),
                        )
                      : undefined
                  }
                  // Under plan while the range is the month still running is just
                  // "not spent yet" — those bars read grey rather than claiming
                  // success (260803 user request). Over plan still bands.
                  colorForPct={(pct) =>
                    varianceColorForRange(pct, {
                      runningMonthOnly: rangeWithinRunningMonth,
                    })
                  }
                  tooltipExtra={(row) => {
                    const diff = Number(row.real) - Number(row.planned);
                    const pct = Number(row.pct);
                    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
                    const pctSign = pct > 0 ? "+" : pct < 0 ? "−" : "";
                    return [
                      // Per-month average AND the range total, side by side: the
                      // bar reads as a rate, the total says what it actually cost
                      // over the window (260803 user request).
                      {
                        label: "",
                        value: t("planned.avgColumn"),
                        value2: t("planned.totalColumn"),
                        head: true,
                      },
                      {
                        label: t("planned.planned"),
                        value: fmtTooltip(Number(row.planned)),
                        value2: fmtTooltip(Number(row.plannedTotal)),
                      },
                      {
                        label: t("planned.real"),
                        value: fmtTooltip(Number(row.real)),
                        value2: fmtTooltip(Number(row.realTotal)),
                      },
                      {
                        label: t("planned.difference"),
                        // Amount AND percent on one line — the bar shows the
                        // percent, the tooltip should tie it back to real money.
                        // Percent first — it is what the bar length encodes; the
                        // money is the supporting detail (260801).
                        value: `${pctSign}${Math.abs(
                          Math.round(Number(row.pct)),
                        )}% · ${sign}${fmtTooltip(Math.abs(diff))}`,
                        // A conclusion, not another figure in the list — it opens
                        // its own section under a rule (260803).
                        section: true,
                        color: varianceColorForRange(Number(row.pct), {
                          runningMonthOnly: rangeWithinRunningMonth,
                        }),
                      },
                    ];
                  }}
                  formatTooltip={fmtTooltip}
                  // 260731 (user decision): the CHARTS always show real numbers — masking
                  // them made the shapes unreadable. The privacy blur stays on the hero
                  // cards + totals, which is where a shoulder-surfer actually reads a figure.
                  maskAmounts={false}
                />
                {canDropRunningMonth && (
                  <p
                    data-testid="overview-planned-ongoing-note"
                    className="-mt-1 text-center text-[10px] leading-tight text-[var(--muted-foreground)]/70"
                  >
                    {t("planned.ongoingExcluded")}
                  </p>
                )}
              </div>
            )
          )}

          {/* Planned-spend share pie — how the range-averaged planned budget
              splits across categories. Sits directly below the over/under
              chart so the reference (planned averages) reads in both shapes. */}
          <PlannedByCategoryPie
            rows={data.plannedAvgVsReal}
            categories={categories}
            picked={prunePlannedCategories(
              pieCategoryIds,
              categories.map((c) => c.id as string),
            )}
            onPick={setPieCategoryIds}
            isInvestment={(id) =>
              Boolean(categories.find((c) => c.id === id)?.isInvestment)
            }
            ringLabel={(key) => t(`planned.ring.${key}`)}
            pickable={categories.map((c) => ({
              id: c.id,
              name: c.name,
              color:
                hexForColorKey((c.colorKey as string | null) ?? null) ??
                undefined,
            }))}
            title={t("planned.avgPie")}
            allLabel={t("planned.allCategories")}
            formatValue={fmtTooltip}
            // Same call as the metrics above: planned spend stays readable.
          />

          {/* Recurring payments, by month — current config, NOT range-scoped
              (D-14). It lived in a section of its own until 260804; one chart
              did not earn a collapsible, and it reads as part of the plan. */}
          <div className="flex flex-col gap-2">
            <ChartLabel>{t("planned.recurringPerMonth")}</ChartLabel>
            <OverviewAreaChart
              data={data.recurringPerMonth.map((m) => ({
                month: String(m.month),
                planned: Number(m.planned_cents),
                items: m.items,
              }))}
              xKey="month"
              // The tooltip repeats the series name under the month it already
              // names, so it drops the ", by month" the chart title needs.
              series={[{ key: "planned", label: t("planned.recurringSeries") }]}
              formatY={fmtY}
              formatTooltip={fmtTooltip}
              xTickFormat={shortMonthName}
              labelFormat={monthName}
              maskAmounts={false}
              // Each payment behind the month (the series row carries the total).
              tooltipExtra={(row) => {
                const items =
                  (row.items as { name: string; amount_cents: string }[]) ?? [];
                return items.map((it) => ({
                  label: it.name || "—",
                  value: fmtTooltip(Number(it.amount_cents)),
                }));
              }}
            />
          </div>
        </>
      )}
    </OverviewSection>
  );
}
