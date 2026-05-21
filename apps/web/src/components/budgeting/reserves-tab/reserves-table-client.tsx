"use client";
/**
 * reserves-table-client.tsx — Client island for the Reserves tab.
 *
 * W-3 contract: Active section = summary.data.rows; Excluded section = summary.data.excludedRows.
 * Both arrays come from the SINGLE GET /reserves response — no separate categories fetch.
 *
 * T-05-06: When totals.disabled === true, render notice instead of table.
 * T-05-05: Excluded rows get isExcluded={true} → InlineEditCell disabled → no-op on click.
 * D-PH5-R10: Excluded rows show FROZEN REAL reserveBalanceCents from excludedRows array.
 * D-PH5-R4: Em-dash in share column when walletSharePercent===null OR isExcluded.
 *
 * DnD: cross-section drag Active ↔ Excluded. Drop target is either droppable zone.
 * On drag-end: call useToggleCategoryReserveExcluded with the new excluded state.
 */
import * as React from "react";
import {
  DndContext,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import {
  useReservesSummary,
  type ReservesSummaryDto,
} from "@/hooks/use-reserves-summary";
import { useUpdateReserveAdjustment } from "@/hooks/use-update-reserve-adjustment";
import { useToggleCategoryReserveExcluded } from "@/hooks/use-toggle-category-reserve-excluded";
import { ReservesTableRow } from "./reserves-table-row";
import { ReservesTotalsFooter } from "./reserves-totals-footer";

// ─── Droppable section wrappers ─────────────────────────────────────────────

function ActiveSection({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "reserves-active" });
  return (
    <section
      ref={setNodeRef}
      data-testid="reserves-active-section"
      className={[
        "flex flex-col gap-2 rounded-[var(--radius-lg)] p-2",
        isOver
          ? "ring-2 ring-dashed ring-[var(--info)] bg-[var(--surface-elevated-dark)]/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}

function ExcludedSection({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "reserves-excluded" });
  return (
    <section
      ref={setNodeRef}
      data-testid="reserves-excluded-section"
      className={[
        "flex flex-col gap-2 rounded-[var(--radius-lg)] p-2",
        isOver
          ? "ring-2 ring-dashed ring-[var(--info)] bg-[var(--surface-elevated-dark)]/60"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}

// ─── Client island ───────────────────────────────────────────────────────────

export interface ReservesTableClientProps {
  budgetId: string;
  initial: ReservesSummaryDto;
}

export function ReservesTableClient({
  budgetId,
  initial,
}: ReservesTableClientProps) {
  const t = useTranslations("bdp.tab.reserves");

  // Single query — W-3 single source of truth for Active + Excluded
  const summary = useReservesSummary(budgetId, initial);
  const updateAdjustment = useUpdateReserveAdjustment(budgetId);
  const toggleExcluded = useToggleCategoryReserveExcluded(budgetId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const droppedId = String(over.id);
    const categoryId = String(active.id);

    if (droppedId !== "reserves-active" && droppedId !== "reserves-excluded")
      return;

    const excluded = droppedId === "reserves-excluded";

    // Locate row to confirm current membership + grab name
    const fromActive = summary.data?.rows.find(
      (r) => r.categoryId === categoryId,
    );
    const fromExcluded = summary.data?.excludedRows.find(
      (r) => r.categoryId === categoryId,
    );
    const cat = fromActive ?? fromExcluded;
    if (!cat) return;

    const currentlyExcluded = Boolean(fromExcluded);
    if (currentlyExcluded === excluded) return; // no-op — already in that section

    toggleExcluded.mutate({
      categoryId,
      excluded,
      categoryName: cat.name,
    });
  }

  // T-05-06: cascading hide when reserves_enabled=false
  if (summary.data?.totals.disabled) {
    return (
      <div
        data-testid="reserves-disabled-notice"
        className="p-6 text-center text-[var(--muted-foreground)]"
      >
        Reserves disabled
      </div>
    );
  }

  if (!summary.data) return null;

  const activeRows = summary.data.rows;
  // W-3: Excluded rows come directly from API — frozen REAL balances, NOT synthesized
  const excludedRows = summary.data.excludedRows;
  const { budgetCurrency } = summary.data.totals;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        // Page-scoped scroll container (html/body is locked overflow:hidden
        // globally for PWA touch handling). 100svh - 176px matches the
        // spendings grid: 64 top nav + 48 tab strip + ~50 chrome/padding.
        // overscroll-contain stops vertical swipes from bubbling up to the
        // locked document. dnd-kit auto-scrolls this container while dragging.
        style={{ overscrollBehavior: "contain" }}
        className="flex max-h-[calc(100svh-176px)] flex-col gap-4 overflow-y-auto p-4 pb-20 sm:p-6"
      >
        {/* UAT-PH5-T3-53: single top banner on every viewport. Sits
            inside the page's flex column so its width matches the
            category list naturally. No more bottom sticky footer. */}
        <ReservesTotalsFooter
          totalCategoryCents={summary.data.totals.totalCategoryReservesCents}
          totalWalletCents={summary.data.totals.totalReserveWalletAmountCents}
          mismatchCents={summary.data.totals.mismatchCents}
          currency={budgetCurrency}
        />

        {/* Active section — column headers replace the section caption
            (UAT-PH5-T3-55: dropped "Active" h3; column headers sit
            where it was, inline above the row list). Actions column
            removed per same item. */}
        <ActiveSection>
          <div className="flex items-center gap-3 px-3 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            <span className="w-4" aria-hidden="true" />
            <span className="min-w-0 flex-1">{t("column.category")}</span>
            <span className="w-[72px] text-right sm:w-[120px]">
              {t("column.expected")}
            </span>
            <span className="w-[64px] text-right sm:w-[100px]">
              {t("column.actual")}
            </span>
            <span className="hidden text-right sm:block sm:w-[80px]">
              {t("column.share")}
            </span>
          </div>
          {activeRows.map((r) => (
            <ReservesTableRow
              key={r.categoryId}
              row={r}
              currency={budgetCurrency}
              isExcluded={false}
              onUpdate={async (newCents) => {
                // UAT-PH5-T3-54: API takes target expected value, not delta.
                const current = BigInt(r.reserveBalanceCents);
                if (newCents === current) return;
                await updateAdjustment.mutateAsync({
                  categoryId: r.categoryId,
                  expectedCents: Number(newCents),
                });
              }}
              onSwipeAction={() =>
                toggleExcluded.mutate({
                  categoryId: r.categoryId,
                  excluded: true,
                  categoryName: r.name,
                })
              }
            />
          ))}
          {activeRows.length === 0 && (
            <div className="px-3 py-2 text-caption text-[var(--muted-foreground)]" />
          )}
        </ActiveSection>

        {/* Excluded section — name-only rows (UAT-PH5-T3-55: dashes
            removed) sourced from excludedRows (W-3 single-source). */}
        <ExcludedSection>
          <h3 className="px-2 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {t("section.excluded")}
          </h3>
          {excludedRows.map((r) => (
            <ReservesTableRow
              key={r.categoryId}
              row={r}
              currency={budgetCurrency}
              isExcluded={true}
              onUpdate={async () => {
                /* disabled — InlineEditCell never calls onSave when disabled */
              }}
              onSwipeAction={() =>
                toggleExcluded.mutate({
                  categoryId: r.categoryId,
                  excluded: false,
                  categoryName: r.name,
                })
              }
            />
          ))}
          {excludedRows.length === 0 && (
            <div className="px-3 py-2 text-caption text-[var(--muted-foreground)]">
              {t("section.excludedEmpty")}
            </div>
          )}
        </ExcludedSection>
      </div>
    </DndContext>
  );
}
