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
import { OverviewOverlapBarChart } from "@/components/budgeting/charts/overlap-bar-chart";
import { overspendHeat } from "@/lib/overspend-heat";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToDisplayCompact } from "@/lib/cents-format";
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

export function PlannedSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
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
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, "en", true);

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
                  data.bucket === "daily",
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
              />
            )}
          </div>

          {/* Overspend by category — overlaid "bar-in-bar": planned-average as a
              grey reference bar with the real-average drawn on top, heat-coloured
              by the real-vs-planned variance (>+10% red, <−10% yellow, else green).
              Sorted most-overspent first so the critical categories sit at top;
              the tooltip adds the difference amount + percent. */}
          {data.plannedAvgVsReal.length > 0 && (
            <div className="flex flex-col gap-2">
              <ChartLabel>{t("planned.avgByCategory")}</ChartLabel>
              <OverviewOverlapBarChart
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
                  // Most overspent first → recharts renders it at the TOP.
                  .sort((a, b) => b.pct - a.pct)}
                xKey="name"
                // Planned = grey reference (bottom); real = heat-coloured overspend
                // indicator on top.
                base={{
                  key: "planned",
                  label: t("planned.planned"),
                  color: NEUTRAL,
                }}
                overlay={{ key: "real", label: t("planned.real") }}
                overlayOpacity={0.72}
                overlayColorByPoint={(row) => overspendHeat(Number(row.pct))}
                tooltipExtra={(row) => {
                  const diff = Number(row.real) - Number(row.planned);
                  const pct = Number(row.pct);
                  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
                  const pctSign = pct > 0 ? "+" : pct < 0 ? "−" : "";
                  return [
                    {
                      label: t("planned.difference"),
                      value: `${sign}${fmtTooltip(Math.abs(diff))} · ${pctSign}${Math.abs(Math.round(pct))}%`,
                    },
                  ];
                }}
                formatValue={fmtY}
                formatTooltip={fmtTooltip}
              />
            </div>
          )}

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
              />
            </div>
          )}
        </>
      )}
    </OverviewSection>
  );
}
