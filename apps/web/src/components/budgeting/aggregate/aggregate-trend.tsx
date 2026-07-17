"use client";
/**
 * aggregate-trend.tsx — combined net-worth trend line for the aggregate
 * overview (Task 15). One series across every currently-included budget,
 * FX-converted server-side into `display_currency` (Task 9's
 * GET /budgets/aggregate/wealth). Fixed 6M range for v1 — no selector yet.
 */
import { useTranslations, useLocale } from "next-intl";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewLineChart } from "@/components/budgeting/charts/line-chart";
import { centsToRounded } from "@/lib/cents-format";
import { chartCompactCents } from "@/lib/chart-format";

export function AggregateTrend({ includeIds }: { includeIds: string[] }) {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending } = useAggregateWealth(includeIds, "6M");

  if (isPending || !data || data.series.length === 0) return null;

  const ccy = data.display_currency;
  const chartData = data.series.map((p) => ({
    label: p.label,
    value: Number(p.value_cents),
  }));

  return (
    <section
      data-testid="aggregate-trend"
      className="rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4"
    >
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("trend_title")}
      </p>
      <OverviewLineChart
        data={chartData}
        xKey="label"
        series={[{ key: "value", label: t("trend_title") }]}
        formatY={chartCompactCents}
        formatTooltip={(n) =>
          centsToRounded(BigInt(Math.round(n)), ccy, locale, true)
        }
        height={220}
      />
    </section>
  );
}
