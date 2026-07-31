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
import { useState } from "react";
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
import { useSlotReveal } from "@/components/budgeting/overview/slot-amount";
import { CATEGORY_COLORS, hexForColorKey } from "@/lib/category-colors";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToRounded } from "@/lib/cents-format";
import { chartCompactCents, withDayStartBaseline } from "@/lib/chart-format";
import { formatChartDate } from "@/lib/chart-date-format";
import type { OverviewRange } from "@/lib/overview-range";

const NEUTRAL = "var(--muted-foreground)";

/** Drop leading points where every value key is 0 — so the "All" range starts at
 * the first recorded data, not the far-back range start (UAT round 15 item 1). */
function trimLeadingEmpty<T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
): T[] {
  const first = rows.findIndex((r) => keys.some((k) => Number(r[k]) !== 0));
  return first > 0 ? rows.slice(first) : rows;
}

function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-[var(--muted-foreground)]">{children}</p>
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
  // Privacy: mask money in the chart tooltips to "•••" until the shared reveal.
  const { revealed } = useSlotReveal();
  const hideMoney = amountPrivacyEnabled && !revealed;
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

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewPlanned(budgetId, {
    from: range.from,
    to: range.to,
    categoryId,
    enabled: open,
  });

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
      <label className="flex items-center gap-2 text-num-sm text-[var(--muted-foreground)]">
        {t("planned.category")}
        <select
          data-testid="overview-planned-category"
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || undefined)}
          className="rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-2 py-1 text-[var(--body-on-dark)]"
        >
          <option value="">{t("planned.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      ) : (
        <>
          {/* Planned-vs-Real timeline */}
          <div className="flex flex-col gap-2">
            <ChartLabel>{t("planned.timelineTitle")}</ChartLabel>
            {data.timeline.length === 0 ? (
              <p className="text-num-sm text-[var(--muted-foreground)]">
                {t("empty.planned")}
              </p>
            ) : (
              <OverviewAreaChart
                data={withDayStartBaseline(
                  trimLeadingEmpty(
                    data.timeline.map((p) => ({
                      label: p.label,
                      real: Number(p.real_cents),
                      needs: Number(p.needs_cents),
                      wants: Number(p.wants_cents),
                    })),
                    range.preset === "all" ? ["real", "needs", "wants"] : [],
                  ),
                  // Real spend starts at 0 (nothing spent yet); planned holds flat.
                  ["real"],
                  // The daily series is now anchored to the window start server-side
                  // (get-overview-planned), so it already begins at `from` — don't
                  // prepend a day BEFORE it (that put 1M at "30 Jun" instead of the
                  // 1st). Keep only the degenerate single-point baseline (default).
                  false,
                )}
                xKey="label"
                // Planned is split into NEEDS (essential base) + WANTS stacked ABOVE
                // it — the stack total = the planned limit, so "into wants" reads as
                // spending beyond needs. `real` is the actual-spend line on top.
                // needs = grey base, wants = green stacked above (the "over" band);
                // spendings (real) = yellow, drawn LAST so its area sits on top.
                series={[
                  {
                    key: "needs",
                    label: t("planned.needs"),
                    color: CHART_THEME.neutral,
                    stack: "planned",
                    fillOpacity: 0.3,
                  },
                  {
                    key: "wants",
                    label: t("planned.wants"),
                    color: "var(--trading-up)",
                    stack: "planned",
                    fillOpacity: 0.3,
                  },
                  {
                    key: "real",
                    label: t("planned.real"),
                    color: CHART_THEME.accent,
                    fillOpacity: 0.35,
                  },
                ]}
                formatY={fmtY}
                formatTooltip={fmtTooltip}
                xTickFormat={(v) => formatChartDate(v, locale)}
                maskAmounts={amountPrivacyEnabled}
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
                      value: hideMoney
                        ? "•••"
                        : fmtTooltip(Number(row.planned)),
                    },
                    {
                      label: t("planned.real"),
                      value: hideMoney ? "•••" : fmtTooltip(Number(row.real)),
                    },
                    {
                      label: t("planned.difference"),
                      // Amount AND percent on one line — the bar shows the
                      // percent, the tooltip should tie it back to real money.
                      value: `${
                        hideMoney
                          ? "•••"
                          : `${sign}${fmtTooltip(Math.abs(diff))}`
                      } · ${pctSign}${Math.abs(Math.round(Number(row.pct)))}%`,
                      color: varianceColor(Number(row.pct)),
                    },
                  ];
                }}
                formatTooltip={fmtTooltip}
                maskAmounts={amountPrivacyEnabled}
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
              maskAmounts={amountPrivacyEnabled}
              // Tooltip lists each planned payment for the month (the series row
              // already shows the total).
              tooltipExtra={(row) => {
                const items =
                  (row.items as { name: string; amount_cents: string }[]) ?? [];
                return items.map((it) => ({
                  label: it.name || "—",
                  value: hideMoney
                    ? "•••"
                    : fmtTooltip(Number(it.amount_cents)),
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
                maskAmounts={amountPrivacyEnabled}
              />
            </div>
          )}
        </>
      )}
    </OverviewSection>
  );
}
