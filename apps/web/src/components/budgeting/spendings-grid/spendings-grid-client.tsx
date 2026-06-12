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
import { TransactionSlider } from "../transaction-slider";
import { CategorySlider } from "../category-slider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clientApiFetch } from "@/lib/budget-fetch";
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
import { useMonthParam } from "@/hooks/use-month-param";
import {
  useSpendingsSummary,
  type SpendingsSummaryDTO,
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
}

export interface SpendingsGridClientProps {
  budgetId: string;
  budgetCurrency: string;
  month: string;
  budgetTz: string;
  initialCategories: CategoryDTO[];
  initialTransactions: TxnDTO[];
  initialDrafts: DraftDTO[];
  initialSummary: SpendingsSummaryDTO;
  // D-PH5-R11 cascading-hide surface 2: when false, Reserves used row is hidden in column headers.
  reservesEnabled?: boolean;
  // Phase 6 onboarding rewrite parallel: when false, the Cushion field
  // in the CategorySlider edit/create UI is hidden. Default true keeps
  // the field visible for budgets created before this flag existed.
  cushionEnabled?: boolean;
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

export function SpendingsGridClient(props: SpendingsGridClientProps) {
  const {
    budgetId,
    budgetCurrency,
    budgetTz,
    reservesEnabled = true,
    cushionEnabled = true,
  } = props;

  const { monthStr, isCurrentMonth } = useMonthParam(budgetTz);
  const month = monthStr;

  // Query hooks: hydrate from RSC initialData; live data after first refetch.
  // queryKey contract: must match mutation hooks' invalidate keys (Plan 04-03 hooks).
  const summary = useSpendingsSummary(budgetId, month, props.initialSummary);
  const txns = useTransactions(budgetId, month, {
    initialData: props.initialTransactions,
  });
  const drafts = useDrafts(budgetId, month, {
    initialData: props.initialDrafts,
  });

  const qc = useQueryClient();
  const router = useRouter();
  const tDel = useTranslations("grid.deleteCategory");
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
      const res = await clientApiFetch(
        `/budgets/${budgetId}/categories/${deleteCat.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setDeleteCat(null);
        setLocalCategoryOrder((prev) =>
          prev.filter((c) => c.id !== deleteCat.id),
        );
        qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
        qc.invalidateQueries({ queryKey: ["transactions", budgetId] });
        qc.invalidateQueries({ queryKey: ["drafts", budgetId] });
        qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  // Revert (unarchive) an archived column — NO confirm dialog (260611-vuo).
  // On success the category becomes a normal editable column again; the
  // backend replays limits for the months it was absent.
  async function unarchiveCategory(catId: string) {
    const res = await clientApiFetch(
      `/budgets/${budgetId}/categories/${catId}/unarchive`,
      { method: "POST" },
    );
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });
      qc.invalidateQueries({ queryKey: ["transactions", budgetId] });
      qc.invalidateQueries({ queryKey: ["drafts", budgetId] });
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      router.refresh();
    }
  }

  const [localCategoryOrder, setLocalCategoryOrder] = useState<CategoryDTO[]>(
    props.initialCategories,
  );
  // Re-sync when the RSC re-fetches (e.g. after CategorySlider create/edit
  // calls router.refresh()). useState + React Query initialData both hydrate
  // only once, so without this the grid keeps the stale list/summary.
  useEffect(() => {
    setLocalCategoryOrder(props.initialCategories);
    qc.setQueryData(
      ["spendings-summary", budgetId, month],
      props.initialSummary,
    );
    qc.setQueryData(
      ["transactions", budgetId, month],
      props.initialTransactions,
    );
    qc.setQueryData(["drafts", budgetId, month], props.initialDrafts);
  }, [
    props.initialCategories,
    props.initialSummary,
    props.initialTransactions,
    props.initialDrafts,
    qc,
    budgetId,
    month,
  ]);
  const reorder = useReorderCategories(budgetId);

  // Track whether the grid is scrolled FAR ENOUGH that at least HALF a
  // transaction row is hidden behind the sticky header band. A txn row is
  // min-h-[40px] + py-1 ≈ 48px; threshold at 20px = ~half-row hidden.
  const gridRef = useRef<HTMLDivElement | null>(null);
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
      iconKey: cat.iconKey,
      colorKey: cat.colorKey,
    };
  }, [catSlider.categoryId, localCategoryOrder, summaryByCatId]);

  // An archived ("keep history") category is shown ONLY in months where it has
  // at least one transaction; otherwise it's dropped from the grid (this month).
  const visibleCategories = useMemo(
    () =>
      localCategoryOrder.filter((c) => {
        if (!summaryByCatId.get(c.id)?.archived) return true;
        return (transactionsByCatId.get(c.id) ?? []).length > 0;
      }),
    [localCategoryOrder, summaryByCatId, transactionsByCatId],
  );

  return (
    <>
      <MonthNavigator month={month} budgetTz={budgetTz} />
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
        className="mt-4 overflow-auto h-[var(--grid-max-h,80vh)] px-3 sm:px-6"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-2 w-fit mx-auto">
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
                  cushionModeEnabled={summary.data?.cushionModeEnabled ?? false}
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
                    setTxSlider({ open: true, mode: "edit", txId: draftId })
                  }
                  onEditCategory={(categoryId) =>
                    setCatSlider({ open: true, mode: "edit", categoryId })
                  }
                  onPermanentDelete={() =>
                    setDeleteCat({ id: c.id, name: c.name })
                  }
                  onUnarchive={() => void unarchiveCategory(c.id)}
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
          </div>
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
    </>
  );
}
