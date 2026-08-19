"use client";
/**
 * aggregate-trend.tsx — combined "Net worth over time" wealth section for the
 * all-budgets page. IDENTICAL look + logic to the single-budget BDP wealth
 * section (wealth-section.tsx):
 *   - Capitalization / Investments view toggle.
 *   - Investments: three combined metrics (Contributions · P/L · Total), a
 *     stacked contributions(grey)+profit(yellow) area with a 3-column tooltip
 *     (absolute · growth% · growth amount + a Total summary row), and an
 *     "Average change" section (Contributions · P/L · Total metrics + grouped
 *     bars grey/yellow/green).
 *   - Capitalization: a single grow/loss metric + "where it sits" pie.
 * The aggregate DTO has no dynamics/grow_from_open, so the change buckets are
 * computed client-side here (intraDynamics) — same intra-period logic as BDP.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PL_TONE_CLASS, plPctDecimals, plSign, plTone } from "@/lib/pl-tone";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { seriesGrowth } from "@/lib/series-growth";
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
const BUCKET_POSSESS = "var(--chart-bar-4)";
const NEUTRAL = "var(--muted-foreground)";
const UP = "var(--trading-up)";
const DOWN = "var(--trading-down)";

type WealthView = "capitalization" | "investments";

/** label + arrow + signed % (capitalization avg-change, no amount). */
function PctStat({ label, pct }: { label: string; pct: number | null }) {
  // Three-state: no movement is 0, which is neither a gain nor a loss.
  const dir = plTone(pct);
  const Arrow = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span
        className={cn(
          "num inline-flex items-center gap-1 text-num-md",
          PL_TONE_CLASS[dir],
        )}
      >
        {pct === null ? (
          "—"
        ) : (
          <>
            {Arrow && <Arrow className="size-3.5" aria-hidden="true" />}
            <SlotAmount
              value={`${plSign(dir, "−")}${Math.abs(pct).toFixed(plPctDecimals(pct))}%`}
            />
          </>
        )}
      </span>
    </div>
  );
}

/** % (primary, coloured up/down) with its money amount stacked beneath in MUTED
 *  grey — only the % carries colour (BDP CombinedStat parity). */
function CombinedStat({
  label,
  pct,
  amount,
}: {
  label: string;
  pct: number | null;
  amount: string;
}) {
  const dir = plTone(pct);
  const Arrow = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : null;
  const color = PL_TONE_CLASS[dir];
  const pctStr =
    pct === null
      ? "—"
      : `${plSign(dir, "−")}${Math.abs(pct).toFixed(plPctDecimals(pct))}%`;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span
        className={cn("num inline-flex items-center gap-1 text-num-md", color)}
      >
        {Arrow && <Arrow className="size-3.5" aria-hidden="true" />}
        <SlotAmount value={pctStr} />
      </span>
      <span className="num text-caption text-[var(--muted-foreground)]">
        <SlotAmount value={amount} />
      </span>
    </div>
  );
}

/** Geometric mean of the per-period %s — matches BDP's monthly_avg_grow_pct. */
function geoMean(pcts: (number | null)[]): number | null {
  const nn = pcts.filter((p): p is number => p !== null);
  if (nn.length === 0) return null;
  const product = nn.reduce((a, p) => a * (1 + p / 100), 1);
  if (product < 0) return null;
  return (Math.pow(product, 1 / nn.length) - 1) * 100;
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
    possessionsCents: string;
  };
}) {
  const t = useTranslations("aggregate");
  const tInvest = useTranslations("budget.investments");
  const locale = useLocale();
  const [view, setView] = useState<WealthView>("capitalization");
  const { data, isPending } = useAggregateWealth(
    includeIds,
    range.from,
    range.to,
    view,
    false,
  );
  const exclQ = useAggregateWealth(
    view === "investments" ? includeIds : [],
    range.from,
    range.to,
    "investments",
    true,
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
  const isInvest = view === "investments";
  // "All": drop the leading $0 buckets before the first real snapshot (BDP parity).
  const seriesPoints =
    data && range.preset === "all"
      ? (() => {
          const first = data.series.findIndex(
            (p) => Number(p.value_cents) !== 0,
          );
          return first > 0 ? data.series.slice(first) : data.series;
        })()
      : (data?.series ?? []);

  // Stacked investments (reuse incl + excl): contributions = incl − excl (grey),
  // profit = excl (yellow); they stack to the total value. Aligned by label.
  const exclByLabel = new Map<string, number>();
  for (const p of exclQ.data?.series ?? [])
    exclByLabel.set(p.label, Number(p.value_cents));
  const investStack =
    isInvest && data
      ? seriesPoints.map((p) => {
          const incl = Number(p.value_cents);
          const excl = exclByLabel.get(p.label) ?? 0;
          return { label: p.label, contributions: incl - excl, profit: excl };
        })
      : [];

  // Three metrics, first tick → last tick (BDP parity):
  //   Total         = value(last) − value(first).
  //   P/L           = profit(last) − profit(first) ÷ contributions@start (the
  //                   real P/L for the range).
  //   Contributions = contributions(last) − contributions(first).
  const invMetrics =
    isInvest && exclQ.data && seriesPoints.length > 0
      ? (() => {
          const n = seriesPoints.length;
          const vFirst = Number(seriesPoints[0].value_cents);
          const vLast = Number(seriesPoints[n - 1].value_cents);
          const pFirst = exclByLabel.get(seriesPoints[0].label) ?? 0;
          const pLast = exclByLabel.get(seriesPoints[n - 1].label) ?? 0;
          const cFirst = vFirst - pFirst;
          const cLast = vLast - pLast;
          return {
            totalDelta: Math.round(vLast - vFirst),
            totalPct: vFirst !== 0 ? (100 * (vLast - vFirst)) / vFirst : null,
            plDelta: Math.round(pLast - pFirst),
            plPct: cFirst !== 0 ? (100 * (pLast - pFirst)) / cFirst : null,
            contribDelta: Math.round(cLast - cFirst),
            contribPct: cFirst !== 0 ? (100 * (cLast - cFirst)) / cFirst : null,
          };
        })()
      : null;

  // Change-chart bucket by the range SPAN (BDP parity): day ≤1mo, month ≤1y, YEAR
  // beyond. INTRA-period: each bar = the period's own first→last value.
  const spanDays = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  const dynBucketLen = spanDays <= 31 ? 10 : spanDays <= 366 ? 7 : 4;
  const intraDynamics = (
    series: { label: string; value_cents: string }[] | undefined,
  ) => {
    const firstB = new Map<string, number>();
    const lastB = new Map<string, number>();
    const order: string[] = [];
    for (const p of [...(series ?? [])].sort((a, b) =>
      a.label.localeCompare(b.label),
    )) {
      const b = p.label.slice(0, dynBucketLen);
      if (!firstB.has(b)) {
        firstB.set(b, Number(p.value_cents));
        order.push(b);
      }
      lastB.set(b, Number(p.value_cents));
    }
    return order.map((b) => {
      const f = firstB.get(b)!;
      const l = lastB.get(b)!;
      return {
        label: b,
        pct: f === 0 ? null : ((l - f) / f) * 100,
        delta_cents: l - f,
      };
    });
  };
  const dynamics = hasSeries && data ? intraDynamics(data.series) : [];
  const dynamicsPL = isInvest ? intraDynamics(exclQ.data?.series) : [];
  const avgTotalPct = geoMean(dynamics.map((d) => d.pct));
  const avgPlPct = geoMean(dynamicsPL.map((d) => d.pct));
  const up = hasSeries ? Number(data.grow.delta_cents) >= 0 : true;

  const capBuckets = [
    { name: "investments", value: Number(capitalization.investmentsCents) },
    { name: "cash", value: Number(capitalization.cashCents) },
    { name: "reserves", value: Number(capitalization.reservesCents) },
    { name: "cushion", value: Number(capitalization.cushionCents) },
    { name: "possessions", value: Number(capitalization.possessionsCents) },
  ].filter((b) => b.value > 0);
  const capColor: Record<string, string> = {
    investments: BUCKET_INVEST,
    cash: BUCKET_SPEND,
    reserves: BUCKET_RESERVE,
    cushion: BUCKET_CUSHION,
    possessions: BUCKET_POSSESS,
  };

  const tab = (v: WealthView, label: string) => (
    <button
      type="button"
      onClick={() => setView(v)}
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
            {/* Range-scoped growth — Contributions · P/L · Total (investments) or
                a single grow/loss (capitalization). */}
            <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-2">
              {isInvest && invMetrics ? (
                <>
                  <CombinedStat
                    label={t("contributions")}
                    pct={invMetrics.contribPct}
                    amount={fmtSigned(String(invMetrics.contribDelta))}
                  />
                  <CombinedStat
                    label={t("pl")}
                    pct={invMetrics.plPct}
                    amount={fmtSigned(String(invMetrics.plDelta))}
                  />
                  <CombinedStat
                    label={t("total")}
                    pct={invMetrics.totalPct}
                    amount={fmtSigned(String(invMetrics.totalDelta))}
                  />
                </>
              ) : (
                <CombinedStat
                  label={up ? t("grow") : t("loss")}
                  pct={data.grow.delta_pct}
                  amount={fmtSigned(data.grow.delta_cents)}
                />
              )}
            </div>

            {isInvest && investStack.length > 0 ? (
              // Stacked: contributions (grey) + profit (yellow) sum to the total.
              <OverviewAreaChart
                data={investStack}
                xKey="label"
                series={[
                  {
                    key: "contributions",
                    label: t("contributions"),
                    color: "var(--muted-foreground)",
                    stack: "inv",
                    fillOpacity: 0.3,
                  },
                  {
                    key: "profit",
                    label: t("pl"),
                    color: "var(--primary)",
                    stack: "inv",
                    fillOpacity: 0.35,
                  },
                ]}
                formatY={chartCompactCents}
                formatTooltip={(n) => fmt(String(Math.round(n)))}
                xTickFormat={(v) => formatChartDate(String(v), locale)}
                maskAmounts
                // Each row = absolute · growth% · growth amount (from range start
                // to the hovered tick), % + amount both mask under privacy.
                rowSuffix={(row, key) => {
                  const f = investStack[0];
                  if (!f) return undefined;
                  const cBase = Number(f.contributions);
                  if (cBase === 0) return undefined;
                  const delta =
                    key === "contributions"
                      ? Number(row.contributions) - cBase
                      : Number(row.profit) - Number(f.profit);
                  return [
                    revealed ? fmtSignedPct((100 * delta) / cBase) : "•••",
                    revealed ? fmtSigned(String(Math.round(delta))) : "•••",
                  ];
                }}
                // Total = contributions + profit, aligned in the same columns.
                summary={(row) => {
                  const total =
                    Number(row.contributions ?? 0) + Number(row.profit ?? 0);
                  const f = investStack[0];
                  const vBase = f
                    ? Number(f.contributions) + Number(f.profit)
                    : 0;
                  const dTotal = total - vBase;
                  return {
                    label: t("total"),
                    value: revealed ? fmt(String(Math.round(total))) : "•••",
                    suffix:
                      vBase === 0
                        ? []
                        : [
                            revealed
                              ? fmtSignedPct((100 * dTotal) / vBase)
                              : "•••",
                            revealed
                              ? fmtSigned(String(Math.round(dTotal)))
                              : "•••",
                          ],
                  };
                }}
              />
            ) : (
              <OverviewAreaChart
                data={data.series.map((p) => ({
                  label: p.label,
                  value: Number(p.value_cents),
                }))}
                xKey="label"
                series={[{ key: "value", label: t("capitalization") }]}
                formatY={chartCompactCents}
                formatTooltip={(n) => fmt(String(Math.round(n)))}
                xTickFormat={(v) => formatChartDate(String(v), locale)}
                maskAmounts
                // Same three columns the investments view has: the value, then
                // how far it has moved since the range started (user, 260804).
                rowSuffix={(row) => {
                  const g = seriesGrowth(
                    Number(data.series[0]?.value_cents ?? 0),
                    Number(row.value),
                  );
                  if (!g) return undefined;
                  return [
                    revealed ? fmtSignedPct(g.pct) : "•••",
                    revealed
                      ? fmtSigned(String(Math.round(g.deltaCents)))
                      : "•••",
                  ];
                }}
              />
            )}
          </div>

          {/* Average change — Contributions · P/L · Total (investments) or a single
              metric (capitalization); grouped bars grey/yellow/green. */}
          {dynamics.length > 0 &&
            (isInvest ? (
              (() => {
                const plByLabel = new Map<
                  string,
                  { pct: number | null; delta: number }
                >();
                for (const d of dynamicsPL)
                  plByLabel.set(d.label, { pct: d.pct, delta: d.delta_cents });
                const contribPctList: (number | null)[] = [];
                const combined = dynamics.map((d) => {
                  const pl = plByLabel.get(d.label);
                  const totalDelta = d.delta_cents;
                  const plDelta = pl?.delta ?? 0;
                  const contribDelta = totalDelta - plDelta;
                  const totalBase =
                    d.pct != null && d.pct !== 0
                      ? (totalDelta * 100) / d.pct
                      : null;
                  const plBase =
                    pl?.pct != null && pl.pct !== 0
                      ? (plDelta * 100) / pl.pct
                      : null;
                  const contribBase =
                    totalBase != null && plBase != null
                      ? totalBase - plBase
                      : null;
                  const contribPct =
                    contribBase != null && contribBase !== 0
                      ? (contribDelta * 100) / contribBase
                      : null;
                  contribPctList.push(contribPct);
                  return {
                    label: d.label,
                    total: d.pct ?? 0,
                    totalDelta,
                    pl: pl?.pct ?? 0,
                    plDelta,
                    contrib: contribPct ?? 0,
                    contribDelta,
                  };
                });
                const avgContribPct = geoMean(contribPctList);
                const meanAmt = (
                  key: "totalDelta" | "plDelta" | "contribDelta",
                ) =>
                  combined.length === 0
                    ? 0
                    : Math.round(
                        combined.reduce((s, c) => s + Number(c[key] || 0), 0) /
                          combined.length,
                      );
                return (
                  <div
                    className="mt-3 flex flex-col gap-2"
                    data-testid="aggregate-dynamics"
                  >
                    <p className="text-center text-caption text-[var(--muted-foreground)]">
                      {t("avg_change")}
                    </p>
                    <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-2">
                      <CombinedStat
                        label={t("contributions")}
                        pct={avgContribPct}
                        amount={fmtSigned(String(meanAmt("contribDelta")))}
                      />
                      <CombinedStat
                        label={t("pl")}
                        pct={avgPlPct}
                        amount={fmtSigned(String(meanAmt("plDelta")))}
                      />
                      <CombinedStat
                        label={t("total")}
                        pct={avgTotalPct}
                        amount={fmtSigned(String(meanAmt("totalDelta")))}
                      />
                    </div>
                    <OverviewBarChart
                      data={combined}
                      xKey="label"
                      // Contributions (grey) → P/L (yellow) → Total (green).
                      series={[
                        {
                          key: "contrib",
                          label: t("contributions"),
                          color: "var(--muted-foreground)",
                        },
                        {
                          key: "pl",
                          label: t("pl"),
                          color: "var(--primary)",
                        },
                        {
                          key: "total",
                          label: t("total"),
                          color: "var(--trading-up)",
                        },
                      ]}
                      formatValue={pctAxisTick}
                      formatTooltip={fmtSignedPct}
                      maskAmounts
                      rowSuffix={(row, key) =>
                        revealed
                          ? fmtSigned(
                              String(
                                Math.round(
                                  Number(
                                    (key === "total"
                                      ? row.totalDelta
                                      : key === "pl"
                                        ? row.plDelta
                                        : row.contribDelta) ?? 0,
                                  ),
                                ),
                              ),
                            )
                          : "•••"
                      }
                      xTickFormat={(v) => formatChartDate(String(v), locale)}
                      labelFormat={(v) => formatChartDate(String(v), locale)}
                    />
                  </div>
                );
              })()
            ) : (
              <div
                className="mt-3 flex flex-col gap-2"
                data-testid="aggregate-dynamics"
              >
                <div className="flex flex-wrap items-start justify-center gap-6">
                  <PctStat label={t("avg_change")} pct={avgTotalPct} />
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
                    row.raw === null
                      ? NEUTRAL
                      : Number(row.pct) >= 0
                        ? UP
                        : DOWN
                  }
                  formatValue={pctAxisTick}
                  formatTooltip={fmtSignedPct}
                  maskAmounts
                  tooltipExtra={(row) => {
                    const amt = fmtSigned(
                      String(Math.round(Number(row.delta_cents ?? 0))),
                    );
                    return [{ label: "", value: revealed ? amt : "•••" }];
                  }}
                  xTickFormat={(v) => formatChartDate(String(v), locale)}
                  labelFormat={(v) => formatChartDate(String(v), locale)}
                />
              </div>
            ))}

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
          {isInvest && (
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
