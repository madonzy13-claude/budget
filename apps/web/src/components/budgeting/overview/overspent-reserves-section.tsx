"use client";
/**
 * overspent-reserves-section.tsx — Overview "Reserves" section (11-09, SC5).
 *
 * Backed by /overview/overspent-reserves, fetched lazily once the section is
 * open. Reserves is NOT range-scoped ("current"). The Overspent half moved into
 * the Planned section (260803 request, see overspent-body.tsx) — it reads there
 * as the other half of "how did the plan go" — and shares this same payload.
 * By-category bars use each category's colorKey.
 */
import { useTranslations } from "next-intl";
import { OverviewSection } from "./overview-section";
import { usePersistedSectionOpen } from "@/components/budgeting/bdp-ui-state";
import { OverviewBarChart } from "@/components/budgeting/charts/bar-chart";
import { useOverviewOverspent } from "@/hooks/use-overview-overspent";
import {
  useReserveFit,
  useSetReserveFitExclusion,
} from "@/hooks/use-reserve-fit";
import { ReserveFitView } from "./reserve-fit-view";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToRounded } from "@/lib/cents-format";
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
  const [reservesOpen, toggleReserves] = usePersistedSectionOpen("reserves");

  const categories = useCategories(budgetId).data ?? [];
  const { data, isPending, isError } = useOverviewOverspent(budgetId, {
    from: range.from,
    to: range.to,
    enabled: reservesOpen,
  });

  // 260804: "is each reserve the right size?" — held against the deepest dip the
  // category's own history ever ran, with the member's one-off calls applied.
  const fit = useReserveFit(budgetId, {
    from: range.from,
    to: range.to,
    enabled: reservesOpen,
  });
  const setExclusion = useSetReserveFitExclusion(budgetId);

  const ccy = data?.currency ?? "USD";
  // Chart AXIS: bare + compact, no currency (r24 5/7). TOOLTIP: full $ (r25 #2).
  const fmtY = chartCompactCents;
  const fmtTooltip = (n: number) =>
    centsToRounded(BigInt(Math.round(n)), ccy, "en", true);
  // Per-category bars use each category's colorKey; the FALLBACK (no colorKey)
  // is blue — never the yellow accent (r25 item 2).
  const colorOf = (id: string, fallback: string): string =>
    hexForColorKey(
      categories.find((c) => c.id === id)?.colorKey as string | undefined,
    ) ?? fallback;
  const BAR_BLUE = "var(--chart-bar-1)";

  const loading = isPending && reservesOpen;
  const failed = isError || !data;

  return (
    <>
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
                // 260731 (user decision): the CHARTS always show real numbers — masking
                // them made the shapes unreadable. The privacy blur stays on the hero
                // cards + totals, which is where a shoulder-surfer actually reads a figure.
                maskAmounts={false}
              />
            </div>
          )}
          {fit.data && (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("reserveFit.title")}
              </p>
              <ReserveFitView
                data={fit.data}
                format={fmtTooltip}
                onToggle={(ledgerId, excluded) =>
                  setExclusion.mutate({ ledgerId, excluded })
                }
              />
            </div>
          )}
        </OverviewSection>
      )}
    </>
  );
}
