"use client";
/**
 * planned-section.tsx — Overview "Planned" section (11-09, SC4).
 *
 * Collapsible; lazy-fetches /overview/planned only when open. Renders the
 * Planned-vs-Real timeline (line: real solid yellow, planned dashed neutral), the
 * planned-avg-vs-real bar (Y=category), and the two recurring bars (per-month +
 * per-category, "current config" — NOT range-scoped, D-14). A category selector
 * (default = All categories) re-scopes the timeline. Charts via the 11-02 wrappers
 * only; string cents → Number here (recharts needs Numbers).
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { OverviewSection } from "./overview-section";
import { OverviewLineChart } from "@/components/budgeting/charts/line-chart";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { useOverviewPlanned } from "@/hooks/use-overview-planned";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { hexForColorKey } from "@/lib/category-colors";
import type { OverviewRange } from "@/lib/overview-range";

const NEUTRAL = "var(--muted-foreground)";

function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-[var(--muted-foreground)]">{children}</p>
  );
}

export function PlannedSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewPlanned(budgetId, {
    from: range.from,
    to: range.to,
    categoryId,
    enabled: open,
  });

  const ccy = data?.currency ?? "USD";
  const fmtY = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, locale);
  const colorOf = (id: string): string =>
    hexForColorKey(
      categories.find((c) => c.id === id)?.colorKey as string | undefined,
    ) ?? "var(--primary)";

  return (
    <OverviewSection
      testId="overview-section-planned"
      title={t("sections.planned")}
      open={open}
      onToggle={() => setOpen((o) => !o)}
    >
      <label className="flex items-center gap-2 text-num-sm text-[var(--muted-foreground)]">
        {t("planned.category")}
        <select
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || undefined)}
          className="rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-2 py-1 text-[var(--body-on-dark)]"
        >
          <option value="">{t("planned.allCategories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {isPending ? (
        <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
      ) : isError || !data ? (
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      ) : (
        <>
          {/* Planned-vs-Real timeline */}
          <div className="flex flex-col gap-2">
            {data.timeline.length === 0 ? (
              <p className="text-num-sm text-[var(--muted-foreground)]">
                {t("empty.planned")}
              </p>
            ) : (
              <OverviewLineChart
                data={data.timeline.map((p) => ({
                  label: p.label,
                  real: Number(p.real_cents),
                  planned: Number(p.planned_cents),
                }))}
                xKey="label"
                series={[
                  { key: "real", label: t("planned.real") },
                  {
                    key: "planned",
                    label: t("planned.planned"),
                    color: NEUTRAL,
                    dashed: true,
                  },
                ]}
                formatY={fmtY}
              />
            )}
          </div>

          {/* Planned-avg vs Real-avg by category */}
          {data.plannedAvgVsReal.length > 0 && (
            <div className="flex flex-col gap-2">
              <OverviewBarChart
                layout="vertical"
                data={data.plannedAvgVsReal.map((c) => ({
                  name: c.name,
                  real: Number(c.real_avg_cents),
                  planned: Number(c.planned_avg_cents),
                }))}
                xKey="name"
                series={[
                  { key: "real", label: t("planned.real") },
                  {
                    key: "planned",
                    label: t("planned.planned"),
                    color: NEUTRAL,
                  },
                ]}
                formatValue={fmtY}
              />
            </div>
          )}

          {/* Recurring per month — current config (NOT range-scoped, D-14) */}
          <div className="flex flex-col gap-2">
            <ChartLabel>
              {t("planned.recurringPerMonth")} · {t("range.currentConfig")}
            </ChartLabel>
            <OverviewBarChart
              data={data.recurringPerMonth.map((m) => ({
                month: String(m.month),
                planned: Number(m.planned_cents),
              }))}
              xKey="month"
              series={[{ key: "planned", label: t("planned.recurringPerMonth") }]}
              formatValue={fmtY}
            />
          </div>

          {/* Recurring per category — current config, bars in category colorKey */}
          {data.recurringPerCategory.length > 0 && (
            <div className="flex flex-col gap-2">
              <ChartLabel>
                {t("planned.recurringPerCategory")} · {t("range.currentConfig")}
              </ChartLabel>
              <OverviewBarChart
                layout="vertical"
                data={data.recurringPerCategory.map((c) => ({
                  name: c.name,
                  category_id: c.category_id,
                  planned: Number(c.planned_cents),
                }))}
                xKey="name"
                series={[
                  { key: "planned", label: t("planned.recurringPerCategory") },
                ]}
                colorByPoint={(row) => colorOf(String(row.category_id))}
                formatValue={fmtY}
              />
            </div>
          )}
        </>
      )}
    </OverviewSection>
  );
}
