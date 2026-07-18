"use client";
/**
 * aggregate-trend.tsx — combined net-worth-over-time for the all-budgets page.
 * Mirrors the BDP Overview wealth section: a centered growth row (signed amount
 * + PctStat %) above an AREA chart with the same month/date label formatting.
 * The range comes from a SEPARATE selector owned by the parent (like BDP's band).
 */
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAggregateWealth } from "@/hooks/use-budgets-aggregate";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import type { OverviewRange } from "@/lib/overview-range";
import { formatChartDate } from "@/lib/chart-date-format";
import { chartCompactCents } from "@/lib/chart-format";
import { centsToRounded } from "@/lib/cents-format";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

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
            {`${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`}
          </>
        )}
      </span>
    </div>
  );
}

export function AggregateTrend({
  includeIds,
  range,
}: {
  includeIds: string[];
  range: OverviewRange;
}) {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending } = useAggregateWealth(
    includeIds,
    range.from,
    range.to,
  );

  const hasSeries = !!data && data.series.length > 0;
  const up = hasSeries ? Number(data.grow.delta_cents) >= 0 : true;
  const fmtSigned = (cents: string) => {
    const n = BigInt(cents);
    const abs = n < 0n ? -n : n;
    return `${n >= 0n ? "+" : "−"}${centsToRounded(abs, data!.display_currency, locale, true)}`;
  };

  return (
    <section className={CARD} data-testid="aggregate-trend">
      <p className="text-sm font-semibold text-[var(--body)]">
        {t("trend_title")}
      </p>

      {hasSeries && (
        <div className="mt-2 flex flex-wrap items-start justify-center gap-6">
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-caption text-[var(--muted-foreground)]">
              {up ? t("grow") : t("loss")}
            </p>
            <span
              className={cn(
                "num text-num-md",
                up ? "text-[var(--trading-up)]" : "text-[var(--trading-down)]",
              )}
              data-testid="aggregate-trend-grow"
            >
              {fmtSigned(data.grow.delta_cents)}
            </span>
          </div>
          <PctStat label={t("grow")} pct={data.grow.delta_pct} />
        </div>
      )}

      {isPending || !data || !hasSeries ? (
        <div
          className="flex h-[220px] items-center justify-center text-caption text-[var(--muted-foreground)]"
          data-testid="aggregate-trend-empty"
        >
          {isPending ? "" : t("empty")}
        </div>
      ) : (
        <div className="mt-2">
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
        </div>
      )}
    </section>
  );
}
