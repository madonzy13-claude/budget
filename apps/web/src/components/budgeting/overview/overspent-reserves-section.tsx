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
import { useUpdateReserveAdjustment } from "@/hooks/use-update-reserve-adjustment";
import { ReserveFitView } from "./reserve-fit-view";
import { useCategories } from "@/hooks/use-budget-data";
import { useOneOffCandidates } from "@/hooks/use-one-off-candidates";
import { centsToRounded, centsToDisplayCompact } from "@/lib/cents-format";
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
  // Warmed in the background like the other sections (260806) — a wave behind
  // Planned so the two do not compete for the wire.
  // See planned-section: no wave, the pool does the throttling.
  const warm = true;

  const categories = useCategories(budgetId).data ?? [];
  // The one-off filter lists categories in the order the household arranged on
  // the spendings tab — sorted here, as the grid does, rather than trusted from
  // the wire (user, 260812).
  const categoryOrder = [...categories]
    .sort(
      (a, b) =>
        ((a.sortIndex as number | undefined) ?? 0) -
        ((b.sortIndex as number | undefined) ?? 0),
    )
    .map((c) => c.id as string);
  const categoryList = [...categories]
    .sort(
      (a, b) =>
        ((a.sortIndex as number | undefined) ?? 0) -
        ((b.sortIndex as number | undefined) ?? 0),
    )
    .map((c) => ({ id: c.id as string, name: String(c.name ?? "") }));
  // Every spend in the range, ten at a time — the same list the Planned
  // section's dialog shows, from the same endpoint (user, 260813).
  const [oneOffCategory, setOneOffCategory] = useState("all");
  const oneOffs = useOneOffCandidates(
    budgetId,
    { from: range.from, to: range.to },
    oneOffCategory === "all" ? null : oneOffCategory,
  );
  const nameById = new Map(categoryList.map((c) => [c.id, c.name]));
  const oneOffRows = (oneOffs.data?.pages ?? []).flatMap((page) =>
    page.items.map((i) => ({
      ...i,
      category_name: nameById.get(i.category_id) ?? "",
    })),
  );
  const { data, isPending, isError } = useOverviewOverspent(budgetId, {
    from: range.from,
    to: range.to,
    enabled: warm,
  });

  // 260804: "is each reserve the right size?" — held against the deepest dip the
  // category's own history ever ran, with the member's one-off calls applied.
  const fit = useReserveFit(budgetId, {
    from: range.from,
    to: range.to,
    enabled: warm,
  });
  const saveExclusions = useSaveReserveFitExclusions(budgetId);
  // 260805: the fit chart says which buffers are the wrong size, so the move
  // that fixes them belongs here rather than a trip to the Reserves tab. The
  // SAME adjust the Reserves tab posts — one way to set a reserve, and it
  // refreshes the Overview itself — with its toast held back, because the
  // dialog's own rows report each move.
  const adjustReserve = useUpdateReserveAdjustment(budgetId, { silent: true });
  const onRebalance = async (categoryId: string, targetCents: number) => {
    const res = await adjustReserve.mutateAsync({
      categoryId,
      expectedCents: targetCents,
    });
    // What the engine SETTLED on, which is below the target when the raise
    // covered this month's overspend.
    return Number(res?.reserveCents ?? targetCents);
  };
  // Always money (user, 260805): the action here is "move 2,900 zł", and a
  // percentage of a buffer is a step away from that. The percent view went with
  // the switch — nobody was reaching for it, and its absence buys the header
  // back for the two dialogs.
  const hasCompletedMonth = rangeHasCompletedMonth(
    range.from,
    range.to,
    todayInTz(useUserTimezone()).toString(),
  );

  const ccy = data?.currency ?? "USD";
  const fmtTooltip = (n: number) =>
    centsToRounded(BigInt(Math.round(n)), ccy, "en", true);
  // Keeps the cents where there are any. The rebalance dialog needs them: its
  // target field is editable to the cent, so rounding what the reserve holds
  // beside it invents a difference (user screenshot, 260805).
  const fmtExact = (n: number) =>
    centsToDisplayCompact(BigInt(Math.round(n)), ccy, "en", true);
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
                  categoryOrder={categoryOrder}
                  categories={categoryList}
                  oneOffs={oneOffRows}
                  excludedOneOffTotal={oneOffs.data?.pages[0]?.excluded_total}
                  oneOffCategory={oneOffCategory}
                  onOneOffCategoryChange={setOneOffCategory}
                  hasMoreOneOffs={Boolean(oneOffs.hasNextPage)}
                  onLoadMoreOneOffs={() => void oneOffs.fetchNextPage()}
                  loadingMoreOneOffs={oneOffs.isFetchingNextPage}
                  format={fmtTooltip}
                  formatExact={fmtExact}
                  onSave={(delta) => saveExclusions.mutate(delta)}
                  onRebalance={onRebalance}
                  scale="amount"
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
