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
import {
  usePersistedSectionOpen,
  useBdpUiStore,
} from "@/components/budgeting/bdp-ui-state";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
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

// Capitalization pie slice colors — 4 distinct pools of money.
const BUCKET_INVEST = "var(--chart-bar-1)"; // blue
const BUCKET_SPEND = "var(--primary)"; // yellow
const BUCKET_RESERVE = "var(--chart-bar-2)"; // teal
const BUCKET_CUSHION = "var(--chart-bar-3)"; // purple (distinct from teal)

function PctStat({
  label,
  pct,
  mask = false,
}: {
  label: string;
  pct: number | null;
  mask?: boolean;
}) {
  const up = pct !== null && pct >= 0;
  const down = pct !== null && pct < 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const pctStr =
    pct === null ? "" : `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
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
            {mask ? <SlotAmount value={pctStr} /> : pctStr}
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
  // Investments view: when on, fetch the NET-of-contributions series/growth/dynamics
  // (money paid in via the Investments category subtracted) → real market movement.
  const [net, setNet] = useState(false);

  const { data, isPending, isError } = useOverviewWealth(budgetId, {
    from: range.from,
    to: range.to,
    view: effectiveView,
    enabled: open,
    net: effectiveView === "investments" && net,
  });

  const ccy = data?.currency ?? "USD";
  // Overview shows NO cents anywhere (round to whole units).
  const fmtRounded = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);
  // Signed, sign-tight, no cents: "+30,640 zł" / "−30,640 zł".
  const fmtSigned = (cents: string | bigint) => {
    const b = BigInt(String(cents));
    const sign = b > 0n ? "+" : b < 0n ? "−" : "";
    return `${sign}${centsToRounded(b < 0n ? -b : b, ccy, "en", true)}`;
  };
  const fmtSignedPct = (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
  // Chart AXIS: bare + COMPACT ("82K", "1M") — no currency (r24 items 5/7).
  const fmtY = chartCompactCents;
  // Chart TOOLTIP (on tap): the FULL value WITH currency, no cents.
  const fmtTooltip = (n: number) => fmtRounded(BigInt(Math.round(n)));
  // Privacy (r41, BDP-wide): wrap any inline money figure in a masked SlotAmount
  // when enabled; `revealed` masks the dynamics tooltip's money delta to "•••".
  const { revealed } = useSlotReveal();
  const money = (s: string) =>
    amountPrivacyEnabled ? <SlotAmount value={s} /> : s;
  // Pie centre read-out: whole currency, NO cents.
  const fmtPieValue = (n: number) => fmtRounded(BigInt(Math.round(n)));

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
          return (
            <>
              {/* VALUE chart + its RANGE-scoped metric: total growth over the whole
              selected range (r27 item 2 — the metric lives with the chart it
              measures, so it's clear it analyzes the range, not a single period). */}
              <div className="flex flex-col gap-2">
                {(() => {
                  const up = Number(growth.delta_cents) >= 0;
                  // Investments view + an Investments category → show the "invested"
                  // metric; and, ONLY when there's something to exclude (invested >
                  // 0), the Incl./Excl.-contributions switch (otherwise it would look
                  // broken — nothing to net). `growth` already reflects the choice.
                  const hasInvestCat =
                    effectiveView === "investments" &&
                    data.invested_cents != null;
                  const canNet =
                    hasInvestCat && Number(data.invested_cents) > 0;
                  return (
                    <>
                      <div className="flex flex-wrap items-start justify-center gap-6">
                        <div className="flex flex-col items-center gap-0.5">
                          <p className="text-caption text-[var(--muted-foreground)]">
                            {up ? t("wealth.grow") : t("wealth.loss")}
                          </p>
                          <span
                            className={cn(
                              "num text-num-md",
                              up
                                ? "text-[var(--trading-up)]"
                                : "text-[var(--trading-down)]",
                            )}
                          >
                            {money(fmtSigned(growth.delta_cents))}
                          </span>
                        </div>
                        <PctStat
                          label={t("wealth.grow")}
                          pct={growth.delta_pct}
                          mask={amountPrivacyEnabled}
                        />
                        {/* Invested over the period (Investments-category spend). */}
                        {hasInvestCat && (
                          <div className="flex flex-col items-center gap-0.5">
                            <p className="text-caption text-[var(--muted-foreground)]">
                              {t("wealth.invested")}
                            </p>
                            <span className="num text-num-md text-[var(--body-on-dark)]">
                              {money(fmtRounded(data.invested_cents!))}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Total vs Market-only (net of contributions) — a clear
                          segmented switch; the active side is filled. Toggling
                          refetches so EVERY chart below updates too. */}
                      {canNet && (
                        <div
                          role="group"
                          className="mx-auto inline-flex rounded-full border border-[var(--hairline-dark)] p-0.5 text-caption"
                        >
                          <button
                            type="button"
                            data-testid="wealth-net-total"
                            onClick={() => setNet(false)}
                            aria-pressed={!net}
                            className={cn(
                              "rounded-full px-3 py-1 transition-colors",
                              !net
                                ? "bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                                : "text-[var(--muted-foreground)]",
                            )}
                          >
                            {t("wealth.inclContrib")}
                          </button>
                          <button
                            type="button"
                            data-testid="wealth-net-market"
                            onClick={() => setNet(true)}
                            aria-pressed={net}
                            className={cn(
                              "rounded-full px-3 py-1 transition-colors",
                              net
                                ? "bg-[var(--surface-elevated-dark)] text-[var(--body-on-dark)]"
                                : "text-[var(--muted-foreground)]",
                            )}
                          >
                            {t("wealth.exclContrib")}
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* Make explicit this growth is measured over the SELECTED period, e.g.
                "since month start" on 1M — not a daily figure (r28 correction). */}
                <p className="-mt-1 text-center text-caption text-[var(--muted-foreground)]">
                  {t("wealth.growSince", { preset: range.preset })}
                </p>
                <OverviewAreaChart
                  data={seriesPoints.map((p) => ({
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
                  maskAmounts={amountPrivacyEnabled}
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
