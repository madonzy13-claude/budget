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
import { useTranslations } from "next-intl";
import { OverviewSection } from "./overview-section";
import { usePersistedSectionOpen } from "@/components/budgeting/bdp-ui-state";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { useOverviewOverspent } from "@/hooks/use-overview-overspent";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { chartCompactCents } from "@/lib/chart-format";
import { hexForColorKey } from "@/lib/category-colors";
import type { OverviewRange } from "@/lib/overview-range";

export function OverspentReservesSection({
  budgetId,
  range,
  reservesEnabled = true,
}: {
  budgetId: string;
  range: OverviewRange;
  reservesEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview");
  const [overspentOpen, toggleOverspent] = usePersistedSectionOpen("overspent");
  const [reservesOpen, toggleReserves] = usePersistedSectionOpen("reserves");

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewOverspent(budgetId, {
    from: range.from,
    to: range.to,
    enabled: overspentOpen || reservesOpen,
  });

  const ccy = data?.currency ?? "USD";
  // Chart AXIS: bare + compact, no currency (r24 5/7). TOOLTIP: full $ (r25 #2).
  const fmtY = chartCompactCents;
  const fmtTooltip = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, "en", true);
  // Per-category bars use each category's colorKey; the FALLBACK (no colorKey)
  // alternates blue/teal per chart so neither is yellow and adjacent charts differ
  // (r25 item 2). overspent → teal, reserves → blue.
  const colorOf = (id: string, fallback: string): string =>
    hexForColorKey(
      categories.find((c) => c.id === id)?.colorKey as string | undefined,
    ) ?? fallback;
  const BAR_BLUE = "var(--chart-bar-1)";
  const BAR_TEAL = "var(--chart-bar-2)";

  const loading = isPending && (overspentOpen || reservesOpen);
  const failed = isError || !data;

  return (
    <>
      <OverviewSection
        testId="overview-section-overspent"
        title={t("sections.overspent")}
        open={overspentOpen}
        onToggle={toggleOverspent}
      >
        {loading ? (
          <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
        ) : failed || data.overspent_by_category.length === 0 ? (
          <p className="text-num-sm text-[var(--muted-foreground)]">
            {t("empty.overspent")}
          </p>
        ) : (
          <>
            {/* Total as a Financial-Wealth-style metric — caption label above,
                num-md value below, centered (round 18 item 4). */}
            <div className="flex flex-wrap items-start justify-center gap-6">
              <div className="flex flex-col gap-0.5">
                <p className="text-caption text-[var(--muted-foreground)]">
                  {t("total")}
                </p>
                <span className="num text-num-md text-[var(--trading-down)]">
                  {centsToDisplayCompact(data.overspent_total_cents, ccy, "en", true)}
                </span>
              </div>
            </div>
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("overspentByCategory")}
            </p>
            <OverviewBarChart
              layout="vertical"
              data={data.overspent_by_category
                .map((c) => ({
                  name: c.name,
                  category_id: c.category_id,
                  overspent: Number(c.overspent_cents),
                }))
                // Most overspent first (recharts vertical renders it at the top).
                .sort((a, b) => b.overspent - a.overspent)}
              xKey="name"
              series={[{ key: "overspent", label: t("sections.overspent") }]}
              colorByPoint={(row) => colorOf(String(row.category_id), BAR_TEAL)}
              formatValue={fmtY}
              formatTooltip={fmtTooltip}
            />
          </>
        )}
      </OverviewSection>

      {/* Reserves collapsible — hidden entirely when the reserves feature flag
          is off (mirrors the hidden Reserves pill + the dropped reserves card).
          When ON, every category is shown even at a zero reserve so the family
          can see the full set (UAT: "zero reserves must be visible"); the empty
          state only appears when there are no categories at all. */}
      {reservesEnabled && (
        <OverviewSection
          testId="overview-section-reserves"
          title={t("sections.reserves")}
          open={reservesOpen}
          onToggle={toggleReserves}
        >
          {loading ? (
            <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
          ) : failed || data.reserves_by_category.length === 0 ? (
            <p className="text-num-sm text-[var(--muted-foreground)]">
              {t("empty.reserves")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("reservesByCategory")}
              </p>
              <OverviewBarChart
                layout="vertical"
                data={data.reserves_by_category
                  .map((r) => ({
                    name: r.name,
                    category_id: r.category_id,
                    reserve: Number(r.reserve_cents),
                  }))
                  // Highest reserve first (recharts vertical renders it at the top).
                  .sort((a, b) => b.reserve - a.reserve)}
                xKey="name"
                series={[{ key: "reserve", label: t("sections.reserves") }]}
                colorByPoint={(row) =>
                  colorOf(String(row.category_id), BAR_BLUE)
                }
                formatValue={fmtY}
                formatTooltip={fmtTooltip}
              />
            </div>
          )}
        </OverviewSection>
      )}
    </>
  );
}
