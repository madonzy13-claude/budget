"use client";
/**
 * spendings-grid-client.tsx — Client island: DndContext + horizontal sortable columns + sliders.
 *
 * CRITICAL: transactionsByCatId + draftsByCatId are derived from useTransactions/useDrafts hook
 * .data — NOT from props directly. Props seed initialData (hydration). Live mutations update hooks.
 *
 * CRITICAL: AddCategoryColumn is rendered OUTSIDE SortableContext items list (D-PH4-D4).
 * It is sibling to the SortableContext <div>, inside DndContext only.
 *
 * dnd-kit sensor config per RESEARCH §Pattern 1: PointerSensor (distance:4),
 * TouchSensor (delay:200, tolerance:8), KeyboardSensor (sortableKeyboardCoordinates).
 * Drag listeners scoped to grip handle only — NOT on column body.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { computeScreenExtension } from "@/lib/grid-screen-anchor";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Temporal } from "temporal-polyfill";
import { CategoryColumn } from "./category-column";
import { AddCategoryColumn } from "./add-category-column";
import { MonthNavigator } from "./month-navigator";
import { SlideOnChange } from "@/components/common/slide-on-change";
import { TransactionSlider } from "../transaction-slider";
import { CategorySlider } from "../category-slider";
import { InvestmentCategorySlider } from "../investment-category-slider";
import { useTranslations, useLocale } from "next-intl";
import { clientApiWrite, isOfflineWriteError } from "@/lib/offline-write";
import { useOfflineWriteToast } from "@/hooks/use-offline-write-toast";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useReorderCategories } from "@/hooks/use-reorder-categories";
import { useBudget, useCategories } from "@/hooks/use-budget-data";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { restoreScroll } from "@/lib/restore-scroll";
import { handleGridKeyNav } from "@/lib/grid-key-nav";
import { typeaheadStep } from "@/lib/grid-typeahead";
import { formatTimestamp } from "@/lib/format-date";
import { useMonthParam } from "@/hooks/use-month-param";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isRestoreComplete } from "@/lib/query-persist";
import {
  useSpendingsSummary,
  fetchSpendingsSummary,
} from "@/hooks/use-spendings-summary";
import { useTransactions, type TxnDTO } from "@/hooks/use-transactions";
import { useDrafts, type DraftDTO } from "@/hooks/use-drafts";
import type { SpendingsSummaryCategoryDTO } from "./category-column";

export interface CategoryDTO {
  id: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  sortIndex: number;
  /** persisted cushion config (mig 0059); null = inferred. */
  cushionMode?: string | null;
}

export interface SpendingsGridClientProps {
  // SPA refactor (260616): static-shell prop only. Currency, tz, the
  // reserves/cushion feature flags and all per-month datasets are fetched
  // client-side via React Query (useBudget / useSpendingsSummary / …).
  budgetId: string;
}

/**
 * Cold-load skeleton column (SPA refactor 260616) — mirrors the deleted
 * spendings/loading.tsx ColumnCardSkeleton so a genuine cold load streams in
 * without a layout jump. Rendered INSIDE the always-mounted grid scroller so
 * the geometry effects (scroll anchor / ResizeObserver / touch) still attach on
 * mount; a warm re-nav renders real columns with zero skeleton.
 */
function ColumnSkeleton() {
  return (
    // reveal-delayed (global.css): the WHOLE column scaffold (card + dividers +
    // input outline) stays invisible for 200ms so a cache restore replaces it
    // first — no half-skeleton "weird layout" flash on warm/offline nav. Only
    // while the one-shot IDB restore is bridging though (260620): after it's
    // done, a cold column = network wait, so render at once (no blank pane).
    <div
      className={cn(
        "h-full w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl bg-[var(--surface-card-dark)] overflow-clip",
        !isRestoreComplete() && "reveal-delayed",
      )}
    >
      <div className="flex min-h-[44px] items-center gap-1.5 px-2 py-2 border-b border-[var(--hairline-dark)]">
        <Skeleton className="h-3.5 w-2.5 shrink-0" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-1 px-2 py-1.5 border-b border-[var(--hairline-dark)]"
        >
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className={`h-3.5 ${i === 2 ? "w-16" : "w-10"}`} />
        </div>
      ))}
      <div className="flex flex-1 flex-col gap-2 px-2 py-2">
        <Skeleton className="h-2.5 w-14" />
        <div className="h-9 w-full rounded-md border border-[var(--hairline-dark)]" />
        <div className="flex flex-col gap-2 pt-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-10" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Map+sort the raw categories query data into the drag-order shape. Shared by
 *  the seeding effect AND the synchronous fallback (below) so a freshly-arrived
 *  (or restored) categories cache renders columns in the SAME render — never a
 *  one-frame empty "Add category" flash while the effect catches up (260617). */
function seedCategoryOrder(data: unknown): CategoryDTO[] {
  if (!Array.isArray(data)) return [];
  return (data as Array<Record<string, unknown>>)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ""),
      iconKey: (c.iconKey as string | null) ?? null,
      colorKey: (c.colorKey as string | null) ?? null,
      sortIndex: (c.sortIndex as number | undefined) ?? 0,
      cushionMode: (c.cushionMode as string | null | undefined) ?? null,
    }))
    .sort((a, b) => a.sortIndex - b.sortIndex);
}

function defaultEmptySummary(categoryId: string): SpendingsSummaryCategoryDTO {
  return {
    categoryId,
    name: "",
    iconKey: null,
    colorKey: null,
    sortIndex: 0,
    plannedCents: "0",
    cushionCents: "0",
    activeBudgetCents: "0",
    spentCents: "0",
    reserveUsedCents: "0",
    reserveAvailableCents: "0",
    overspentCents: "0",
    balanceCents: "0",
  };
}

export function SpendingsGridClient({ budgetId }: SpendingsGridClientProps) {
  // SPA refactor (260616): fully client-data. The month comes from the URL
  // (?month) via useMonthParam; budget meta + every per-month dataset come from
  // React Query, served instantly from the warm/persisted cache (skeleton only
  // on a genuine cold load).
  //
  // The current-month DEFAULT must roll over in the user's timezone (r31 item 1).
  // The old circular-dependency (budgetTz lived only on the month-keyed summary,
  // so the default fell back to UTC) is gone: userTz comes from the session-seeded
  // UserTimezoneProvider — SSR-stable and independent of the month. The prefetch
  // + offline stale-bar use the same source so the summary query keys still match.
  const userTz = useUserTimezone();
  const { monthStr, isCurrentMonth } = useMonthParam(userTz);
  const month = monthStr;

  // queryKey contract: must match mutation hooks' invalidate keys (Plan 04-03).
  const summary = useSpendingsSummary(budgetId, month);
  const txns = useTransactions(budgetId, month);
  const drafts = useDrafts(budgetId, month);
  // localCategoryOrder seeds from this (replaces the old props.initialCategories
  // re-sync). Same key the mutation hooks invalidate: ["budget",id,"categories"].
  const categoriesQuery = useCategories(budgetId);
  const budgetQuery = useBudget(budgetId);

  // Budget meta — currency + feature flags. Defaults preserve UX while loading.
  // budgetCurrency/budgetTz prefer the summary (authoritative for the grid);
  // reservesEnabled/cushionEnabled only exist on GET /budgets/:id.
  const budgetMeta = budgetQuery.data as
    | {
        defaultCurrency?: string;
        reservesEnabled?: boolean;
        cushionEnabled?: boolean;
      }
    | undefined;
  const budgetCurrency =
    summary.data?.budgetCurrency ?? budgetMeta?.defaultCurrency ?? "USD";
  const budgetTz = summary.data?.budgetTz ?? "UTC";
  const reservesEnabled = budgetMeta?.reservesEnabled ?? true;
  const cushionEnabled = budgetMeta?.cushionEnabled ?? true;

  const qc = useQueryClient();
  const bdpStore = useBdpUiStore();
  const tDel = useTranslations("grid.deleteCategory");
  const tGrid = useTranslations("grid");
  const locale = useLocale();

  // r40 desktop keyboard nav: Tab cycles quick-add inputs, arrows walk a
  // column's rows (lib/grid-key-nav.ts). Document-level (capture) so the very
  // FIRST Tab on a fresh page load (focus on <body>) lands on the first
  // quick-add input instead of the header logo. Keys pressed while focus is
  // in the header/nav stay native — only body- or grid-scoped keys are taken.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = gridRef.current;
      if (!root) return;
      const target = e.target as HTMLElement | null;
      const fromBody =
        target === document.body ||
        target === (document.documentElement as unknown as HTMLElement);
      if (!fromBody && !(target && root.contains(target))) return;
      if (
        handleGridKeyNav(
          {
            key: e.key,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey,
            ctrlKey: e.ctrlKey,
            target: e.target,
          },
          root,
        )
      ) {
        e.preventDefault();
        return;
      }

      // r40b type-ahead: a bare letter (no Ctrl/Meta/Alt) jumps to the column
      // whose name it can uniquely identify and focuses its quick-add field.
      // DIGITS are never hijacked — they belong in the amount field.
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        /\p{L}/u.test(e.key)
      ) {
        // Never hijack the inline amount editor (an INPUT that is NOT a quick
        // input) or any other real text field — only body / rows / quick inputs.
        const inQuickInput = !!target?.matches?.(
          'input[data-testid^="quick-entry-"]',
        );
        const inOtherField =
          !!target &&
          !inQuickInput &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable);
        if (inOtherField) return;

        const now = Date.now();
        if (now - typeaheadTimeRef.current > 5000)
          typeaheadBufferRef.current = "";
        typeaheadTimeRef.current = now;
        const { buffer, jumpTo } = typeaheadStep(
          typeaheadBufferRef.current,
          e.key,
          typeaheadNamesRef.current,
        );
        typeaheadBufferRef.current = buffer;
        // Swallow the letter so it never lands in a numeric quick input.
        e.preventDefault();
        if (jumpTo) {
          root
            .querySelector<HTMLElement>(
              `[data-testid="quick-entry-${jumpTo.toLowerCase()}"]`,
            )
            ?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  const offlineToast = useOfflineWriteToast();
  // 260615-bse: one shared offline dialog for the whole grid. Both the
  // device-knows-offline pre-insert short-circuit (quick-entry) and the
  // lying-true rollback (useCreateTransaction.onOfflineError) open it.
  const [offlineDialogOpen, setOfflineDialogOpen] = useState(false);
  // Permanent-delete confirm for an archived column's trash.
  const [deleteCat, setDeleteCat] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmPermanentDelete() {
    if (!deleteCat) return;
    setDeleting(true);
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/categories/${deleteCat.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setDeleteCat(null);
        setLocalCategoryOrder((prev) =>
          prev.filter((c) => c.id !== deleteCat.id),
        );
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
        qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
        qc.invalidateQueries({ queryKey: ["transactions", budgetId] });
        qc.invalidateQueries({ queryKey: ["drafts", budgetId] });
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // The finally below resets `deleting` so the dialog button never sticks.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
    } finally {
      setDeleting(false);
    }
  }

  // Revert (unarchive) an archived column — NO confirm dialog (260611-vuo).
  // On success the category becomes a normal editable column again; the
  // backend replays limits for the months it was absent.
  async function unarchiveCategory(catId: string) {
    try {
      const res = await clientApiWrite(
        `/budgets/${budgetId}/categories/${catId}/unarchive`,
        { method: "POST" },
      );
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "categories"] });
        qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
        qc.invalidateQueries({ queryKey: ["transactions", budgetId] });
        qc.invalidateQueries({ queryKey: ["drafts", budgetId] });
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      }
    } catch (err) {
      // Honest-offline: device offline / unreachable / hung / 5xx → shared toast.
      // No spinner state for unarchive, so just refuse honestly.
      if (isOfflineWriteError(err)) {
        offlineToast();
        return;
      }
    }
  }

  const reorder = useReorderCategories(budgetId);

  const [localCategoryOrder, setLocalCategoryOrder] = useState<CategoryDTO[]>(
    [],
  );
  // Seed/refresh the drag order from the categories query — the SPA replacement
  // for the old props re-sync (router.refresh() is gone; create/edit/delete and
  // reorder now invalidate ["budget",id,"categories"]). Skipped while a reorder
  // is in flight so an in-progress optimistic drag isn't clobbered by a stale
  // background refetch; reorder's onSettled invalidates this query so the
  // authoritative new order re-seeds here once the PUT resolves. Sorted by
  // sortIndex (the server's order of record).
  useEffect(() => {
    if (reorder.isPending) return;
    if (!categoriesQuery.data) return;
    setLocalCategoryOrder(seedCategoryOrder(categoriesQuery.data));
  }, [categoriesQuery.data, reorder.isPending]);

  // Render order: the drag-managed localCategoryOrder once seeded, else a
  // SYNCHRONOUS fallback derived from the categories cache. This closes the
  // one-frame gap where data is present (isColdLoading false) but the seeding
  // effect hasn't run yet — which flashed the empty "Add category" state on a
  // warm/offline tab switch (260617 device shot).
  const effectiveCategoryOrder =
    localCategoryOrder.length > 0
      ? localCategoryOrder
      : seedCategoryOrder(categoriesQuery.data);

  // Month preload (Task 2, user spec 260616). Once the viewed month's summary is
  // in hand, background-prefetch the PAST months' spendings-summary (the grid
  // driver) so navigating back is instant. We prefetch ONLY the summary, not
  // transactions+drafts: the columns + planned/spent render from the warm
  // summary immediately, and a real visit fills txns/drafts via the hooks'
  // refetchOnMount:"always" (a visited past month also SWR-refetches the summary
  // and replaces the UI if it changed). Already-cached months are SKIPPED so
  // unchanged months aren't refetched. Bound: GET /budgets/:id carries no
  // createdAt/first-month, so we cap at a 12-month lookback (anchored at the
  // viewed month, so deeper back-navigation progressively extends the window)
  // and log the cap once.
  const preloadCapLoggedRef = useRef(false);
  useEffect(() => {
    if (!summary.isSuccess) return;
    const LOOKBACK_MONTHS = 12;
    const anchor = Temporal.PlainYearMonth.from(month);
    // 260625: warm the past months SEQUENTIALLY, not in a synchronous 12-wide
    // fan-out. Firing all 12 past-month summary prefetches at once saturated the
    // browser's ~6-connection-per-host pool and STARVED the foreground work —
    // the current month's transactions GET and, critically, the NEXT navigation
    // document — so a nav/read/write that had to queue behind the herd raced the
    // UI (the reserves-golden walk surfaced this as missing txn rows + a 3s SW
    // nav timeout falling to the offline shell). These are pure background
    // warmups, so their latency is irrelevant; awaiting each before the next
    // keeps connections free for foreground interactions. Cancelled on month
    // change / unmount so a stale chain never warms the wrong anchor.
    let cancelled = false;
    void (async () => {
      for (let i = 1; i <= LOOKBACK_MONTHS; i++) {
        if (cancelled) return;
        const m = anchor.subtract({ months: i }).toString();
        const key = ["spendings-summary", budgetId, m] as const;
        if (qc.getQueryData(key)) continue; // already cached — leave it untouched.
        await qc
          .prefetchQuery({
            queryKey: key,
            queryFn: () => fetchSpendingsSummary(budgetId, m),
            staleTime: 30_000,
          })
          .catch(() => {});
      }
    })();
    if (!preloadCapLoggedRef.current) {
      preloadCapLoggedRef.current = true;
      console.info(
        `[spendings] month preload bounded to a ${LOOKBACK_MONTHS}-month lookback ` +
          `(no budget first-month/createdAt source on GET /budgets/:id)`,
      );
    }
    return () => {
      cancelled = true;
    };
  }, [summary.isSuccess, budgetId, month, qc]);

  // Track whether the grid is scrolled FAR ENOUGH that at least HALF a
  // transaction row is hidden behind the sticky header band. A txn row is
  // min-h-[40px] + py-1 ≈ 48px; threshold at 20px = ~half-row hidden.
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Type-ahead category jump (r40b): buffer + last-keystroke time (5s idle reset)
  // + the latest visible category names (kept in a ref so the empty-dep keydown
  // listener always sees the current columns without re-attaching).
  const typeaheadBufferRef = useRef("");
  const typeaheadTimeRef = useRef(0);
  const typeaheadNamesRef = useRef<string[]>([]);
  const [gridScrolled, setGridScrolled] = useState(false);
  function handleGridScroll() {
    const t = (gridRef.current?.scrollTop ?? 0) > 20;
    setGridScrolled((prev) => (prev === t ? prev : t));
  }

  // UAT round 12: scrollTop=1 anchor + downward-cone pull-to-refresh
  // suppressor.
  //
  // Background: iOS Safari fires pull-to-refresh when the active scroll
  // container is at scrollTop === 0 AND the user pulls down — regardless
  // of how diagonal the gesture is. overscroll-behavior: none alone did
  // not fully suppress it, and the round-10/11 angle locks either broke
  // horizontal swipe (round 10) or let 45-degree gestures slip through
  // (round 11).
  //
  // Two-layer defense:
  //
  //  1. Anchor the wrapper's scrollTop to 1 on mount and whenever it
  //     hits 0 on scroll. The 1-pixel offset is visually imperceptible
  //     but removes the "at the very top" condition that triggers
  //     pull-to-refresh.
  //
  //  2. Belt-and-braces: in the touchmove listener, if the touch started
  //     at scrollTop === 0 AND dy >= 6 AND dy >= |dx| (i.e. gesture
  //     vector inside the downward 90 degree cone — pure vertical
  //     through 45 degree diagonals), call preventDefault. Pure
  //     horizontal (dy < dx) passes through, so column scroll works.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // Layer 1: anchor scrollTop away from 0.
    if (el.scrollTop === 0) el.scrollTop = 1;
    function onScroll() {
      if (!el) return;
      if (el.scrollTop === 0) el.scrollTop = 1;
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    // Layer 2: downward-cone preventDefault.
    const ACTIVATE_PX = 6;
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1 || !el) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startScrollTop = el.scrollTop;
    }
    function onMove(e: TouchEvent) {
      if (startScrollTop > 1) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const dx = Math.abs(t.clientX - startX);
      // Block any gesture inside the 90 degree downward cone (dy positive
      // AND dy >= dx — covers everything from pure vertical to 45 degree
      // diagonals on both sides). Pure horizontal (dy < dx) passes.
      if (dy >= ACTIVATE_PX && dy >= dx && e.cancelable) {
        e.preventDefault();
      }
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, []);

  // Architecture (a) — runtime-measured grid scroller bound (quick-260612-e82 R3).
  //
  // Root cause: viewport-unit math (dvh-constant) cannot know the scroller's actual
  // top offset, which changes whenever the header inset, BDP band, banner, or soft
  // keyboard shift the layout. The constant rotted across every round.
  //
  // Fix: measure scroller.getBoundingClientRect().top at runtime, write
  //   --grid-max-h: max(160px, calc(100lvh - <top>px))
  // on the element. The CSS class consumes the var. SHELL-R15: the bottom
  // anchors to the LARGE viewport (lvh) so the box extends under Safari's
  // translucent bar instead of clipping at its top edge (see updateMaxH).
  // The ResizeObserver fires on the element itself (its own size changes) plus window
  // resize and visualViewport resize/scroll cover keyboard, orientation, and bar collapse.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const isStandalone =
      typeof window !== "undefined" &&
      window.matchMedia("(display-mode: standalone)").matches;

    // One-shot env probe for home-indicator height in standalone.
    function probeEnvBottom(): number {
      const probe = document.createElement("div");
      probe.style.position = "fixed";
      probe.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
      document.body.appendChild(probe);
      const v = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      return v;
    }
    const safeBottom = isStandalone ? probeEnvBottom() : 0;
    // SHELL-R15 box-under-bar architecture: measured TOP, lvh BOTTOM.
    // R14's box bottom (visualViewport.height − top) landed exactly at the
    // Safari bar's TOP edge, so the overflow container CLIPPED content there
    // — bare black page background showed in the under-bar zone (device
    // IMG_2787) while native page-scrolling pages paint content beneath the
    // translucent bar. Anchoring the bottom to 100lvh (large viewport):
    //  - browser, bar shown:  box extends under the bar → content scrolls
    //    beneath it like a native list (no clipped dead band);
    //  - browser, bar collapsed: lvh == visible viewport → exact fit;
    //  - standalone: lvh == screen → identical to R14 (user-approved);
    //  - Chromium: lvh == vvh → geometry e2e unchanged.
    // ALL clearance still lives inside the scrolled content as the in-flow
    // tail spacer (data-grid-tail-spacer) — iOS ignores end-of-scroll
    // container padding (SHELL-R8..R10). safeBottom retained for spacer use.
    void safeBottom; // used conceptually; spacer height: JSX env+64 fallback,
    // browser-mode env+96 override in global.css ([data-grid-tail-spacer]).

    // SHELL-R16: iOS keyboard open fires visualViewport resize+scroll →
    // rect.top shifts → a recompute shrinks the fixed-height box → reflow
    // clamps scrollTop → the edited bottom row snaps back out of view (1-in-3,
    // races the keyboard animation). Freeze remeasure while a field inside the
    // scroller has focus; one rAF remeasure on focusout restores the correct
    // box height for the collapsed keyboard.
    const isKeyboardEditing = (): boolean => {
      const a = document.activeElement as HTMLElement | null;
      return !!(
        el &&
        a &&
        el.contains(a) &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          a.isContentEditable)
      );
    };

    // SHELL-R17: one-shot 100lvh probe — deterministic lvhPx for the gate fn.
    // Mirrors probeEnvBottom (:307-315); created+removed inside updateMaxH
    // so each call gets a fresh reading (orientation changes invalidate it).
    function probeLvhPx(): number {
      const p = document.createElement("div");
      p.style.position = "fixed";
      p.style.top = "0";
      p.style.left = "0";
      p.style.height = "100lvh";
      p.style.width = "0";
      p.style.visibility = "hidden";
      document.body.appendChild(p);
      const v = Math.round(p.getBoundingClientRect().height) || 0;
      p.remove();
      return v;
    }

    function updateMaxH() {
      // Freeze: skip remeasure while a field inside the scroller is focused.
      if (isKeyboardEditing()) return;
      const rect = el!.getBoundingClientRect();
      const top = Math.max(0, Math.round(rect.top));

      // SHELL-R17: iOS-browser-only extension past 100lvh to physical screen bottom.
      // Compute per-call so orientation changes (screen dim swap) are reflected.
      const isIOS =
        /iP(hone|ad|od)/.test(navigator.platform) ||
        (navigator.userAgent.includes("Mac") && "ontouchend" in document);
      const isCoarse = window.matchMedia("(pointer: coarse)").matches;
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      const screenH = portrait ? window.screen.height : window.screen.width;
      const lvhPx = probeLvhPx();
      const ext = computeScreenExtension({
        screenH,
        lvhPx,
        isCoarsePointer: isCoarse,
        isIOS,
      });

      el!.style.setProperty(
        "--grid-max-h",
        `max(160px, calc(100lvh - ${top}px + ${ext}px))`,
      );

      // Dynamic spacer — BROWSER ONLY. Standalone keeps the JSX env+64 fallback
      // (frozen, user-approved). When ext==0 (desktop/Android/Chromium) → env+96
      // exactly matching R15/R16 so e2e geometry assertions are unchanged.
      if (!isStandalone) {
        const spacerEl = el!.querySelector<HTMLElement>(
          "[data-grid-tail-spacer]",
        );
        spacerEl?.style.setProperty(
          "--grid-tail-spacer-h",
          `calc(env(safe-area-inset-bottom, 0px) + ${96 + ext}px)`,
        );
      }
    }

    // Single remeasure after the keyboard collapses: one rAF lets WebKit
    // finish restoring the layout viewport before we take the measurement.
    function onFocusOut() {
      requestAnimationFrame(() => {
        if (!isKeyboardEditing()) updateMaxH();
      });
    }

    updateMaxH();
    el.addEventListener("focusout", onFocusOut);

    const ro = new ResizeObserver(updateMaxH);
    ro.observe(el);

    window.addEventListener("resize", updateMaxH, { passive: true });
    // SHELL-R17: orientationchange fires on iOS when the user rotates the
    // device — screen.height/screen.width swap at that point, so we need a
    // fresh measurement. The resize event timing can lag the swap.
    window.addEventListener("orientationchange", updateMaxH, { passive: true });
    if (typeof window !== "undefined" && window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateMaxH);
      window.visualViewport.addEventListener("scroll", updateMaxH);
    }

    return () => {
      el.removeEventListener("focusout", onFocusOut);
      ro.disconnect();
      window.removeEventListener("resize", updateMaxH);
      window.removeEventListener("orientationchange", updateMaxH);
      if (typeof window !== "undefined" && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateMaxH);
        window.visualViewport.removeEventListener("scroll", updateMaxH);
      }
    };
  }, []);

  // Persist the grid scroll (both axes) across pill navigation (item 4). Restore
  // polls frames until the columns lay out tall/wide enough to reach the saved
  // offset (the pane remounts empty, so a one-shot rAF clamps to 0) — and wins
  // over the scrollTop=1 pull-to-refresh anchor since the target is >1.
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !bdpStore) return;
    const cancel = restoreScroll(el, {
      top: bdpStore.spendings.scrollTop ?? 0,
      left: bdpStore.spendings.scrollLeft ?? 0,
      // Longer window than the default: the grid's scrollable height only appears
      // after --grid-max-h is measured AND the columns render, which can lag on a
      // cold/SW-served remount — a 1.5s poll sometimes timed out at 0.
      timeoutMs: 4000,
    });
    const onScroll = () => {
      // Ignore the anchor's scrollTop=1 nudge — don't overwrite a real saved pos.
      if (el.scrollTop > 1) bdpStore.spendings.scrollTop = el.scrollTop;
      bdpStore.spendings.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancel();
      el.removeEventListener("scroll", onScroll);
    };
  }, [bdpStore]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Slider state machine
  const [txSlider, setTxSlider] = useState<{
    open: boolean;
    mode: "create" | "edit";
    txId?: string;
    prefillCategoryId?: string;
  }>({ open: false, mode: "create" });

  const [catSlider, setCatSlider] = useState<{
    open: boolean;
    mode: "create" | "edit";
    categoryId?: string;
  }>({ open: false, mode: "create" });

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = localCategoryOrder.findIndex((c) => c.id === active.id);
    const newIndex = localCategoryOrder.findIndex((c) => c.id === over.id);
    const newOrder = arrayMove(localCategoryOrder, oldIndex, newIndex);
    const prev = localCategoryOrder;
    setLocalCategoryOrder(newOrder);
    reorder.mutate(
      { orderedIds: newOrder.map((c) => c.id) },
      { onError: () => setLocalCategoryOrder(prev) },
    );
  }

  // Past-month date resolver (RESEARCH §Pattern 4)
  const today = Temporal.Now.plainDateISO(budgetTz);
  const ym = Temporal.PlainYearMonth.from(month);
  const resolvedQuickEntryDate = isCurrentMonth
    ? today.toString()
    : ym.toPlainDate({ day: ym.daysInMonth }).toString();

  // ---- Per-category Maps derived from query hook data (BLOCKER FIX) ----
  // These Maps MUST come from useTransactions/useDrafts hook .data — NOT from props directly,
  // because the hooks reflect live cache state after optimistic mutations + revalidates.
  const summaryByCatId = useMemo(
    () =>
      new Map((summary.data?.categories ?? []).map((c) => [c.categoryId, c])),
    [summary.data],
  );

  const transactionsByCatId = useMemo(() => {
    const m = new Map<string, TxnDTO[]>();
    for (const t of txns.data ?? []) {
      const list = m.get(t.categoryId) ?? [];
      list.push(t);
      m.set(t.categoryId, list);
    }
    // Newest first (UI-SPEC §3 — txn list ordering)
    for (const list of m.values()) {
      list.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    }
    return m;
  }, [txns.data]);

  const draftsByCatId = useMemo(() => {
    const m = new Map<string, DraftDTO[]>();
    for (const d of drafts.data ?? []) {
      const list = m.get(d.categoryId) ?? [];
      list.push(d);
      m.set(d.categoryId, list);
    }
    return m;
  }, [drafts.data]);
  // ---- end Maps derivation ----

  // Find initial data for transaction slider (edit mode)
  const editTxnInitial = useMemo(() => {
    if (!txSlider.txId) return undefined;
    const allTxns = txns.data ?? [];
    const allDrafts = drafts.data ?? [];
    const found = [...allTxns, ...allDrafts].find(
      (t) => t.id === txSlider.txId,
    );
    if (!found) return undefined;
    return {
      txId: found.id,
      date: found.transactionDate,
      categoryId: found.categoryId,
      amountOriginalCents: found.amountConvertedCents,
      currencyOriginal: found.currencyConverted,
      note: found.note ?? null,
    };
  }, [txSlider.txId, txns.data, drafts.data]);

  // Find category data for category slider (edit mode)
  const editCatInitial = useMemo(() => {
    if (!catSlider.categoryId) return undefined;
    const cat = localCategoryOrder.find((c) => c.id === catSlider.categoryId);
    if (!cat) return undefined;
    const s = summaryByCatId.get(cat.id);
    return {
      categoryId: cat.id,
      name: cat.name,
      plannedCents: s?.plannedCents ?? "0",
      cushionCents: s?.cushionCents ?? "0",
      // mig 0061: persisted needs/wants split prefills the slider's split exactly.
      needsCents: s?.needsCents ?? null,
      wantsCents: s?.wantsCents ?? null,
      // 260613-v1p: iconKey dropped from the slider initial (icon picker removed).
      colorKey: cat.colorKey,
      // mig 0059: persisted cushion mode prefills the slider's Cushion selector.
      cushionMode: (cat.cushionMode as string | null | undefined) ?? null,
      // r33: the smart Investments category uses a different edit form.
      isInvestment: s?.isInvestment ?? false,
      investmentLimitMode: s?.investmentLimitMode ?? null,
    };
  }, [catSlider.categoryId, localCategoryOrder, summaryByCatId]);

  // An archived ("keep history") category is shown ONLY in months where it has
  // at least one transaction; otherwise it's dropped from the grid (this month).
  const visibleCategories = useMemo(
    () =>
      effectiveCategoryOrder.filter((c) => {
        if (!summaryByCatId.get(c.id)?.archived) return true;
        return (transactionsByCatId.get(c.id) ?? []).length > 0;
      }),
    [effectiveCategoryOrder, summaryByCatId, transactionsByCatId],
  );
  // Feed the current column names to the type-ahead listener (see the keydown
  // effect). Render-time ref write is fine — no state, no re-render.
  typeaheadNamesRef.current = visibleCategories.map((c) => c.name);

  // Cold load = no cached summary/categories yet. A warm re-nav has both from
  // the persisted React Query cache → real columns render immediately (zero
  // skeleton); the cold skeleton lives INSIDE the mounted grid scroller below.
  const isColdLoading = summary.isPending || categoriesQuery.isPending;

  // Month ordinal drives the directional slide on month nav (prev = back,
  // next = forward) — see SlideOnChange around the columns container below.
  const monthSlideToken = (() => {
    const [y, m] = month.split("-").map((n) => Number(n));
    return (y ?? 0) * 12 + (m ?? 0);
  })();

  return (
    <>
      {/* MonthNavigator uses the same UTC month basis as the grid (useMonthParam
          above) so its default month + isCurrentMonth never disagree with the
          summary query key — see the budgetTz circular-dependency note. */}
      <MonthNavigator month={month} />
      <div
        ref={gridRef}
        onScroll={handleGridScroll}
        data-testid="spendings-grid"
        // Pulling down inside the grid must NOT reload the page — only the month
        // slider above does (it sits outside this container). See pull-to-refresh.tsx.
        data-no-pull-refresh=""
        // The grid is its own scroll container for both axes. Bounded height
        // (viewport minus the top app-bar + month nav, ~160px) lets the
        // sticky column-header band stick to the top of THIS container while
        // transactions scroll vertically and long category rows scroll
        // horizontally. Page body itself does not scroll horizontally.
        // pt-6 here would create a visible padding strip above the sticky
        // header band — scrolled content showed through it. Use mt-4 for the
        // breathing-room gap (lives OUTSIDE the scroll container so the
        // sticky band still pins flush at the wrapper's top edge).
        // overscroll-behavior: none keeps both rapid vertical swipes AND
        // diagonal horizontal swipes from bleeding into the page —
        // "contain" still let iOS Safari trigger pull-to-refresh when the
        // user's gesture had a slight downward angle during column
        // horizontal swipes (UAT round 9). "none" blocks the bounce
        // entirely on this element.
        // Architecture (a) — measured bound (quick-260612-e82 R3, see ResizeObserver effect above).
        // --grid-max-h is written by the effect: visualViewport.height − scrollerTop.
        // Because scrollerTop is MEASURED (getBoundingClientRect) it self-corrects for every band
        // above the grid (header inset, BDP band, banner) — killing the constant-rot bug.
        // SHELL-R14: FIXED height (h-, not max-h-) so the scroller box always
        // reaches the vv bottom even when content is shorter than the available
        // space — the whole screen below the band is the scroll surface (no
        // dead band where touch gestures hit the static page instead).
        // Fallback 80vh applies only pre-measure / SSR.
        // iOS WebKit ignores pb-* on scroll containers at end-of-scroll
        // (SHELL-R8..R10) so a real in-flow spacer child (below) extends
        // scrollHeight past the last row instead.
        style={{ overscrollBehavior: "none" }}
        // flex-col so the "last spending added" line can mt-auto to the
        // bottom of the visible box when the columns are short (r40).
        className="mt-4 flex flex-col overflow-auto h-[var(--grid-max-h,80vh)] px-3 sm:px-6"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SlideOnChange
            token={monthSlideToken}
            className="flex gap-2 w-fit mx-auto"
          >
            {isColdLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <ColumnSkeleton key={i} />
              ))
            ) : (
              <>
                <SortableContext
                  items={visibleCategories.map((c) => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {visibleCategories.map((c) => (
                    <CategoryColumn
                      key={c.id}
                      category={c}
                      summary={
                        summaryByCatId.get(c.id) ?? defaultEmptySummary(c.id)
                      }
                      cushionModeEnabled={
                        summary.data?.cushionModeEnabled ?? false
                      }
                      budgetCurrency={budgetCurrency}
                      transactions={transactionsByCatId.get(c.id) ?? []}
                      drafts={draftsByCatId.get(c.id) ?? []}
                      gridScrolled={gridScrolled}
                      budgetId={budgetId}
                      month={month}
                      resolvedQuickEntryDate={resolvedQuickEntryDate}
                      reservesEnabled={reservesEnabled}
                      onEditTxn={(txId) =>
                        setTxSlider({ open: true, mode: "edit", txId })
                      }
                      onEditDraft={(draftId) =>
                        setTxSlider({
                          open: true,
                          mode: "edit",
                          txId: draftId,
                        })
                      }
                      onEditCategory={(categoryId) =>
                        setCatSlider({ open: true, mode: "edit", categoryId })
                      }
                      onPermanentDelete={() =>
                        setDeleteCat({ id: c.id, name: c.name })
                      }
                      onUnarchive={() => void unarchiveCategory(c.id)}
                      onOfflineAttempt={() => setOfflineDialogOpen(true)}
                    />
                  ))}
                </SortableContext>
                {/*
                 * AddCategoryColumn is a sibling of SortableContext children,
                 * NOT registered as a sortable item (D-PH4-D4).
                 * It does NOT call useSortable — it is outside the items list.
                 *
                 * sticky top-0 pins it to the top of the scroll viewport on
                 * vertical scroll, so it stays visible as transactions
                 * scroll up. self-start prevents flex stretch from inflating
                 * it to row height. On horizontal scroll it still moves with
                 * the row (sticky only applies on the axis with offset set).
                 */}
                <div className="sticky top-0 self-start z-10">
                  <AddCategoryColumn
                    onClick={() => setCatSlider({ open: true, mode: "create" })}
                  />
                </div>
              </>
            )}
          </SlideOnChange>
        </DndContext>
        {/* iOS WebKit end-of-scroll spacer (SHELL-R8..R10): padding-bottom on
            a scroll container is ignored at the scroll tail on iOS Safari.
            A real in-flow aria-hidden block appended after all content extends
            scrollHeight so the last transaction row is reachable with clearance.
            Height: env+64px fallback here (= standalone, user-approved R14);
            browser mode gets an env+96px override in global.css
            ([data-grid-tail-spacer], unlayered) — the box now extends UNDER
            the Safari bar (lvh bottom), so the last fully-scrolled row needs
            bar height (~50px) + indicator-zone room to clear the VISIBLE area. */}
        <div
          aria-hidden
          data-grid-tail-spacer
          className="h-[calc(env(safe-area-inset-bottom,0px)+64px)] shrink-0 w-full pointer-events-none"
        />
        {/* r40: "last spending added" freshness line. LAST child so it sits at
              the very bottom of the grid box (the spacer no longer lifts it).
              IN-FLOW (not position-fixed): mt-auto drops it to the bottom edge
              when the columns are short, and when they're tall it's the final
              element you scroll to. sticky left-0 + w-full text-center keep it
              centred while the columns pan sideways so it never scrolls
              horizontally. opacity-60 fades it toward the canvas in BOTH themes
              (darker on dark, lighter on light) so it reads as a quiet footnote.
              pb safe-area clears the iOS home indicator. Per-month, user-tz
              timestamp; created_at based — edits don't bump it, delete falls back. */}
        {summary.data?.lastSpendingAddedAt && (
          <div
            data-testid="last-spending-added"
            className="sticky left-0 mt-auto w-full pt-3 pb-[env(safe-area-inset-bottom,0px)] text-center text-caption text-[var(--muted-foreground)] opacity-60"
          >
            {tGrid("lastAdded", {
              when: formatTimestamp(
                summary.data.lastSpendingAddedAt,
                locale,
                userTz,
              ),
            })}
          </div>
        )}
      </div>

      <TransactionSlider
        open={txSlider.open}
        onOpenChange={(o) => setTxSlider({ ...txSlider, open: o })}
        mode={txSlider.mode}
        budgetId={budgetId}
        month={month}
        budgetCurrency={budgetCurrency}
        categories={localCategoryOrder}
        {...(editTxnInitial ? { initial: editTxnInitial } : {})}
        {...(txSlider.prefillCategoryId
          ? { prefillCategoryId: txSlider.prefillCategoryId }
          : {})}
      />

      {/* r33: editing THE Investments category opens the smart/manual limit form
          instead of the needs/wants/cushion slider. */}
      {catSlider.mode === "edit" && editCatInitial?.isInvestment ? (
        <InvestmentCategorySlider
          open={catSlider.open}
          onOpenChange={(o) => setCatSlider({ ...catSlider, open: o })}
          budgetId={budgetId}
          budgetCurrency={budgetCurrency}
          month={month}
          initial={editCatInitial}
        />
      ) : (
        <CategorySlider
          open={catSlider.open}
          onOpenChange={(o) => setCatSlider({ ...catSlider, open: o })}
          mode={catSlider.mode}
          budgetId={budgetId}
          budgetCurrency={budgetCurrency}
          month={month}
          cushionEnabled={cushionEnabled}
          {...(catSlider.mode === "edit" && editCatInitial
            ? { initial: editCatInitial }
            : {})}
        />
      )}

      {/* Permanent-delete confirm — archived column trash. Destructive. */}
      <AlertDialog
        open={!!deleteCat}
        onOpenChange={(o) => {
          if (!o) setDeleteCat(null);
        }}
      >
        <AlertDialogContent data-testid="category-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{tDel("title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tDel("body", { name: deleteCat?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tDel("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="category-delete-confirm"
              onClick={(e) => {
                e.preventDefault();
                void confirmPermanentDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tDel("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 260615-bse: shared offline-add dialog. Opened by any column's
          quick-entry when an add is attempted offline — the popup-BEFORE-insert
          path (no optimistic row) and the rare lying-true rollback both route
          here. Single AlertDialogAction (OK) just closes it. */}
      <AlertDialog open={offlineDialogOpen} onOpenChange={setOfflineDialogOpen}>
        <AlertDialogContent data-testid="offline-add-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{tGrid("offlineDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tGrid("offlineDialog.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              data-testid="offline-add-dialog-ok"
              onClick={() => setOfflineDialogOpen(false)}
            >
              {tGrid("offlineDialog.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
