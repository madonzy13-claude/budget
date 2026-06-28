"use client";
/**
 * overspent-reserves-section.tsx — Overview "Overspent" + "Reserves" sections (11-09, SC5).
 *
 * Two independent collapsibles backed by the single /overview/overspent-reserves
 * endpoint (fetched lazily once either is open). Overspent is range-scoped (total
 * figure red when > 0 + by-category bar); Reserves is NOT range-scoped ("current").
 * By-category bars use each category's colorKey. Charts via 11-02 wrappers; string
 * cents → Number here.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { OverviewSection } from "./overview-section";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { useOverviewOverspent } from "@/hooks/use-overview-overspent";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToDisplay, centsToDisplayCompact } from "@/lib/cents-format";
import { hexForColorKey } from "@/lib/category-colors";
import type { OverviewRange } from "@/lib/overview-range";

export function OverspentReservesSection({
  budgetId,
  range,
}: {
  budgetId: string;
  range: OverviewRange;
}) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const [overspentOpen, setOverspentOpen] = useState(false);
  const [reservesOpen, setReservesOpen] = useState(false);

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewOverspent(budgetId, {
    from: range.from,
    to: range.to,
    enabled: overspentOpen || reservesOpen,
  });

  const ccy = data?.currency ?? "USD";
  const fmtY = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, locale);
  const colorOf = (id: string): string =>
    hexForColorKey(
      categories.find((c) => c.id === id)?.colorKey as string | undefined,
    ) ?? "var(--primary)";

  const loading = isPending && (overspentOpen || reservesOpen);
  const failed = isError || !data;

  return (
    <>
      <OverviewSection
        testId="overview-section-overspent"
        title={t("sections.overspent")}
        open={overspentOpen}
        onToggle={() => setOverspentOpen((o) => !o)}
      >
        {loading ? (
          <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
        ) : failed || data.overspent_by_category.length === 0 ? (
          <p className="text-num-sm text-[var(--muted-foreground)]">
            {t("empty.overspent")}
          </p>
        ) : (
          <>
            <p className="num text-display-sm text-[var(--trading-down)]">
              {centsToDisplay(data.overspent_total_cents, ccy, locale)}
            </p>
            <OverviewBarChart
              layout="vertical"
              data={data.overspent_by_category.map((c) => ({
                name: c.name,
                category_id: c.category_id,
                overspent: Number(c.overspent_cents),
              }))}
              xKey="name"
              series={[{ key: "overspent", label: t("sections.overspent") }]}
              colorByPoint={(row) => colorOf(String(row.category_id))}
              formatValue={fmtY}
            />
          </>
        )}
      </OverviewSection>

      <OverviewSection
        testId="overview-section-reserves"
        title={t("sections.reserves")}
        open={reservesOpen}
        onToggle={() => setReservesOpen((o) => !o)}
      >
        {loading ? (
          <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
        ) : failed ||
          data.reserves_by_category.filter((r) => Number(r.reserve_cents) > 0)
            .length === 0 ? (
          <p className="text-num-sm text-[var(--muted-foreground)]">
            {t("empty.reserves")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("range.currentConfig")}
            </p>
            <OverviewBarChart
              layout="vertical"
              data={data.reserves_by_category
                .filter((r) => Number(r.reserve_cents) > 0)
                .map((r) => ({
                  name: r.name,
                  category_id: r.category_id,
                  reserve: Number(r.reserve_cents),
                }))}
              xKey="name"
              series={[{ key: "reserve", label: t("sections.reserves") }]}
              colorByPoint={(row) => colorOf(String(row.category_id))}
              formatValue={fmtY}
            />
          </div>
        )}
      </OverviewSection>
    </>
  );
}
