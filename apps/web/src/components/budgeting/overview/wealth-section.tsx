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
import { PL_TONE_CLASS, plPctDecimals, plSign, plTone } from "@/lib/pl-tone";
import { capitalizationBuckets } from "@/lib/cap-buckets";
import { OverviewSection } from "./overview-section";
import { CombinedStat } from "./combined-stat";
import {
  usePersistedSectionOpen,
  useBdpUiStore,
} from "@/components/budgeting/bdp-ui-state";
import { useStagedWarmup } from "@/hooks/use-staged-warmup";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { seriesGrowth } from "@/lib/series-growth";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import {
  SlotAmount,
  useSlotReveal,
} from "@/components/budgeting/overview/slot-amount";
import {
  useOverviewWealth,
  type WealthView,
} from "@/hooks/use-overview-wealth";
import { useOverviewCards } from "@/hooks/use-overview-cards";
import { centsToRounded } from "@/lib/cents-format";
import { selectRangeGrowth } from "@/lib/wealth-growth";
import { chartCompactCents, pctAxisTick } from "@/lib/chart-format";
import { UI_TYPE_COLOR } from "@/lib/investment-icons";
import { deriveUiType } from "@/lib/investment-types";
import { formatChartDate } from "@/lib/chart-date-format";
import type { OverviewRange } from "@/lib/overview-range";

const UP = "var(--trading-up)";
const DOWN = "var(--trading-down)";
const NEUTRAL = "var(--muted-foreground)";

function PctStat({
  label,
  pct,
  mask = false,
}: {
  label: string;
  pct: number | null;
  mask?: boolean;
}) {
  // Three-state: no movement is 0, which is neither a gain nor a loss.
  const dir = plTone(pct);
  const Arrow = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : null;
  const pctStr =
    pct === null
      ? ""
      : `${plSign(dir, "−")}${Math.abs(pct).toFixed(plPctDecimals(pct))}%`;
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
            {mask ? <SlotAmount value={pctStr} /> : pctStr}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * CombinedStat — one metric shown as % (primary, coloured up/down) with its money
 * amount stacked beneath in MUTED grey (secondary). Only the % carries colour so a
 * row of these reads calmly instead of two stacked coloured figures fighting.
 */
export function WealthSection({
  budgetId,
  range,
  investmentsEnabled = true,
  amountPrivacyEnabled = true,
}: {
  budgetId: string;
  range: OverviewRange;
  investmentsEnabled?: boolean;
  amountPrivacyEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  // Investment type labels (uitype.*) live under budget.investments — same source
  // the add-investment type dropdown uses, so the pie reads identically.
  const tInvest = useTranslations("budget.investments");
  const locale = useLocale();
  const [open, toggleOpen] = usePersistedSectionOpen("wealth");
  // Last wave: the wealth series is the heaviest query on the page, so it goes
  // behind the others rather than in front of them (260806).
  const warm = useStagedWarmup(3, { now: open });
  // View persists across pill navigation (the carousel unmounts this pane, so a
  // plain useState would reset to Capitalization on return). Backed by the shared
  // BdpUiStore ref like range / open-sections.
  const store = useBdpUiStore();
  const [view, setViewState] = useState<WealthView>(
    () => store?.overview.wealthView ?? "capitalization",
  );
  const setView = (v: WealthView) => {
    if (store) store.overview.wealthView = v;
    setViewState(v);
  };
  // Investments off → no per-type view to switch to: capitalization-only (the
  // toggle is hidden below), regardless of any prior selection.
  const effectiveView: WealthView = investmentsEnabled
    ? view
    : "capitalization";
  // Investments view now STACKS contributions + profit, so we always fetch the
  // TOTAL (incl) series here + a SECOND market-only (excl-contributions) series
  // below; profit = excl, contributions = incl − excl.
  // The investments-only series is a second query on the heaviest endpoint, so
  // it takes its own wave behind the totals one.
  const warmExcl = useStagedWarmup(4, {
    now: open && effectiveView === "investments",
  });
  const { data, isPending, isError } = useOverviewWealth(budgetId, {
    from: range.from,
    to: range.to,
    view: effectiveView,
    enabled: warm,
    net: false,
  });
  const exclQ = useOverviewWealth(budgetId, {
    from: range.from,
    to: range.to,
    view: "investments",
    // Warmed whichever view is showing (260806): gating this on the investments
    // view meant switching to it cost a fetch, and offline it had nothing at
    // all. A wave later than the totals series so the two do not go together.
    enabled: warmExcl,
    net: true,
  });
  const exclByLabel = new Map<string, number>();
  for (const p of exclQ.data?.series ?? [])
    exclByLabel.set(p.label, Number(p.value_cents));

  const ccy = data?.currency ?? "USD";
  // Overview shows NO cents anywhere (round to whole units).
  const fmtRounded = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);
  // Signed, sign-tight, no cents: "+30,640 zł" / "−30,640 zł".
  const fmtSigned = (cents: string | bigint) => {
    // BigInt() throws on "NaN"/"1.5" — a single dynamics bucket missing its
    // delta_cents would otherwise take the whole Wealth section down with it.
    // Non-finite → treat as zero.
    const n = typeof cents === "bigint" ? cents : Number(cents);
    const b =
      typeof n === "bigint"
        ? n
        : Number.isFinite(n)
          ? BigInt(Math.round(n))
          : 0n;
    const sign = b > 0n ? "+" : b < 0n ? "−" : "";
    return `${sign}${centsToRounded(b < 0n ? -b : b, ccy, "en", true)}`;
  };
  const fmtSignedPct = (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
  // Chart AXIS: bare + COMPACT ("82K", "1M") — no currency (r24 items 5/7).
  const fmtY = chartCompactCents;
  // Chart TOOLTIP (on tap): the FULL value WITH currency, no cents.
  const fmtTooltip = (n: number) => fmtRounded(BigInt(Math.round(n)));
  // Privacy (r41, BDP-wide): `revealed` masks the dynamics tooltip's money delta
  // to "•••". Inline metric amounts mask via CombinedStat's own `mask` prop.
  const { revealed } = useSlotReveal();
  // Pie centre read-out: whole currency, NO cents.
  const fmtPieValue = (n: number) => fmtRounded(BigInt(Math.round(n)));

  // Capitalization pie: where the money sits — investments / spendings-wallets /
  // reserves-wallets / cushion. Sourced from the (already-prefetched) overview
  // cards; zero pools are dropped so the pie only shows what's actually held.
  const cards = useOverviewCards(budgetId).data;
  const capBuckets = cards ? capitalizationBuckets(cards, t) : [];
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
          // FW growth must match the RENDERED chart: opening-seeded start for the
          // shorter presets (grow_from_open), first-real-value start for "all"
          // (grow) — "all" trims the leading $0 buckets below, so grow_from_open's
          // $0 baseline would show an empty % and the whole end value as "growth".
          const growth = selectRangeGrowth(range.preset, data);
          // "All": drop the leading zero buckets before the first real snapshot so
          // the timeline starts at the first non-zero value, not a flat run of zeros
          // stretching back to the 5-year cap (item 9). Only for the "all" preset —
          // the shorter presets intentionally seed the opening value.
          const seriesPoints =
            range.preset === "all"
              ? (() => {
                  const first = data.series.findIndex(
                    (p) => Number(p.value_cents) !== 0,
                  );
                  return first > 0 ? data.series.slice(first) : data.series;
                })()
              : data.series;
          // Investments stack: contributions (incl − excl) grey + profit (excl)
          // yellow, aligned to the rendered (trimmed) points by label.
          const investStack =
            effectiveView === "investments"
              ? seriesPoints.map((p) => {
                  const incl = Number(p.value_cents);
                  const excl = exclByLabel.get(p.label) ?? 0;
                  return {
                    label: p.label,
                    contributions: incl - excl,
                    profit: excl,
                  };
                })
              : [];
          return (
            <>
              {/* VALUE chart + its RANGE-scoped metric: total growth over the whole
              selected range (r27 item 2 — the metric lives with the chart it
              measures, so it's clear it analyzes the range, not a single period). */}
              <div className="flex flex-col gap-2">
                {(() => {
                  const up = Number(growth.delta_cents) >= 0;
                  // Investments view → three combined metrics, all measured as the
                  // RENDERED chart's first tick → last tick difference (same logic):
                  //   Total         = value(last) − value(first).  [correct as-is]
                  //   P/L           = profit(last) − profit(first). (profit = value −
                  //                   contributions per point)
                  //   Contributions = contributions(last) − contributions(first).
                  // Capitalization has no P/L split → single grow/loss metric.
                  const invMetrics =
                    effectiveView === "investments" &&
                    exclQ.data &&
                    seriesPoints.length > 0
                      ? (() => {
                          const n = seriesPoints.length;
                          const vFirst = Number(seriesPoints[0].value_cents);
                          const vLast = Number(seriesPoints[n - 1].value_cents);
                          const pFirst =
                            exclByLabel.get(seriesPoints[0].label) ?? 0;
                          const pLast =
                            exclByLabel.get(seriesPoints[n - 1].label) ?? 0;
                          const cFirst = vFirst - pFirst; // contributions @ start
                          const cLast = vLast - pLast; //    contributions @ end
                          const plDelta = pLast - pFirst; // P/L gained over the range
                          const contribDelta = cLast - cFirst;
                          // P/L = the REAL P/L for the selected range: profit gained
                          // over the range (last − first), as a % of the contributed
                          // value at the range start. Range-aware (1M shows just that
                          // month), and based on contributed value — not the first P/L.
                          return {
                            plAmount: Math.round(plDelta),
                            plPct:
                              cFirst !== 0 ? (100 * plDelta) / cFirst : null,
                            contribDelta: Math.round(contribDelta),
                            contribPct:
                              cFirst !== 0
                                ? (100 * contribDelta) / cFirst
                                : null,
                          };
                        })()
                      : null;
                  return (
                    <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-2">
                      {invMetrics ? (
                        <>
                          <CombinedStat
                            label={t("wealth.contributions")}
                            pct={invMetrics.contribPct}
                            amount={fmtSigned(String(invMetrics.contribDelta))}
                            mask={amountPrivacyEnabled}
                          />
                          <CombinedStat
                            label={t("wealth.pl")}
                            pct={invMetrics.plPct}
                            amount={fmtSigned(String(invMetrics.plAmount))}
                            mask={amountPrivacyEnabled}
                          />
                          <CombinedStat
                            label={t("wealth.total")}
                            pct={growth.delta_pct}
                            amount={fmtSigned(growth.delta_cents)}
                            mask={amountPrivacyEnabled}
                          />
                        </>
                      ) : (
                        <CombinedStat
                          label={up ? t("wealth.grow") : t("wealth.loss")}
                          pct={growth.delta_pct}
                          amount={fmtSigned(growth.delta_cents)}
                          mask={amountPrivacyEnabled}
                        />
                      )}
                    </div>
                  );
                })()}
                {investStack.length > 0 ? (
                  // Stacked like the planned needs/wants chart: contributions
                  // (grey) + profit (yellow) sum to the total investment value.
                  <OverviewAreaChart
                    data={investStack}
                    xKey="label"
                    series={[
                      {
                        key: "contributions",
                        label: t("wealth.contributions"),
                        color: "var(--muted-foreground)",
                        stack: "inv",
                        fillOpacity: 0.3,
                      },
                      {
                        key: "profit",
                        label: t("wealth.pl"),
                        color: "var(--primary)",
                        stack: "inv",
                        fillOpacity: 0.35,
                      },
                    ]}
                    formatY={fmtY}
                    formatTooltip={fmtTooltip}
                    xTickFormat={(v) => formatChartDate(v, locale)}
                    maskAmounts={amountPrivacyEnabled}
                    // Each row = three aligned columns: absolute amount (value) +
                    // growth % + growth AMOUNT, both measured from the range start to
                    // the hovered tick (so they match the headline metrics at the last
                    // tick). Contributions & P/L ÷ contributions@start. % and amount
                    // both mask under privacy.
                    rowSuffix={(row, key) => {
                      const f = investStack[0];
                      if (!f) return undefined;
                      const cBase = Number(f.contributions);
                      if (cBase === 0) return undefined;
                      const delta =
                        key === "contributions"
                          ? Number(row.contributions) - cBase
                          : Number(row.profit) - Number(f.profit);
                      const hidden = amountPrivacyEnabled && !revealed;
                      return [
                        hidden ? "•••" : fmtSignedPct((100 * delta) / cBase),
                        hidden ? "•••" : fmtSigned(String(Math.round(delta))),
                      ];
                    }}
                    // Total = contributions + profit, aligned in the same columns:
                    // absolute + growth % + growth amount (÷ value@start).
                    summary={(row) => {
                      const total =
                        Number(row.contributions ?? 0) +
                        Number(row.profit ?? 0);
                      const f = investStack[0];
                      const vBase = f
                        ? Number(f.contributions) + Number(f.profit)
                        : 0;
                      const hidden = amountPrivacyEnabled && !revealed;
                      const dTotal = total - vBase;
                      return {
                        label: t("wealth.total"),
                        value: hidden ? "•••" : fmtTooltip(total),
                        suffix:
                          vBase === 0
                            ? []
                            : [
                                hidden
                                  ? "•••"
                                  : fmtSignedPct((100 * dTotal) / vBase),
                                hidden
                                  ? "•••"
                                  : fmtSigned(String(Math.round(dTotal))),
                              ],
                      };
                    }}
                  />
                ) : (
                  <OverviewAreaChart
                    data={seriesPoints.map((p) => ({
                      label: p.label,
                      value: Number(p.value_cents),
                    }))}
                    xKey="label"
                    series={[
                      { key: "value", label: t("wealth.capitalization") },
                    ]}
                    formatY={fmtY}
                    formatTooltip={fmtTooltip}
                    xTickFormat={(v) => formatChartDate(v, locale)}
                    maskAmounts={amountPrivacyEnabled}
                    // Same three columns the investments view has always had:
                    // the value, then how far it has moved since the range
                    // started — in percent and in money (user, 260804).
                    rowSuffix={(row) => {
                      const g = seriesGrowth(
                        Number(seriesPoints[0]?.value_cents ?? 0),
                        Number(row.value),
                      );
                      if (!g) return undefined;
                      const hidden = amountPrivacyEnabled && !revealed;
                      return [
                        hidden ? "•••" : fmtSignedPct(g.pct),
                        hidden
                          ? "•••"
                          : fmtSigned(String(Math.round(g.deltaCents))),
                      ];
                    }}
                  />
                )}
              </div>

              {/* CHANGE chart + its PER-PERIOD metric: the average change AT THIS
              bucket — daily on 1M, monthly on 3M…1Y, yearly beyond. The label
              carries the granularity so day-vs-month averages aren't confused. */}
              {data.dynamics.length > 0 &&
                (effectiveView === "investments" ? (
                  (() => {
                    // Combined avg-change (user request): two bars per period —
                    // TOTAL value change (grey, = contributions + profit) and P/L
                    // change (yellow, excl. contributions) — so deposits don't
                    // masquerade as performance. P/L dynamics come from the net
                    // (excl) query already fetched above, aligned by label.
                    const plByLabel = new Map<
                      string,
                      { pct: number | null; delta: string }
                    >();
                    for (const d of exclQ.data?.dynamics ?? [])
                      plByLabel.set(d.label, {
                        pct: d.pct,
                        delta: d.delta_cents,
                      });
                    // Contribution dynamics = total − P/L per bucket. Delta is exact
                    // (totalDelta − plDelta); the % is derived from each series' own
                    // base (base = delta ÷ pct), so contrib% = contribΔ ÷ contribBase.
                    const contribPctList: (number | null)[] = [];
                    const combined = data.dynamics.map((d) => {
                      const pl = plByLabel.get(d.label);
                      const totalDelta = Number(d.delta_cents);
                      const plDelta = Number(pl?.delta ?? "0");
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
                        totalDelta: d.delta_cents,
                        pl: pl?.pct ?? 0,
                        plDelta: pl?.delta ?? "0",
                        contrib: contribPct ?? 0,
                        contribDelta: String(Math.round(contribDelta)),
                      };
                    });
                    // Avg contribution change — geometric mean of the per-period
                    // contribution %s (matches the server's total/profit averages).
                    const contribAvg = ((): number | null => {
                      const nn = contribPctList.filter(
                        (p): p is number => p !== null,
                      );
                      if (nn.length === 0) return null;
                      const product = nn.reduce((a, p) => a * (1 + p / 100), 1);
                      if (product < 0) return null;
                      return (Math.pow(product, 1 / nn.length) - 1) * 100;
                    })();
                    const mask = amountPrivacyEnabled && !revealed;
                    // Amount companion to each avg-change %: the AVERAGE per-period
                    // money change (mean of the bucket deltas).
                    const meanAmt = (
                      key: "totalDelta" | "plDelta" | "contribDelta",
                    ) =>
                      combined.length === 0
                        ? 0
                        : Math.round(
                            combined.reduce(
                              (s, c) => s + Number(c[key] || 0),
                              0,
                            ) / combined.length,
                          );
                    return (
                      <div className="flex flex-col gap-2">
                        {/* One common header (was a per-metric "Avg change ·" prefix). */}
                        <p className="text-center text-caption text-[var(--muted-foreground)]">
                          {t("wealth.monthlyAvg")}
                        </p>
                        <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-2">
                          <CombinedStat
                            label={t("wealth.contributions")}
                            pct={contribAvg}
                            amount={fmtSigned(String(meanAmt("contribDelta")))}
                            mask={amountPrivacyEnabled}
                          />
                          <CombinedStat
                            label={t("wealth.pl")}
                            pct={exclQ.data?.monthly_avg_grow_pct ?? null}
                            amount={fmtSigned(String(meanAmt("plDelta")))}
                            mask={amountPrivacyEnabled}
                          />
                          <CombinedStat
                            label={t("wealth.total")}
                            pct={data.monthly_avg_grow_pct}
                            amount={fmtSigned(String(meanAmt("totalDelta")))}
                            mask={amountPrivacyEnabled}
                          />
                        </div>
                        <OverviewBarChart
                          data={combined}
                          xKey="label"
                          // Bar order Contributions → P/L → Total, coloured grey /
                          // yellow / green so Total (the whole move) reads last.
                          series={[
                            {
                              key: "contrib",
                              label: t("wealth.contributions"),
                              color: "var(--muted-foreground)",
                            },
                            {
                              key: "pl",
                              label: t("wealth.pl"),
                              color: "var(--primary)",
                            },
                            {
                              key: "total",
                              label: t("wealth.total"),
                              color: "var(--trading-up)",
                            },
                          ]}
                          formatValue={pctAxisTick}
                          formatTooltip={fmtSignedPct}
                          maskAmounts={amountPrivacyEnabled}
                          // % and money amount on ONE line per series (item 1).
                          rowSuffix={(row, key) =>
                            mask
                              ? "•••"
                              : fmtSigned(
                                  String(
                                    (key === "total"
                                      ? row.totalDelta
                                      : key === "pl"
                                        ? row.plDelta
                                        : row.contribDelta) ?? "0",
                                  ),
                                )
                          }
                          xTickFormat={(v) => formatChartDate(v, locale)}
                          labelFormat={(v) => formatChartDate(v, locale)}
                        />
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-center gap-6">
                      <PctStat
                        label={t("wealth.monthlyAvg")}
                        pct={data.monthly_avg_grow_pct}
                        mask={amountPrivacyEnabled}
                      />
                    </div>
                    <OverviewBarChart
                      data={data.dynamics.map((d) => ({
                        label: d.label,
                        pct: d.pct ?? 0,
                        raw: d.pct,
                        delta_cents: d.delta_cents,
                      }))}
                      xKey="label"
                      // Empty series label → the tooltip shows just the % (no
                      // "Monthly change" text); the amount follows on its own line.
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
                      // The money change on its own line — signed, sign-tight, no cents,
                      // no label (just the % above and the amount below).
                      maskAmounts={amountPrivacyEnabled}
                      tooltipExtra={(row) => [
                        {
                          label: "",
                          value:
                            amountPrivacyEnabled && !revealed
                              ? "•••"
                              : fmtSigned(String(row.delta_cents ?? "0")),
                        },
                      ]}
                      xTickFormat={(v) => formatChartDate(v, locale)}
                      labelFormat={(v) => formatChartDate(v, locale)}
                    />
                  </div>
                ))}

              {/* Capitalization view: where the money is (investments / spendings
                  / reserves / cushion) — a static labeled pie. */}
              {effectiveView === "capitalization" && capBuckets.length > 0 && (
                <div
                  data-testid="overview-capitalization-pie"
                  className="flex flex-col gap-2"
                >
                  <p className="text-center text-caption text-[var(--muted-foreground)]">
                    {t("wealth.byBucket")}
                  </p>
                  <OverviewPieChart
                    data={capBuckets}
                    nameKey="name"
                    valueKey="value"
                    colorFor={(n) => capColorMap[n] ?? NEUTRAL}
                    formatValue={fmtPieValue}
                    allLabel={t("range.all")}
                    maskValue={amountPrivacyEnabled}
                  />
                </div>
              )}

              {/* Investments view: per-type pie (UI_TYPE_COLOR) */}
              {effectiveView === "investments" && (
                <div
                  data-testid="overview-wealth-pie"
                  className="flex flex-col gap-2"
                >
                  <p className="text-center text-caption text-[var(--muted-foreground)]">
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
                        UI_TYPE_COLOR[deriveUiType(ht, ht, false)]
                      }
                      // Human label (same as the add-investment type dropdown)
                      // instead of the raw underscored holding_type.
                      formatName={(ht) =>
                        tInvest(`uitype.${deriveUiType(ht, ht, false)}`)
                      }
                      formatValue={fmtPieValue}
                      allLabel={t("range.all")}
                      maskValue={amountPrivacyEnabled}
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
