"use client";
/**
 * planned-section.tsx — Overview "Planned" section (11-09, SC4).
 *
 * Collapsible; lazy-fetches /overview/planned only when open. Renders the
 * Planned-vs-Real timeline (line: real solid yellow, planned dashed neutral), the
 * planned-avg-vs-real bar (Y=category), and the two recurring bars (per-month +
 * per-category, "current config" — NOT range-scoped, D-14). A category selector
 * (default = All categories) re-scopes the timeline. Charts via the 11-02 wrappers
 * only; string cents → Number here (recharts needs Numbers).
 */
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { OverviewSection } from "./overview-section";
import {
  usePersistedSectionOpen,
  useBdpUiStore,
} from "@/components/budgeting/bdp-ui-state";
import { CHART_THEME } from "@/components/budgeting/charts/chart-theme";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import {
  OverviewDivergingBarChart,
  varianceColor,
} from "@/components/budgeting/charts/diverging-bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import { CATEGORY_COLORS, hexForColorKey } from "@/lib/category-colors";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Customized } from "recharts";
import { PlanZoneLine } from "./plan-zone-line";
import { hasWantsSplit } from "@/lib/wants-split";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToRounded } from "@/lib/cents-format";
import { chartCompactCents, withDayStartBaseline } from "@/lib/chart-format";
import { formatChartDate, formatChartTimestamp } from "@/lib/chart-date-format";
import { labelToTimestamp } from "@/lib/chart-timestamp";
import { insertMonthResets } from "@/lib/month-reset";
import { appendTodayTail } from "@/lib/today-tail";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { todayInTz, type OverviewRange } from "@/lib/overview-range";

const NEUTRAL = "var(--muted-foreground)";

/** Actual-line colour per plan band (260801): green inside needs, yellow in the
 *  wants band, red past the whole plan. Shared by the stroke gradient + tooltip. */
const ZONE_COLOR = {
  under: "var(--trading-up)",
  between: "var(--primary)",
  over: "var(--trading-down)",
} as const;

/** Drop leading points where every value key is 0 — so the "All" range starts at
 * the first recorded data, not the far-back range start (UAT round 15 item 1). */
function trimLeadingEmpty<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
): T[] {
  const first = rows.findIndex((r) => keys.some((k) => Number(r[k]) !== 0));
  return first > 0 ? rows.slice(first) : rows;
}

/** Radix Select forbids an empty-string item value, so "all" needs a sentinel. */
const ALL_CATEGORIES = "__all__";

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
 * Colors follow the category's persisted colorKey; colorless categories cycle
 * the shared palette so adjacent slices stay distinct. */
function PlannedByCategoryPie({
  rows,
  categories,
  title,
  allLabel,
  formatValue,
  maskValue = false,
}: {
  rows: { name: string; planned_avg_cents: string }[];
  categories: { name: string; colorKey?: unknown }[];
  title: string;
  allLabel: string;
  formatValue: (n: number) => string;
  maskValue?: boolean;
}) {
  const data = rows
    .map((c) => ({ name: c.name, planned: Number(c.planned_avg_cents) }))
    .filter((r) => r.planned > 0)
    .sort((a, b) => b.planned - a.planned);
  if (data.length === 0) return null;

  const colorByName = new Map<string, string>(
    data.map((r, i) => {
      const cat = categories.find((c) => c.name === r.name);
      const hex = hexForColorKey((cat?.colorKey as string | null) ?? null);
      return [r.name, hex ?? CATEGORY_COLORS[i % CATEGORY_COLORS.length].hex];
    }),
  );

  return (
    <div className="flex flex-col gap-2">
      <ChartLabel>{title}</ChartLabel>
      <OverviewPieChart
        data={data}
        nameKey="name"
        valueKey="planned"
        colorFor={(name) => colorByName.get(name) ?? CATEGORY_COLORS[7].hex}
        formatValue={formatValue}
        allLabel={allLabel}
        maskValue={maskValue}
      />
    </div>
  );
}

export function PlannedSection({
  budgetId,
  range,
  amountPrivacyEnabled = true,
}: {
  budgetId: string;
  range: OverviewRange;
  amountPrivacyEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  // Full localized month name for the recurring tooltip (item 2): 8 → "August" /
  // "Серпень" / "sierpień".
  const monthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  // Short month name for the recurring-by-month X-axis (item 4): 8 → "Aug".
  const shortMonthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  const [open, toggleOpen] = usePersistedSectionOpen("planned");
  // Persist the selected category across pill navigation (the carousel unmounts
  // this pane, so a plain useState would reset to "All categories" on return).
  const store = useBdpUiStore();
  const [categoryId, setCategoryIdState] = useState<string | undefined>(
    () => store?.overview.plannedCategoryId,
  );
  const setCategoryId = (v: string | undefined) => {
    if (store) store.overview.plannedCategoryId = v;
    setCategoryIdState(v);
  };

  // Counting the month still in progress is opt-IN: half a month of spend drags
  // an average down against months that ran their full course (260802 request).
  // Only offered when the range holds the running month AND something else.
  const userTz = useUserTimezone();
  const todayIso = todayInTz(userTz).toString();
  const canDropRunningMonth =
    range.from <= todayIso &&
    todayIso <= range.to &&
    range.from.slice(0, 7) !== range.to.slice(0, 7);
  const [includeRunningMonth, setIncludeRunningMonthState] = useState<boolean>(
    () => store?.overview.plannedIncludeRunningMonth ?? false,
  );
  const setIncludeRunningMonth = (v: boolean) => {
    if (store) store.overview.plannedIncludeRunningMonth = v;
    setIncludeRunningMonthState(v);
  };

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewPlanned(budgetId, {
    from: range.from,
    to: range.to,
    categoryId,
    excludeCurrentMonth: canDropRunningMonth && !includeRunningMonth,
    enabled: open,
  });

  // 260731: no needs/wants split → both series carry the same figure, and the
  // pink WANTS band would just double the green one (see lib/wants-split).
  const wantsSplitExists = hasWantsSplit(data?.timeline ?? []);

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
            <Select
              value={categoryId ?? ALL_CATEGORIES}
              onValueChange={(v) =>
                setCategoryId(v === ALL_CATEGORIES ? undefined : v)
              }
            >
              <SelectTrigger
                data-testid="overview-planned-category"
                aria-label={t("planned.category")}
                className="mx-auto h-9 w-fit min-w-[10rem] max-w-full gap-2 rounded-full border-[var(--hairline-dark)] bg-[var(--surface-elevated-dark)] px-3 text-num-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>
                  {t("planned.allCategories")}
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                  wantsSplitExists
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
          {data.plannedAvgVsReal.length > 0 && (
            <div className="flex flex-col gap-2">
              <ChartLabel>{t("planned.avgByCategory")}</ChartLabel>
              {/* A month still in progress drags the average down against months
                  that ran their full course, so it is left out by default — and
                  only offered when the range has other months to average. */}
              {canDropRunningMonth && (
                <label className="flex items-center justify-center gap-2 text-caption text-[var(--muted-foreground)]">
                  <Switch
                    checked={includeRunningMonth}
                    onCheckedChange={setIncludeRunningMonth}
                    aria-label={t("planned.includeRunningMonth")}
                  />
                  {t("planned.includeRunningMonth")}
                </label>
              )}
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
                    return { name: c.name, real, planned, pct };
                  })
                  .sort((a, b) => b.pct - a.pct)}
                categoryKey="name"
                valueKey="pct"
                tooltipExtra={(row) => {
                  const diff = Number(row.real) - Number(row.planned);
                  const pct = Number(row.pct);
                  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
                  const pctSign = pct > 0 ? "+" : pct < 0 ? "−" : "";
                  return [
                    {
                      label: t("planned.planned"),
                      value: fmtTooltip(Number(row.planned)),
                    },
                    {
                      label: t("planned.real"),
                      value: fmtTooltip(Number(row.real)),
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
                      color: varianceColor(Number(row.pct)),
                    },
                  ];
                }}
                formatTooltip={fmtTooltip}
                // 260731 (user decision): the CHARTS always show real numbers — masking
                // them made the shapes unreadable. The privacy blur stays on the hero
                // cards + totals, which is where a shoulder-surfer actually reads a figure.
                maskAmounts={false}
              />
            </div>
          )}

          {/* Planned-spend share pie — how the range-averaged planned budget
              splits across categories. Sits directly below the over/under
              chart so the reference (planned averages) reads in both shapes. */}
          <PlannedByCategoryPie
            rows={data.plannedAvgVsReal}
            categories={categories}
            title={t("planned.avgPie")}
            allLabel={t("planned.allCategories")}
            formatValue={fmtTooltip}
            maskValue={amountPrivacyEnabled}
          />

          {/* Recurring per month — current config (NOT range-scoped, D-14).
              Simple area chart (single series). */}
          <div className="flex flex-col gap-2">
            <ChartLabel>{t("planned.recurringPerMonth")}</ChartLabel>
            <OverviewAreaChart
              data={data.recurringPerMonth.map((m) => ({
                month: String(m.month),
                planned: Number(m.planned_cents),
                items: m.items,
              }))}
              xKey="month"
              series={[
                { key: "planned", label: t("planned.recurringPerMonth") },
              ]}
              formatY={fmtY}
              formatTooltip={fmtTooltip}
              xTickFormat={shortMonthName}
              labelFormat={monthName}
              // 260731 (user decision): the CHARTS always show real numbers — masking
              // them made the shapes unreadable. The privacy blur stays on the hero
              // cards + totals, which is where a shoulder-surfer actually reads a figure.
              maskAmounts={false}
              // Tooltip lists each planned payment for the month (the series row
              // already shows the total).
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

          {/* Recurring per category — current config. Grey bars, sorted
              highest→lowest (recharts vertical renders first row at the top). */}
          {data.recurringPerCategory.length > 0 && (
            <div className="flex flex-col gap-2">
              <ChartLabel>{t("planned.recurringPerCategory")}</ChartLabel>
              <OverviewBarChart
                layout="vertical"
                data={data.recurringPerCategory
                  .map((c) => ({
                    name: c.name,
                    planned: Number(c.planned_cents),
                  }))
                  .sort((a, b) => b.planned - a.planned)}
                xKey="name"
                series={[
                  {
                    key: "planned",
                    label: t("planned.recurringPerCategory"),
                    color: NEUTRAL, // grey
                  },
                ]}
                formatValue={fmtY}
                formatTooltip={fmtTooltip}
                // 260731 (user decision): the CHARTS always show real numbers — masking
                // them made the shapes unreadable. The privacy blur stays on the hero
                // cards + totals, which is where a shoulder-surfer actually reads a figure.
                maskAmounts={false}
              />
            </div>
          )}
        </>
      )}
    </OverviewSection>
  );
}
