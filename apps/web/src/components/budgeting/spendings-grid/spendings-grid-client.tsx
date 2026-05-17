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
    overspentCents: "0",
    balanceCents: "0",
  };
}

export function SpendingsGridClient(props: SpendingsGridClientProps) {
  const { budgetId, budgetCurrency, budgetTz, reservesEnabled = true } = props;

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

  return (
    <>
      <MonthNavigator month={month} budgetTz={budgetTz} />
      <div
        ref={gridRef}
        onScroll={handleGridScroll}
        data-testid="spendings-grid"
        // The grid is its own scroll container for both axes. Bounded height
        // (viewport minus the top app-bar + month nav, ~160px) lets the
        // sticky column-header band stick to the top of THIS container while
        // transactions scroll vertically and long category rows scroll
        // horizontally. Page body itself does not scroll horizontally.
        // pt-6 here would create a visible padding strip above the sticky
        // header band — scrolled content showed through it. Use mt-4 for the
        // breathing-room gap (lives OUTSIDE the scroll container so the
        // sticky band still pins flush at the wrapper's top edge).
        // overscroll-contain keeps a rapid vertical swipe from bleeding into
        // the page and dragging the whole document.
        // 100svh (small viewport height) — iOS Safari's URL bar collapses on
        // scroll and changes 100vh out from under us; svh stays fixed to the
        // smaller (URL-bar-expanded) state so the wrapper doesn't grow
        // beyond the visible area when the bar hides.
        style={{ overscrollBehavior: "contain" }}
        className="mt-4 overflow-auto max-h-[calc(100svh-176px)] px-3 sm:px-6 pb-6"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-2 w-fit mx-auto">
            <SortableContext
              items={localCategoryOrder.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {localCategoryOrder.map((c) => (
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
                />
              ))}
            </SortableContext>
            {/*
             * AddCategoryColumn is a sibling of SortableContext children,
             * NOT registered as a sortable item (D-PH4-D4).
             * It does NOT call useSortable — it is outside the items list.
             */}
            <AddCategoryColumn
              onClick={() => setCatSlider({ open: true, mode: "create" })}
            />
          </div>
        </DndContext>
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
        {...(catSlider.mode === "edit" && editCatInitial
          ? { initial: editCatInitial }
          : {})}
      />
    </>
  );
}
