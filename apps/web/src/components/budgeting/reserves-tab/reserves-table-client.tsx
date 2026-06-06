"use client";
/**
 * reserves-table-client.tsx — Client island for the Reserves tab.
 *
 * W-3 contract: Active section = summary.data.rows; Excluded section = summary.data.excludedRows.
 * Both arrays come from the SINGLE GET /reserves response — no separate categories fetch.
 *
 * Phase 05 reserve rewrite (05-REWRITE-SPEC.md) + 05-19 column reshape: active
 * rows render a single editable "Available" value. The per-row Used column is
 * removed; this island sums the active rows' usedCents and passes the total to
 * the footer (TOTAL USED). The footer renders 3 stacked totals (TOTAL AVAILABLE
 * / TOTAL IN WALLETS / TOTAL USED) and NO surplus banner — the RESERVE_TOPUP
 * task card is the single reconcile nudge. The old Expected/Actual/Share
 * columns + MismatchChip + SurplusBanner are GONE.
 *
 * T-05-06: When totals.disabled === true, render notice instead of table.
 * T-05-05: Excluded rows get isExcluded={true} → InlineEditCell disabled → no-op on click.
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
        {t("disabled")}
      </div>
    );
  }

  if (!summary.data) return null;

  const activeRows = summary.data.rows;
  // W-3: Excluded rows come directly from API — frozen REAL balances, NOT synthesized
  const excludedRows = summary.data.excludedRows;
  const { budgetCurrency } = summary.data.totals;

  // 05-19: TOTAL USED (THIS MONTH) — Σ usedCents over ACTIVE rows only (the same
  // per-row values the removed Used column showed). UI-only aggregate; no new
  // DTO field. BigInt to stay precise on serialized-cents strings.
  const totalUsedCents = activeRows
    .reduce((sum, r) => sum + BigInt(r.usedCents), 0n)
    .toString();

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        // No bounded inner scroll container — content flows naturally
        // in the layout's `<main overflow-y-auto>`, same as wallets +
        // home + spendings post-UAT-Phase6 retest. The prior
        // `max-h-[calc(100svh-176px)]` reserved a fixed viewport area
        // and left a dark canvas band below short tables. dnd-kit's
        // auto-scroll can target the document scroll surface; the
        // `pb-20` bottom-cushion is kept so the last row clears the
        // iOS home-indicator gutter comfortably.
        className="flex flex-col gap-4 p-4 pb-20 sm:p-6"
      >
        {/* UAT-PH5-T3-53: single top totals strip on every viewport. Sits
            inside the page's flex column so its width matches the category
            list naturally. 05-19: 3 stacked totals (TOTAL AVAILABLE / TOTAL IN
            WALLETS / TOTAL USED) — no surplus banner. TOTAL USED = Σ active
            rows' usedCents, computed here (this island holds the rows). */}
        <ReservesTotalsFooter
          internalCents={summary.data.totals.internalCents}
          userDefinedCents={summary.data.totals.userDefinedCents}
          usedCents={totalUsedCents}
          currency={budgetCurrency}
        />

        {/* Active section — column headers replace the section caption
            (UAT-PH5-T3-55: dropped "Active" h3; column headers sit where it
            was, inline above the row list). 05-19: two columns now —
            Category / Available (the Used column is removed; its sum lives in
            the footer). Header width matches the row's Available cell. */}
        <ActiveSection>
          <div className="flex items-center gap-3 px-3 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            <span className="w-4" aria-hidden="true" />
            <span className="min-w-0 flex-1">{t("column.category")}</span>
            <span className="w-[88px] text-right sm:w-[140px]">
              {t("column.available")}
            </span>
          </div>
          {activeRows.map((r) => (
            // Plan 07-08 D-PH7-26: ReservesTableRow now accepts an optional
            // `pendingTaskId` prop that renders a PencilLine indicator inline
            // with the category name. The full parent wiring (read pending
            // RESERVE_TOPUP tasks from the tasks query and pass the task id
            // here when this budget has one in flight) is deferred to a
            // follow-up alongside the deep-link landing UX so we wire the
            // query once for the read side. Row contract ships in 07-08.
            // TODO(07-08-followup): subscribe to ["tasks", budgetId, "pending"]
            //                       and pass `pendingTaskId` for the matching
            //                       RESERVE_TOPUP task (budget-level — mark
            //                       every active reserve row when present).
            <ReservesTableRow
              key={r.categoryId}
              row={r}
              currency={budgetCurrency}
              isExcluded={false}
              onUpdate={async (newCents) => {
                // Adjust takes the TARGET reserve value; the server computes the
                // signed ledger delta. No-op when unchanged.
                const current = BigInt(r.reserveCents);
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
