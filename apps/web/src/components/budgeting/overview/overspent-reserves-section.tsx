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
import { useState } from "react";
import { useTranslations } from "next-intl";
import { OverviewSection } from "./overview-section";
import { usePersistedSectionOpen } from "@/components/budgeting/bdp-ui-state";
import { OverviewPieChart } from "@/components/budgeting/charts/pie-chart";
import { reserveBalanceSlices } from "@/lib/reserve-balance-slices";
import { ChartNeedsCompletedMonth } from "./chart-needs-completed-month";
import { rangeHasCompletedMonth } from "@/lib/range-completed-month";
import { todayInTz } from "@/lib/overview-range";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { assignSliceColors } from "@/lib/slice-colors";
import { useOverviewOverspent } from "@/hooks/use-overview-overspent";
import {
  useReserveFit,
  useSaveReserveFitExclusions,
} from "@/hooks/use-reserve-fit";
import { ReserveFitView } from "./reserve-fit-view";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { useCategories } from "@/hooks/use-budget-data";
import { centsToRounded } from "@/lib/cents-format";
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
  const saveExclusions = useSaveReserveFitExclusions(budgetId);
  // Money by default (user, 260804): the action here is "move 2,900 zł", and a
  // percentage of a buffer is a step away from that. The percent view stays one
  // tap away for comparing categories of different sizes.
  const [fitScale, setFitScale] = useState<"pct" | "amount">("amount");
  const hasCompletedMonth = rangeHasCompletedMonth(
    range.from,
    range.to,
    todayInTz(useUserTimezone()).toString(),
  );

  const ccy = data?.currency ?? "USD";
  const fmtTooltip = (n: number) =>
    centsToRounded(BigInt(Math.round(n)), ccy, "en", true);
  const BAR_BLUE = "var(--chart-bar-1)";

  const balanceSlices = reserveBalanceSlices(data?.reserves_by_category ?? []);
  // One colour per slice, exactly as the planned-spend pie does it: a category
  // with a colorKey keeps it, the rest take distinct palette colours instead of
  // every slice landing on the same blue (user, 260804).
  const balanceColorByName = assignSliceColors(
    balanceSlices.map((r) => r.name),
    (name) =>
      hexForColorKey(
        (categories.find(
          (c) =>
            c.id === balanceSlices.find((s) => s.name === name)?.category_id,
        )?.colorKey as string | null) ?? null,
      ),
  );

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
          {!hasCompletedMonth ? (
            /* Same rule as the planned chart: the walk leaves the month still
               running out, so a range holding nothing else has no history to
               size a buffer from (user, 260804). */
            <ChartNeedsCompletedMonth
              title={t("reserveFit.title")}
              testId="reserve-fit-needs-month"
            />
          ) : (
            fit.data && (
              <div className="flex flex-col gap-2">
                <p className="text-center text-caption text-[var(--muted-foreground)]">
                  {t("reserveFit.title")}
                </p>
                <ReserveFitView
                  data={fit.data}
                  format={fmtTooltip}
                  onSave={(delta) => saveExclusions.mutate(delta)}
                  scale={fitScale}
                  scaleSwitch={
                    <SegmentedToggle
                      className="text-caption"
                      testId="reserve-fit-scale"
                      label={t("planned.scale")}
                      value={fitScale}
                      onChange={(v) => setFitScale(v as "pct" | "amount")}
                      options={[
                        { value: "pct", label: t("planned.scalePct") },
                        { value: "amount", label: t("planned.scaleAmount") },
                      ]}
                    />
                  }
                />
              </div>
            )
          )}
          {loading ? (
            <div className="h-60 animate-pulse rounded-[var(--radius-xl)] bg-[var(--surface-elevated-dark)]" />
          ) : failed || balanceSlices.length === 0 ? (
            <p className="text-num-sm text-[var(--muted-foreground)]">
              {t("empty.reserves")}
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-center text-caption text-[var(--muted-foreground)]">
                {t("reservesByCategory")}
              </p>
              {/* A pie, not bars (user, 260804): the question here is how the
                  reserve is SPLIT, and a category holding nothing has no share
                  to show — those are dropped rather than drawn as a zero. */}
              <OverviewPieChart
                data={balanceSlices}
                nameKey="name"
                valueKey="reserve"
                colorFor={(name) => balanceColorByName.get(name) ?? BAR_BLUE}
                formatValue={fmtTooltip}
                allLabel={t("range.all")}
              />
            </div>
          )}
        </OverviewSection>
      )}
    </>
  );
}
