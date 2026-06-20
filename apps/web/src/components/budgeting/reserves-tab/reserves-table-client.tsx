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
import { cn } from "@/lib/utils";
import { isRestoreComplete } from "@/lib/query-persist";
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
import { useTranslations, useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  useReservesSummary,
  type ReservesSummaryDto,
} from "@/hooks/use-reserves-summary";
import { useUpdateReserveAdjustment } from "@/hooks/use-update-reserve-adjustment";
import { useToggleCategoryReserveExcluded } from "@/hooks/use-toggle-category-reserve-excluded";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { animateCountTriple, type CountTriple } from "@/lib/animate-count";
import { centsToBare } from "@/lib/cents-format";
import { ReservesTableRow } from "./reserves-table-row";
import { ReservesTotalsFooter } from "./reserves-totals-footer";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Cold-load skeleton (260616 SPA refactor) — mirrors the Included section + the
 * totals card geometry so the loaded table streams in without a jump. Shown only
 * when useReservesSummary has no cached data; a warm re-nav renders the table
 * directly with zero skeleton.
 */
function ReservesSkeleton({ label }: { label: string }) {
  return (
    // reveal-delayed: whole skeleton invisible 200ms so a cache restore replaces
    // it first — no skeleton-scaffold flash on warm/offline nav (260617). Only
    // while the one-shot IDB restore is bridging (260620): after it's done, a
    // cold table = network wait, so render at once (no blank pane under the band).
    <div
      className={cn(
        "mx-auto w-full max-w-[1280px]",
        !isRestoreComplete() && "reveal-delayed",
      )}
    >
      <div className="flex flex-col gap-4 p-4 pb-20 sm:p-6">
        <section className="flex flex-col gap-2 rounded-[var(--radius-lg)] py-2 sm:p-2">
          <h3 className="px-2 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {label}
          </h3>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[56px] items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px]"
            >
              <Skeleton className="h-4 w-2 shrink-0" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="ml-auto h-3.5 w-12" />
            </div>
          ))}
        </section>
        <div className="ml-auto sm:mr-2 w-full sm:w-[340px] max-w-full rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] flex flex-col gap-2 px-4 py-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Captured state for the cover reveal (popup + count-down). */
interface CoverReveal {
  categoryId: string;
  categoryName: string;
  coverCents: bigint;
  /** Settled Available for the category after cover (cents). */
  availableAfterCents: bigint;
  from: CountTriple;
  to: CountTriple;
  /** Authoritative summary to commit once the count-down finishes. */
  summary: ReservesSummaryDto;
}

// ─── Droppable section wrappers ─────────────────────────────────────────────

function ActiveSection({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "reserves-active" });
  return (
    <section
      ref={setNodeRef}
      data-testid="reserves-active-section"
      className={[
        // Mobile: no horizontal inset so row cards reach the same width as the
        // task pane above (both then sit at the page's px-4 gutter). Desktop
        // keeps the p-2 drop-zone inset (px-6 + 2 == task pane's px-8).
        "flex flex-col gap-2 rounded-[var(--radius-lg)] py-2 sm:p-2",
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
        // Mobile: no horizontal inset so row cards reach the same width as the
        // task pane above (both then sit at the page's px-4 gutter). Desktop
        // keeps the p-2 drop-zone inset (px-6 + 2 == task pane's px-8).
        "flex flex-col gap-2 rounded-[var(--radius-lg)] py-2 sm:p-2",
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
}

export function ReservesTableClient({ budgetId }: ReservesTableClientProps) {
  const t = useTranslations("bdp.tab.reserves");
  const tUnavailable = useTranslations("offline.unavailable");
  const locale = useLocale();
  const qc = useQueryClient();

  // Single query — W-3 single source of truth for Active + Excluded.
  // SPA/SWR (260616): client-fetched, no SSR `initial` seed. Renders instantly
  // from the warm/persisted React Query cache; skeleton only on a cold load.
  const summary = useReservesSummary(budgetId);

  // ── Cover reveal: an adjust whose added reserve covered this month's
  // overspend lands BELOW the typed target. Instead of snapping, notify the
  // user (acknowledge-only popup) then count the numbers down to the settled
  // values. `reveal` holds the from/to + the summary to commit on finish; `anim`
  // is the live interpolated triple while the tween runs.
  const [reveal, setReveal] = React.useState<CoverReveal | null>(null);
  const [popupOpen, setPopupOpen] = React.useState(false);
  const [anim, setAnim] = React.useState<CountTriple | null>(null);
  const cancelAnimRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => () => cancelAnimRef.current?.(), []);

  const onCoverDetected = React.useCallback(
    (e: {
      categoryId: string;
      coverCents: bigint;
      summary: ReservesSummaryDto;
    }) => {
      const cache = qc.getQueryData<ReservesSummaryDto>([
        "budget",
        budgetId,
        "reserves",
      ]);
      const fromRow = cache?.rows.find((r) => r.categoryId === e.categoryId);
      const toRow = e.summary.rows.find((r) => r.categoryId === e.categoryId);
      const settled = {
        available: Number(BigInt(toRow?.reserveCents ?? "0")),
        totalAvailable: Number(BigInt(e.summary.totals.internalCents)),
        totalUsed: Number(BigInt(e.summary.totals.usedCents)),
      };
      // The cache is the optimistic baseline the count-down animates FROM. When
      // it is cold (evicted / mid-refetch during a long session — intermittent),
      // fall back to the settled values so the count-down is a no-op, and commit
      // the authoritative summary up front so the table is correct behind the
      // popup. The acknowledge popup MUST still open regardless of the cache:
      // it is the only signal that the reserve covered an overspend (and the
      // golden-timeline E2E asserts it). Previously a cold cache early-returned
      // here without opening the popup, silently dropping the cover notice and
      // making that E2E flaky.
      const from = cache
        ? {
            available: Number(BigInt(fromRow?.reserveCents ?? "0")),
            totalAvailable: Number(BigInt(cache.totals.internalCents)),
            totalUsed: Number(BigInt(cache.totals.usedCents)),
          }
        : settled;
      if (!cache) {
        qc.setQueryData(["budget", budgetId, "reserves"], e.summary);
      }
      setReveal({
        categoryId: e.categoryId,
        categoryName: fromRow?.name ?? toRow?.name ?? "",
        coverCents: e.coverCents,
        availableAfterCents: BigInt(toRow?.reserveCents ?? "0"),
        from,
        to: settled,
        summary: e.summary,
      });
      setPopupOpen(true);
    },
    [qc, budgetId],
  );

  const updateAdjustment = useUpdateReserveAdjustment(budgetId, {
    onCoverDetected,
  });
  const toggleExcluded = useToggleCategoryReserveExcluded(budgetId);

  // User acknowledged the popup (no cancel): close it, then count the three
  // numbers from their pre-settle values to the settled ones; commit the
  // authoritative summary exactly at the tween's end value (no jump).
  const acknowledgeCover = React.useCallback(
    (r: CoverReveal) => {
      setPopupOpen(false);
      setAnim(r.from);
      cancelAnimRef.current?.();
      cancelAnimRef.current = animateCountTriple(
        r.from,
        r.to,
        700,
        (v) => setAnim(v),
        () => {
          qc.setQueryData(["budget", budgetId, "reserves"], r.summary);
          setAnim(null);
          setReveal(null);
          cancelAnimRef.current = null;
        },
      );
    },
    [qc, budgetId],
  );

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

  // Cold load (no cached data yet) → skeleton; offline with no cache → notice.
  if (summary.isPending) {
    return <ReservesSkeleton label={t("section.included")} />;
  }
  if (!summary.data) {
    return (
      <div className="mx-auto w-full max-w-[1280px] p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          {tUnavailable("body")}
        </p>
      </div>
    );
  }

  const activeRows = summary.data.rows;
  // W-3: Excluded rows come directly from API — frozen REAL balances, NOT synthesized
  const excludedRows = summary.data.excludedRows;
  const { budgetCurrency } = summary.data.totals;

  // TOTAL USED comes from the API totals (server sums EVERY non-excluded
  // category incl. archived "keep history" rows that aren't displayed here).
  const totalUsedCents = summary.data.totals.usedCents;
  const totalUsedThisMonthCents = summary.data.totals.usedThisMonthCents;

  // While the cover count-down runs, the footer renders the interpolated
  // totals (TOTAL AVAILABLE ↓ by cover, TOTAL USED ↑ by cover); otherwise the
  // authoritative cache values.
  const footerInternalCents =
    anim !== null
      ? String(anim.totalAvailable)
      : summary.data.totals.internalCents;
  const footerUsedCents =
    anim !== null ? String(anim.totalUsed) : totalUsedCents;

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
        {/* Active section — titled "Included" (mirrors the "Excluded" h3
            below). The Category/Available column headers are dropped per UAT;
            the row's own Available cell keeps its width. */}
        <ActiveSection>
          <h3 className="px-2 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
            {t("section.included")}
          </h3>
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
              displayReserveCentsOverride={
                anim !== null && reveal?.categoryId === r.categoryId
                  ? BigInt(anim.available)
                  : null
              }
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
            <div className="px-3 py-2 text-caption text-[var(--muted-foreground)]">
              {excludedRows.length === 0
                ? t("section.noCategories")
                : t("section.includedEmpty")}
            </div>
          )}
        </ActiveSection>

        {/* Totals — compact, right-aligned, rendered BELOW the included
            (active) categories. 3 totals (TOTAL AVAILABLE / TOTAL IN WALLETS /
            TOTAL USED); a green-up/red-down arrow on TOTAL IN WALLETS signals
            wallet vs needed. TOTAL USED = Σ active rows' usedCents (computed
            here — this island holds the rows). */}
        <ReservesTotalsFooter
          internalCents={footerInternalCents}
          userDefinedCents={summary.data.totals.userDefinedCents}
          usedThisMonthCents={totalUsedThisMonthCents}
          usedAllTimeCents={footerUsedCents}
          currency={budgetCurrency}
        />

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

      {/* Cover reveal — acknowledge-only (no cancel, no Esc/overlay dismiss).
          The adjust is already committed server-side; this notifies the user
          that part of the reserve they set covered this month's overspend,
          then the count-down (driven by `anim`) shows the numbers settling. */}
      {reveal && (
        <AlertDialog open={popupOpen} onOpenChange={() => {}}>
          <AlertDialogContent
            data-testid="reserve-cover-dialog"
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t("coverNotice.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("coverNotice.body", {
                  amount: centsToBare(reveal.coverCents.toString(), locale),
                  category: reveal.categoryName,
                  available: centsToBare(
                    reveal.availableAfterCents.toString(),
                    locale,
                  ),
                  currency: budgetCurrency,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                data-testid="reserve-cover-ack"
                onClick={() => acknowledgeCover(reveal)}
              >
                {t("coverNotice.action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </DndContext>
  );
}
