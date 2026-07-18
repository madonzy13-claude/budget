"use client";
/**
 * aggregate-trend.tsx — combined net-worth-over-time for the all-budgets page.
 * Mirrors the BDP Overview wealth section: a range selector (1M/3M/6M/1Y/All +
 * custom) driving an AREA chart with the same month/date label formatting, plus
 * a range-scoped grow badge (amount + signed %). The window ([from,to]) is sent
 * to GET /budgets/aggregate/wealth, which returns the summed, share-scaled,
 * FX-converted series + grow.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { RangeSelector } from "@/components/budgeting/overview/range-selector";
import { makeRange, type OverviewRange } from "@/lib/overview-range";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { formatChartDate } from "@/lib/chart-date-format";
import { chartCompactCents } from "@/lib/chart-format";
import { centsToRounded } from "@/lib/cents-format";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function GrowBadge({
  delta_cents,
  delta_pct,
  ccy,
  locale,
}: {
  delta_cents: string;
  delta_pct: number;
  ccy: string;
  locale: string;
}) {
  const up = Number(delta_cents) >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "var(--trading-up)" : "var(--trading-down)";
  return (
    <span
      className="flex items-center gap-1 text-caption"
      style={{ color }}
      data-testid="aggregate-trend-grow"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="num">
        {up ? "+" : ""}
        {delta_pct.toFixed(1)}%
      </span>
      <span className="num">
        {centsToRounded(BigInt(delta_cents), ccy, locale, true)}
      </span>
    </span>
  );
}

export function AggregateTrend({ includeIds }: { includeIds: string[] }) {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const tz = useUserTimezone();
  const [range, setRange] = useState<OverviewRange>(() =>
    makeRange("last6Months", tz),
  );
  const { data, isPending } = useAggregateWealth(
    includeIds,
    range.from,
    range.to,
  );

  const hasSeries = !!data && data.series.length > 0;

  return (
    <section className={CARD} data-testid="aggregate-trend">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--body)]">
          {t("trend_title")}
        </p>
        {hasSeries && (
          <GrowBadge
            delta_cents={data.grow.delta_cents}
            delta_pct={data.grow.delta_pct}
            ccy={data.display_currency}
            locale={locale}
          />
        )}
      </div>

      <div className="mt-2">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {isPending || !data || !hasSeries ? (
        <div
          className="flex h-[220px] items-center justify-center text-caption text-[var(--muted-foreground)]"
          data-testid="aggregate-trend-empty"
        >
          {isPending ? "" : t("empty")}
        </div>
      ) : (
        <OverviewAreaChart
          data={data.series.map((p) => ({
            label: p.label,
            value: Number(p.value_cents),
          }))}
          xKey="label"
          series={[{ key: "value", label: t("trend_title") }]}
          formatY={chartCompactCents}
          formatTooltip={(n) =>
            centsToRounded(
              BigInt(Math.round(n)),
              data.display_currency,
              locale,
              true,
            )
          }
          xTickFormat={(v) => formatChartDate(String(v), locale)}
          height={220}
        />
      )}
    </section>
  );
}
