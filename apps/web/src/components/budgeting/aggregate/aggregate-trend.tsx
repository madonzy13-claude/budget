"use client";
/**
 * aggregate-trend.tsx — combined "Net worth over time" wealth section for the
 * all-budgets page, mirroring the single-budget BDP wealth section:
 *   - Capitalization / Investments view toggle (drives the ?view param).
 *   - Investments view: Incl./Excl.-contributions toggle (net), an "Invested"
 *     metric, and a per-holding-type pie (UI_TYPE_COLOR).
 *   - Capitalization view: a "where it sits" pie (investments/cash/reserves/
 *     cushion) built from the aggregate row sums.
 *   - Centered growth row (signed amount + PctStat %) + AREA chart with the
 *     same month/date label formatting. Range comes from a SEPARATE parent
 *     selector (like BDP's band).
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import {
  SlotAmount,
  useSlotReveal,
} from "@/components/budgeting/overview/slot-amount";
import type { OverviewRange } from "@/lib/overview-range";
import { formatChartDate } from "@/lib/chart-date-format";
import { chartCompactCents, pctAxisTick } from "@/lib/chart-format";
import { centsToRounded } from "@/lib/cents-format";
import { UI_TYPE_COLOR } from "@/lib/investment-icons";
import { deriveUiType } from "@/lib/investment-types";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";
// Capitalization pie pools (mirror wealth-section): distinct chart colors.
const BUCKET_INVEST = "var(--chart-bar-1)";
const BUCKET_SPEND = "var(--primary)";
const BUCKET_RESERVE = "var(--chart-bar-2)";
const BUCKET_CUSHION = "var(--chart-bar-3)";
const NEUTRAL = "var(--muted-foreground)";
const UP = "var(--trading-up)";
const DOWN = "var(--trading-down)";
const maskDigits = (s: string) => s.replace(/\d/g, "•");

type WealthView = "capitalization" | "investments";

/** BDP wealth-section PctStat: label + arrow + signed %. */
function PctStat({ label, pct }: { label: string; pct: number | null }) {
  const up = pct !== null && pct >= 0;
  const down = pct !== null && pct < 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <div className="flex flex-col items-center gap-0.5">
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
            <SlotAmount
              value={`${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`}
            />
          </>
        )}
      </span>
    </div>
  );
}

export function AggregateTrend({
  includeIds,
  range,
  currency,
  capitalization,
}: {
  includeIds: string[];
  range: OverviewRange;
  currency: string;
  capitalization: {
    investmentsCents: string;
    cashCents: string;
    reservesCents: string;
    cushionCents: string;
  };
}) {
  const t = useTranslations("aggregate");
  const tInvest = useTranslations("budget.investments");
  const locale = useLocale();
  const [view, setView] = useState<WealthView>("capitalization");
  const [net, setNet] = useState(false);
  const { data, isPending } = useAggregateWealth(
    includeIds,
    range.from,
    range.to,
    view,
    view === "investments" && net,
  );

  const ccy = data?.display_currency ?? currency;
  const fmt = (c: string) => centsToRounded(BigInt(c), ccy, locale, true);
  const fmtSigned = (c: string) => {
    const n = BigInt(c);
    const abs = n < 0n ? -n : n;
    return `${n >= 0n ? "+" : "−"}${centsToRounded(abs, ccy, locale, true)}`;
  };
  const fmtPieValue = (v: number) =>
    centsToRounded(BigInt(Math.round(v)), ccy, locale, true);
  const fmtSignedPct = (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
  const { revealed } = useSlotReveal();

  const hasSeries = !!data && data.series.length > 0;
  // Per-bucket "avg change" (dynamics) — consecutive % change of the aggregate
  // series, mirroring the BDP wealth dynamics bar chart. Same green/red split.
  const dynamics =
    hasSeries && data
      ? data.series.flatMap((p, i) => {
          if (i === 0) return [];
          const prev = Number(data.series[i - 1]!.value_cents);
          const cur = Number(p.value_cents);
          return [
            {
              label: p.label,
              pct: prev === 0 ? null : ((cur - prev) / prev) * 100,
              delta_cents: cur - prev,
            },
          ];
        })
      : [];
  const avgPct = (() => {
    const vals = dynamics
      .map((d) => d.pct)
      .filter((p): p is number => p !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();
  const up = hasSeries ? Number(data.grow.delta_cents) >= 0 : true;
  const investedPositive =
    data?.invested_cents != null && Number(data.invested_cents) > 0;

  const capBuckets = [
    { name: "investments", value: Number(capitalization.investmentsCents) },
    { name: "cash", value: Number(capitalization.cashCents) },
    { name: "reserves", value: Number(capitalization.reservesCents) },
    { name: "cushion", value: Number(capitalization.cushionCents) },
  ].filter((b) => b.value > 0);
  const capColor: Record<string, string> = {
    investments: BUCKET_INVEST,
    cash: BUCKET_SPEND,
    reserves: BUCKET_RESERVE,
    cushion: BUCKET_CUSHION,
  };

  // Centered underline tab — exact BDP wealth-section `toggle` style.
  const tab = (v: WealthView, label: string) => (
    <button
      type="button"
      onClick={() => {
        setView(v);
        if (v !== "investments") setNet(false);
      }}
      aria-pressed={view === v}
      data-testid={`aggregate-view-${v}`}
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
    <section className={CARD} data-testid="aggregate-trend">
      {/* Capitalization/Investments — centered underline tabs (BDP parity). */}
      <div role="group" className="flex items-center justify-center gap-1">
        {tab("capitalization", t("capitalization"))}
        {tab("investments", t("investments"))}
      </div>

      {isPending || !data || !hasSeries ? (
        <div
          className="mt-3 flex h-[220px] items-center justify-center text-caption text-[var(--muted-foreground)]"
          data-testid="aggregate-trend-empty"
        >
          {isPending ? "" : t("empty")}
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2">
            {/* Range-scoped growth stats — centered, like BDP. */}
            <div className="flex flex-wrap items-start justify-center gap-6">
              <div className="flex flex-col items-center gap-0.5">
                <p className="text-caption text-[var(--muted-foreground)]">
                  {up ? t("grow") : t("loss")}
                </p>
                <span
                  className={cn(
                    "num text-num-md",
                    up
                      ? "text-[var(--trading-up)]"
                      : "text-[var(--trading-down)]",
                  )}
                  data-testid="aggregate-trend-grow"
                >
                  <SlotAmount value={fmtSigned(data.grow.delta_cents)} />
                </span>
              </div>
              <PctStat label={t("grow")} pct={data.grow.delta_pct} />
              {view === "investments" && data.invested_cents != null && (
                <div className="flex flex-col items-center gap-0.5">
                  <p className="text-caption text-[var(--muted-foreground)]">
                    {t("invested")}
                  </p>
                  <span className="num text-num-md text-[var(--body-on-dark)]">
                    <SlotAmount value={fmt(data.invested_cents)} />
                  </span>
                </div>
              )}
            </div>

            {/* Incl./Excl.-contributions — segmented control (BDP style). */}
            {view === "investments" && investedPositive && (
              <div
                role="group"
                data-testid="aggregate-net-toggle"
                className="mx-auto inline-flex rounded-full border border-[var(--hairline-dark)] p-0.5 text-caption"
              >
                <button
                  type="button"
                  onClick={() => setNet(false)}
                  aria-pressed={!net}
                  className={cn(
                    "rounded-full px-3 py-1 transition-colors",
                    !net
                      ? "bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                      : "text-[var(--muted-foreground)]",
                  )}
                >
                  {t("incl_contributions")}
                </button>
                <button
                  type="button"
                  onClick={() => setNet(true)}
                  aria-pressed={net}
                  className={cn(
                    "rounded-full px-3 py-1 transition-colors",
                    net
                      ? "bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                      : "text-[var(--muted-foreground)]",
                  )}
                >
                  {t("excl_contributions")}
                </button>
              </div>
            )}

            {/* Growth is over the SELECTED range ("since month start" on 1M). */}
            <p className="-mt-1 text-center text-caption text-[var(--muted-foreground)]">
              {t("grow_since", { preset: range.preset })}
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
                    view === "investments"
                      ? t("investments")
                      : t("capitalization"),
                },
              ]}
              formatY={chartCompactCents}
              formatTooltip={(n) => fmt(String(Math.round(n)))}
              xTickFormat={(v) => formatChartDate(String(v), locale)}
              maskAmounts
            />
          </div>

          {/* Avg change (dynamics) — per-bucket % change bar chart, green/red
              split like BDP. Y-axis is %, so it stays visible; the tooltip's
              money delta is masked with the shared reveal. */}
          {dynamics.length > 0 && (
            <div
              className="mt-3 flex flex-col gap-2"
              data-testid="aggregate-dynamics"
            >
              <div className="flex flex-wrap items-start justify-center gap-6">
                <PctStat label={t("avg_change")} pct={avgPct} />
              </div>
              <OverviewBarChart
                data={dynamics.map((d) => ({
                  label: d.label,
                  pct: d.pct ?? 0,
                  raw: d.pct,
                  delta_cents: d.delta_cents,
                }))}
                xKey="label"
                series={[{ key: "pct", label: "" }]}
                colorByPoint={(row) =>
                  row.raw === null ? NEUTRAL : Number(row.pct) >= 0 ? UP : DOWN
                }
                formatValue={pctAxisTick}
                formatTooltip={fmtSignedPct}
                tooltipExtra={(row) => {
                  const amt = fmtSigned(
                    String(Math.round(Number(row.delta_cents ?? 0))),
                  );
                  return [
                    { label: "", value: revealed ? amt : maskDigits(amt) },
                  ];
                }}
                xTickFormat={(v) => formatChartDate(String(v), locale)}
                labelFormat={(v) => formatChartDate(String(v), locale)}
              />
            </div>
          )}

          {/* View-driven pie: capitalization pools vs per-holding-type. */}
          {view === "capitalization" && capBuckets.length > 0 && (
            <div
              className="mt-3 flex flex-col gap-2"
              data-testid="aggregate-cap-pie"
            >
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("by_bucket")}
              </p>
              <OverviewPieChart
                data={capBuckets}
                nameKey="name"
                valueKey="value"
                colorFor={(n: string) => capColor[n] ?? NEUTRAL}
                formatName={(n: string) => t(n === "cushion" ? "cushion" : n)}
                formatValue={fmtPieValue}
                allLabel={t("by_bucket")}
                maskValue
              />
            </div>
          )}
          {view === "investments" && (
            <div
              className="mt-3 flex flex-col gap-2"
              data-testid="aggregate-invest-pie"
            >
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("by_type")}
              </p>
              {data.pie && data.pie.length > 0 ? (
                <OverviewPieChart
                  data={data.pie.map((p) => ({
                    holding_type: p.holding_type,
                    value: Number(p.value_cents),
                  }))}
                  nameKey="holding_type"
                  valueKey="value"
                  colorFor={(ht: string) =>
                    UI_TYPE_COLOR[deriveUiType(ht, ht, false)]
                  }
                  formatName={(ht: string) =>
                    tInvest(`uitype.${deriveUiType(ht, ht, false)}`)
                  }
                  formatValue={fmtPieValue}
                  allLabel={t("by_type")}
                  maskValue
                />
              ) : (
                <p className="text-num-sm text-[var(--muted-foreground)]">
                  {t("empty")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
