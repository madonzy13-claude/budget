"use client";
/**
 * wealth-section.tsx — Overview "Financial Wealth" section (11-09, SC7, D-18).
 *
 * Collapsible; capitalization(default)/investments toggle switches the ?view param
 * (new RQ key → new fetch). Renders the grow/loss stat (amount + signed % with an
 * up-green/down-red arrow), the monthly-avg grow %, the value time-series (area,
 * range-scoped), the month-over-month dynamics bar (per-bar green/red), and — only
 * in the investments view — a per-holding-type pie colored by the Phase-9
 * UI_TYPE_COLOR map. null % → "—"; empty history → calm copy. Charts via the 11-02
 * wrappers; string cents → Number here.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { OverviewSection } from "./overview-section";
import { usePersistedSectionOpen } from "@/components/budgeting/bdp-ui-state";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import {
  useOverviewWealth,
  type WealthView,
} from "@/hooks/use-overview-wealth";
import { useOverviewCards } from "@/hooks/use-overview-cards";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { chartCompactCents, pctAxisTick } from "@/lib/chart-format";
import { UI_TYPE_COLOR } from "@/lib/investment-icons";
import { deriveUiType } from "@/lib/investment-types";
import { formatChartDate } from "@/lib/chart-date-format";
import type { OverviewRange } from "@/lib/overview-range";

const UP = "var(--trading-up)";
const DOWN = "var(--trading-down)";
const NEUTRAL = "var(--muted-foreground)";

// Capitalization pie slice colors — 4 distinct pools of money.
const BUCKET_INVEST = "var(--chart-bar-1)"; // blue
const BUCKET_SPEND = "var(--primary)"; // yellow
const BUCKET_RESERVE = "var(--chart-bar-2)"; // teal
const BUCKET_CUSHION = "var(--chart-bar-3)"; // purple (distinct from teal)

/** i18n key for the % CHANGE chart title/series, by its (coarser) bucket. */
function dynamicsLabelKey(b: "daily" | "monthly" | "yearly"): string {
  return b === "daily"
    ? "wealth.dynamicsDaily"
    : b === "monthly"
      ? "wealth.dynamicsMonthly"
      : "wealth.dynamicsYearly";
}

function PctStat({ label, pct }: { label: string; pct: number | null }) {
  const up = pct !== null && pct >= 0;
  const down = pct !== null && pct < 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span
        className={cn(
          "num inline-flex items-center gap-1 text-num-md",
          up && "text-[var(--trading-up)]",
          down && "text-[var(--trading-down)]",
          pct === null && "text-[var(--muted-foreground)]",
        )}
      >
        {pct === null ? (
          "—"
        ) : (
          <>
            <Arrow className="size-3.5" aria-hidden="true" />
            {`${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`}
          </>
        )}
      </span>
    </div>
  );
}

export function WealthSection({
  budgetId,
  range,
  investmentsEnabled = true,
}: {
  budgetId: string;
  range: OverviewRange;
  investmentsEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, toggleOpen] = usePersistedSectionOpen("wealth");
  const [view, setView] = useState<WealthView>("capitalization");
  // Investments off → no per-type view to switch to: capitalization-only (the
  // toggle is hidden below), regardless of any prior selection.
  const effectiveView: WealthView = investmentsEnabled
    ? view
    : "capitalization";

  const { data, isPending, isError } = useOverviewWealth(budgetId, {
    from: range.from,
    to: range.to,
    view: effectiveView,
    enabled: open,
  });

  const ccy = data?.currency ?? "USD";
  // Chart AXIS: bare + COMPACT ("82K", "1M") — no currency (r24 items 5/7).
  const fmtY = chartCompactCents;
  // Chart TOOLTIP (on tap): the FULL value WITH currency (r25 item 2).
  const fmtTooltip = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, "en");
  // Pie centre read-out: whole currency, NO cents (round to the nearest unit).
  const fmtPieValue = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n / 100) * 100), ccy, "en");

  // Capitalization pie: where the money sits — investments / spendings-wallets /
  // reserves-wallets / cushion. Sourced from the (already-prefetched) overview
  // cards; zero pools are dropped so the pie only shows what's actually held.
  const cards = useOverviewCards(budgetId).data;
  const capBuckets = cards
    ? [
        {
          name: t("wealth.capInvestments"),
          value: Number(cards.investment_value_cents),
          color: BUCKET_INVEST,
        },
        {
          name: t("wealth.capSpendings"),
          value: Number(cards.spendings.wallet_cents),
          color: BUCKET_SPEND,
        },
        {
          name: t("wealth.capReserves"),
          value: Number(cards.reserves.wallet_cents),
          color: BUCKET_RESERVE,
        },
        {
          name: t("wealth.capCushion"),
          value: Number(cards.cushion.total_cents),
          color: BUCKET_CUSHION,
        },
      ].filter((b) => b.value > 0)
    : [];
  const capColorMap: Record<string, string> = Object.fromEntries(
    capBuckets.map((b) => [b.name, b.color]),
  );

  const toggle = (v: WealthView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={cn(
        "border-b-2 px-3 py-1.5 text-num-sm min-h-[44px] sm:min-h-0",
        view === v
          ? "border-[var(--primary)] text-[var(--body-on-dark)]"
          : "border-transparent text-[var(--muted-foreground)]",
      )}
    >
      {label}
    </button>
  );

  return (
    <OverviewSection
      testId="overview-section-wealth"
      title={t("sections.wealth")}
      open={open}
      onToggle={toggleOpen}
    >
      {/* Capitalization/Investments toggle — centered; hidden entirely when the
          Investments feature is off (capitalization-only). */}
      {investmentsEnabled && (
        <div role="group" className="flex items-center justify-center gap-1">
          {toggle("capitalization", t("wealth.capitalization"))}
          {toggle("investments", t("wealth.investments"))}
        </div>
      )}

      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data || data.series.length === 0 ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.wealth")}
        </p>
      ) : (
        (() => {
          // FW growth anchors on the chart's OPENING value so the % agrees with the
          // chart (r30 item 2). Fall back to `grow` when the field is absent — a
          // stale cached response mid-deploy must not white-screen the page.
          const growth = data.grow_from_open ?? data.grow;
          return (
            <>
              {/* VALUE chart + its RANGE-scoped metric: total growth over the whole
              selected range (r27 item 2 — the metric lives with the chart it
              measures, so it's clear it analyzes the range, not a single period). */}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-start justify-center gap-6">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-caption text-[var(--muted-foreground)]">
                      {Number(growth.delta_cents) >= 0
                        ? t("wealth.grow")
                        : t("wealth.loss")}
                    </p>
                    <span
                      className={cn(
                        "num text-num-md",
                        Number(growth.delta_cents) >= 0
                          ? "text-[var(--trading-up)]"
                          : "text-[var(--trading-down)]",
                      )}
                    >
                      {centsToDisplayCompact(growth.delta_cents, ccy, "en")}
                    </span>
                  </div>
                  <PctStat label={t("wealth.grow")} pct={growth.delta_pct} />
                </div>
                {/* Make explicit this growth is measured over the SELECTED period, e.g.
                "since month start" on 1M — not a daily figure (r28 correction). */}
                <p className="-mt-1 text-center text-caption text-[var(--muted-foreground)]">
                  {t("wealth.growSince", { preset: range.preset })}
                </p>
                <OverviewAreaChart
                  data={data.series.map((p) => ({
                    label: p.label,
                    value: Number(p.value_cents),
                  }))}
                  xKey="label"
                  series={[
                    {
                      key: "value",
                      label:
                        effectiveView === "investments"
                          ? t("wealth.investments")
                          : t("wealth.capitalization"),
                    },
                  ]}
                  formatY={fmtY}
                  formatTooltip={fmtTooltip}
                  xTickFormat={(v) => formatChartDate(v, locale)}
                />
              </div>

              {/* CHANGE chart + its PER-PERIOD metric: the average change AT THIS
              bucket — daily on 1M, monthly on 3M…1Y, yearly beyond. The label
              carries the granularity so day-vs-month averages aren't confused. */}
              {data.dynamics.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-center gap-6">
                    <PctStat
                      label={t("wealth.monthlyAvg")}
                      pct={data.monthly_avg_grow_pct}
                    />
                  </div>
                  <OverviewBarChart
                    data={data.dynamics.map((d) => ({
                      label: d.label,
                      pct: d.pct ?? 0,
                      raw: d.pct,
                    }))}
                    xKey="label"
                    series={[
                      {
                        key: "pct",
                        label: t(dynamicsLabelKey(data.dynamicsBucket)),
                      },
                    ]}
                    colorByPoint={(row) =>
                      row.raw === null
                        ? NEUTRAL
                        : Number(row.pct) >= 0
                          ? UP
                          : DOWN
                    }
                    formatValue={pctAxisTick}
                    formatTooltip={(n) => `${n.toFixed(1)}%`}
                    xTickFormat={(v) => formatChartDate(v, locale)}
                    labelFormat={(v) => formatChartDate(v, locale)}
                  />
                </div>
              )}

              {/* Capitalization view: where the money is (investments / spendings
                  / reserves / cushion) — a static labeled pie. */}
              {effectiveView === "capitalization" && capBuckets.length > 0 && (
                <div
                  data-testid="overview-capitalization-pie"
                  className="flex flex-col gap-2"
                >
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {t("wealth.byBucket")}
                  </p>
                  <OverviewPieChart
                    data={capBuckets}
                    nameKey="name"
                    valueKey="value"
                    colorFor={(n) => capColorMap[n] ?? NEUTRAL}
                    formatValue={fmtPieValue}
                  />
                </div>
              )}

              {/* Investments view: per-type pie (UI_TYPE_COLOR) */}
              {effectiveView === "investments" && (
                <div
                  data-testid="overview-wealth-pie"
                  className="flex flex-col gap-2"
                >
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {t("wealth.byType")}
                  </p>
                  {data.pie && data.pie.length > 0 ? (
                    <OverviewPieChart
                      data={data.pie.map((p) => ({
                        holding_type: p.holding_type,
                        value: Number(p.value_cents),
                      }))}
                      nameKey="holding_type"
                      valueKey="value"
                      colorFor={(ht) =>
                        UI_TYPE_COLOR[deriveUiType(null, ht, false)]
                      }
                      formatValue={fmtPieValue}
                    />
                  ) : (
                    <p className="text-num-sm text-[var(--muted-foreground)]">
                      {t("empty.pie")}
                    </p>
                  )}
                </div>
              )}
            </>
          );
        })()
      )}
    </OverviewSection>
  );
}
