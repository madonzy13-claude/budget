"use client";
/**
 * planned-avg-summary.tsx — the figures under the by-category bars (260805).
 *
 * The bars say WHICH categories drift and by how much, each one drawn from its
 * own average month. What they never say is what the month comes to, so a screen
 * of red bars could be 200 zł of drift or 2,000. This row answers that.
 *
 * Deliberately the same three-column shape as the totals under the timeline, and
 * the same banded gap: two questions with the same answer type should not be
 * read two different ways on one page. Never redacted, like every other planned
 * figure on the Overview — a plan is not a balance.
 */
import { useTranslations } from "next-intl";
import { CombinedStat } from "@/components/budgeting/overview/combined-stat";
import { varianceColor } from "@/components/budgeting/charts/diverging-bar-chart";
import { plannedAvgTotals, type PlannedAvgRow } from "@/lib/planned-avg-totals";

function Figure({
  testId,
  label,
  value,
}: {
  testId: string;
  label: string;
  value: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col items-center gap-0.5 text-center"
    >
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <span className="num text-num-sm whitespace-nowrap">{value}</span>
    </div>
  );
}

export function PlannedAvgSummary({
  rows,
  format,
}: {
  rows: readonly PlannedAvgRow[];
  format: (cents: number) => string;
}) {
  const t = useTranslations("bdp.tab.overview");
  const totals = plannedAvgTotals(rows);
  if (rows.length === 0) return null;

  const sign = totals.diffCents > 0 ? "+" : totals.diffCents < 0 ? "−" : "";

  return (
    <div
      data-testid="planned-avg-summary"
      className="grid grid-cols-3 items-start gap-x-3 gap-y-1"
    >
      <Figure
        testId="planned-avg-planned"
        label={t("planned.avgPlanned")}
        value={format(totals.plannedCents)}
      />
      <Figure
        testId="planned-avg-spent"
        label={t("planned.avgSpent")}
        value={format(totals.realCents)}
      />
      <CombinedStat
        testId="planned-avg-difference"
        label={t("planned.difference")}
        pct={totals.pct}
        amount={`${sign}${format(Math.abs(totals.diffCents))}`}
        // Banded by DISTANCE from plan, like the bars above: 50% under is as
        // much a planning miss as 50% over.
        color={totals.pct === null ? undefined : varianceColor(totals.pct)}
      />
    </div>
  );
}
