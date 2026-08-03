"use client";
/**
 * recurring-section.tsx — Overview "Recurring payments" section (260803 request).
 *
 * The two recurring charts used to sit at the bottom of the Planned section,
 * behind everything else that section had grown. They are their own subject —
 * the bills that repeat, from the CURRENT configuration rather than the selected
 * range (D-14) — so they get their own collapsible.
 *
 * They come from the same /overview/planned payload the Planned section reads.
 * Asked for WITHOUT a category filter, which is the query Planned itself issues
 * unless the member has narrowed their timeline — so in the ordinary case both
 * sections share one request.
 */
import { useTranslations, useLocale } from "next-intl";
import { OverviewSection } from "./overview-section";
import { usePersistedSectionOpen } from "@/components/budgeting/bdp-ui-state";
import { OverviewAreaChart } from "@/components/budgeting/charts/area-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import { centsToRounded } from "@/lib/cents-format";
import { chartCompactCents } from "@/lib/chart-format";
import type { OverviewRange } from "@/lib/overview-range";

const NEUTRAL = "var(--muted-foreground)";

function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-center text-[var(--muted-foreground)]">
      {children}
    </p>
  );
}

export function RecurringSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const monthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  const shortMonthName = (m: string | number) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(2000, Number(m) - 1, 1),
    );
  const [open, toggleOpen] = usePersistedSectionOpen("recurring");
  const { data, isPending, isError } = useOverviewPlanned(budgetId, {
    from: range.from,
    to: range.to,
    enabled: open,
  });

  const ccy = data?.currency ?? "USD";
  const fmtY = chartCompactCents;
  const fmtTooltip = (n: number) =>
    centsToRounded(BigInt(Math.round(n)), ccy, "en", true);

  return (
    <OverviewSection
      testId="overview-section-recurring"
      title={t("sections.recurring")}
      open={open}
      onToggle={toggleOpen}
    >
      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      ) : (
        <>
          {/* Per month — current config (NOT range-scoped, D-14). */}
          <div className="flex flex-col gap-2">
            <ChartLabel>{t("planned.recurringPerMonth")}</ChartLabel>
            <OverviewAreaChart
              data={data.recurringPerMonth.map((m) => ({
                month: String(m.month),
                planned: Number(m.planned_cents),
                items: m.items,
              }))}
              xKey="month"
              // The tooltip repeats the series name under the month it already
              // names, so it drops the ", by month" the chart title needs.
              series={[{ key: "planned", label: t("planned.recurringSeries") }]}
              formatY={fmtY}
              formatTooltip={fmtTooltip}
              xTickFormat={shortMonthName}
              labelFormat={monthName}
              // 260731 (user decision): the CHARTS always show real numbers —
              // masking made the shapes unreadable. The blur stays on the hero
              // cards + totals, where a shoulder-surfer actually reads a figure.
              maskAmounts={false}
              // Each planned payment for the month (the series row has the total).
              tooltipExtra={(row) => {
                const items =
                  (row.items as { name: string; amount_cents: string }[]) ?? [];
                return items.map((it) => ({
                  label: it.name || "—",
                  value: fmtTooltip(Number(it.amount_cents)),
                }));
              }}
            />
          </div>

          {/* Per category — grey bars, highest first (recharts vertical renders
              the first row at the top). */}
          {data.recurringPerCategory.length > 0 && (
            <div className="flex flex-col gap-2">
              <ChartLabel>{t("planned.recurringPerCategory")}</ChartLabel>
              <OverviewBarChart
                layout="vertical"
                data={data.recurringPerCategory
                  .map((c) => ({
                    name: c.name,
                    planned: Number(c.planned_cents),
                  }))
                  .sort((a, b) => b.planned - a.planned)}
                xKey="name"
                series={[
                  {
                    key: "planned",
                    label: t("planned.recurringPerCategory"),
                    color: NEUTRAL,
                  },
                ]}
                formatValue={fmtY}
                formatTooltip={fmtTooltip}
                maskAmounts={false}
              />
            </div>
          )}
        </>
      )}
    </OverviewSection>
  );
}
