"use client";
/**
 * aggregate-overview.tsx — cross-budget "all budgets" overview.
 *
 * Mirrors the single-budget BDP Overview tab: a net-worth hero banner (big
 * yellow figure + "incl. investments" sub-line + a day P/L block, like the
 * capitalization card) + a grid-cols-2 stat grid (cash / reserves / cushion /
 * this-month) + the wealth-composition pie + a SEPARATE range selector driving
 * the net-worth-over-time area chart + a Budgets & tasks banner.
 *
 * Only budgets the member INCLUDES are summed into the totals (`b.included`);
 * the Budgets & tasks banner lists ALL of the user's budgets. Every figure is
 * STRING cents already FX-converted into `display_currency` by the API.
 */
import { type ReactNode, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CircleAlert,
  CircleCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBudgetsAggregate,
  useAggregateWealth,
  type AggregateBudgetRow,
} from "@/hooks/use-budgets-aggregate";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";
import { centsToRounded } from "@/lib/cents-format";
import { AggregateComposition } from "@/components/budgeting/aggregate/aggregate-composition";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";
import { AggregateBudgetsTasks } from "@/components/budgeting/aggregate/aggregate-budgets-tasks";
import { RangeSelector } from "@/components/budgeting/overview/range-selector";
import { makeRange, todayInTz, type OverviewRange } from "@/lib/overview-range";
import { useUserTimezone } from "@/components/common/user-timezone-provider";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function sumCents(rows: AggregateBudgetRow[], key: keyof AggregateBudgetRow) {
  return rows.reduce((total, r) => total + BigInt(r[key] as string), 0n);
}

/** Mirrors overview-cards.tsx's heroFontClass. */
function heroFontClass(s: string): string {
  if (s.length >= 13) return "text-[28px] font-bold leading-[1.1]";
  if (s.length >= 10) return "text-[36px] font-bold leading-[1.1]";
  return "text-num-display";
}

/** A BDP-overview stat card: (optional icon +) caption label, a big figure, an
 *  optional sub-line — same shape/tokens as overview-cards' grid cards. */
function StatCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <section className={CARD}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      </div>
      <p className="num text-title-md mt-1 whitespace-nowrap text-[var(--body-on-dark)]">
        <SlotAmount value={value} />
      </p>
      {sub}
    </section>
  );
}

export function AggregateOverview() {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const tz = useUserTimezone();
  const { data, isPending, isError } = useBudgetsAggregate();

  // Hooks run unconditionally (before early returns). Range for the chart lives
  // here (a SEPARATE selector, like the BDP band) so it isn't merged into the
  // chart card. The day P/L reuses the wealth trend over a today-only window.
  const [range, setRange] = useState<OverviewRange>(() =>
    makeRange("last6Months", tz),
  );
  const today = todayInTz(tz).toString();
  const summableIds = (data?.budgets ?? [])
    .filter((b) => b.included && !b.fx_unavailable)
    .map((b) => b.id);
  const pl = useAggregateWealth(summableIds, today, today);

  if (isPending)
    return (
      <div className="mx-auto max-w-2xl p-4" data-testid="aggregate-loading" />
    );
  if (isError || !data) return null;

  const ccy = data.display_currency;
  const fmt = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);

  const summable = data.budgets.filter((b) => b.included && !b.fx_unavailable);
  const netWorth = sumCents(summable, "net_worth_cents");
  const investments = sumCents(summable, "investments_cents");
  const anyCushionBreached = summable.some((b) => b.cushion_breached);
  const heroValue = fmt(netWorth);

  const plGrow = pl.data && pl.data.series.length > 0 ? pl.data.grow : null;
  const plUp = plGrow ? Number(plGrow.delta_cents) >= 0 : false;
  const PlIcon = plUp ? TrendingUp : TrendingDown;

  return (
    <SlotRevealProvider>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* HERO — net worth (yellow) + incl. investments + day P/L (like BDP cap card) */}
        <section className={CARD} data-testid="aggregate-hero-card">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("hero_label")}
              </p>
              <p
                data-testid="aggregate-hero"
                className={`num ${heroFontClass(heroValue)}`}
                style={{ color: "var(--num-hero)" }}
              >
                <SlotAmount value={heroValue} />
              </p>
              {investments > 0n && (
                <p className="mt-0.5 text-caption text-[var(--muted-foreground)]">
                  {t("incl_investments")}{" "}
                  <span className="num text-[var(--body-on-dark)]">
                    <SlotAmount value={fmt(investments)} />
                  </span>
                </p>
              )}
            </div>
            {plGrow && (
              <div
                className={cn(
                  "text-caption flex shrink-0 flex-col items-end gap-0.5 text-right",
                  plUp
                    ? "text-[var(--trading-up)]"
                    : "text-[var(--trading-down)]",
                )}
                data-testid="aggregate-hero-pl"
              >
                <span className="num flex items-center gap-1">
                  <PlIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  {plUp ? "+" : ""}
                  {plGrow.delta_pct.toFixed(1)}%
                </span>
                <span className="num">
                  {plUp ? "+" : ""}
                  {fmt(plGrow.delta_cents)}
                </span>
                <span className="text-[10px] leading-tight text-[var(--muted-foreground)]">
                  {t("pl_today")}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* STAT GRID — equal-height cards (auto-rows-fr) */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3">
          <StatCard
            label={t("cash")}
            value={fmt(sumCents(summable, "cash_cents"))}
          />
          <StatCard
            label={t("reserves")}
            value={fmt(sumCents(summable, "reserves_cents"))}
          />
          <StatCard
            label={t("cushion")}
            value={fmt(sumCents(summable, "cushion_cents"))}
            icon={
              anyCushionBreached ? (
                <CircleAlert
                  className="size-4 shrink-0 text-[var(--trading-down)]"
                  aria-hidden="true"
                />
              ) : (
                <CircleCheck
                  className="size-4 shrink-0 text-[var(--trading-up)]"
                  aria-hidden="true"
                />
              )
            }
          />
          <StatCard
            label={t("flow_title")}
            value={fmt(sumCents(summable, "spent_month_cents"))}
            sub={
              <dl className="text-caption mt-1.5 flex items-center justify-between gap-2 text-[var(--muted-foreground)]">
                <dt>{t("left")}</dt>
                <dd className="num text-[var(--body-on-dark)]">
                  <SlotAmount
                    value={fmt(sumCents(summable, "left_month_cents"))}
                  />
                </dd>
              </dl>
            }
          />
        </div>

        {/* WEALTH COMPOSITION */}
        <AggregateComposition
          cashCents={sumCents(summable, "cash_cents").toString()}
          investmentsCents={investments.toString()}
          reservesCents={(
            sumCents(summable, "reserves_cents") +
            sumCents(summable, "cushion_cents")
          ).toString()}
          currency={ccy}
          locale={locale}
        />

        {/* RANGE SELECTOR — a SEPARATE piece (not inside the chart), like BDP's band */}
        <div className="py-1" data-testid="aggregate-range">
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {/* NET WORTH OVER TIME — growth row + area chart */}
        <AggregateTrend includeIds={summable.map((b) => b.id)} range={range} />

        {/* BUDGETS & TASKS — all budgets, each with its pending tasks */}
        <AggregateBudgetsTasks
          budgets={data.budgets.map((b) => ({ id: b.id, name: b.name }))}
        />

        {summable.length === 0 && (
          <p className="text-center text-caption text-[var(--muted-foreground)]">
            {t("empty")}
          </p>
        )}
      </div>
    </SlotRevealProvider>
  );
}
