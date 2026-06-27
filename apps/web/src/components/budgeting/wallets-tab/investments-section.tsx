"use client";
/**
 * investments-section.tsx — Investments section client island (Phase 9 + group
 * redesign).
 *
 * Rendered LAST on the Wallets tab when investments_enabled. The list is a SINGLE
 * FLAT sortable: group headers AND holdings are sortable items in one container
 * (no nested DOM subtrees). Grouped children render indented under a CSS rail, but
 * are real siblings of the header — so a holding dragged across groups is a plain
 * reorder in the same parent (it never re-mounts → no mid-drag crash, D-#flat).
 *   - drag a GROUP (its handle)           → the whole block moves as a unit
 *   - drag a holding onto a group header  → join that group
 *   - drag a holding ABOVE a group header → stays loose above it (rect midpoint)
 *   - drag a holding onto a row / loose    → move there / reorder
 *   - drop a holding on a loose boundary zone → loose at the top / end (UAT #3/#4)
 *   - drag a group (overlay preview) onto a row → block lands there, last via drop
 *   - drop on a wallet section            → rejected (cross-section), toast
 * The interleave + reorder maths is the pure `investment-grouping` module; this
 * island renders entries and dispatches its DragResult to the reorder +
 * group-update mutations. Group amount/P/L/% are aggregated client-side so they
 * track optimistic mutations.
 */
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { centsToBare } from "@/lib/cents-format";
import { useBudget } from "@/hooks/use-budget-data";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { useReorderHoldings } from "@/hooks/use-reorder-holdings";
import { useArchiveHolding } from "@/hooks/use-archive-holding";
import {
  buildInvestmentEntries,
  groupAggregate,
  resolveDragEnd,
  resolveHoldingDrop,
  groupSortId,
  isGroupSortId,
  groupNameFromSortId,
  type InvestmentEntry,
  type DragResult,
} from "@/lib/investment-grouping";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { InvestmentRow } from "./investment-row";
import { InvestmentGroupHeader } from "./investment-group-header";
import { HoldingSheet } from "./holding-sheet";

interface InvestmentsSectionProps {
  budgetId: string;
  budgetCurrency?: string;
}

/**
 * Group header as a SORTABLE item (D-#flat): a single flat list slot that is a
 * drop target for "join this group" and whose handle drags the whole block. While
 * dragging, the cohesive lifted copy lives in the DragOverlay (header + children)
 * and the real block dims in place; the move commits on drop (UAT #1). The header's
 * children render as its siblings right after it. Only the drag handle starts a
 * drag (listeners on the handle, not the body) so the body click still toggles
 * collapse.
 */
function GroupHeaderItem({
  entry,
  budgetCurrency,
  totalBudgetCents,
  maxAmountChars,
  expanded,
  onToggle,
}: {
  entry: Extract<InvestmentEntry, { kind: "group" }>;
  budgetCurrency: string;
  totalBudgetCents: number;
  maxAmountChars: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("budget.investments");
  const agg = groupAggregate(entry.holdings);
  const portfolioPct =
    totalBudgetCents > 0 ? (agg.valueBudgetCents / totalBudgetCents) * 100 : 0;
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: groupSortId(entry.name),
    animateLayoutChanges: () => false,
  });
  const dndTransform = CSS.Transform.toString(transform) ?? "";
  return (
    <div
      ref={setNodeRef}
      style={{
        // While dragging, the lifted copy lives in the DragOverlay (so the whole
        // block — header + children — moves as one cohesive unit, UAT #1). The real
        // header stays in place and just dims, marking where the block will land.
        transform: isDragging
          ? undefined
          : dndTransform && dndTransform !== "none"
            ? dndTransform
            : undefined,
        transition,
      }}
      className={isDragging ? "relative opacity-40" : "relative"}
    >
      <InvestmentGroupHeader
        groupName={entry.name}
        budgetCurrency={budgetCurrency}
        valueBudgetCents={agg.valueBudgetCents}
        plPct={agg.plPct}
        plCents={agg.plCents}
        portfolioPct={portfolioPct}
        maxAmountChars={maxAmountChars}
        expanded={expanded}
        onToggle={onToggle}
        isOver={isOver}
        dragHandle={
          <RowDragHandle
            name={`group ${entry.name}`}
            listeners={listeners}
            attributes={attributes}
            ariaLabel={t("group.dragAria", { name: entry.name })}
          />
        }
      />
    </div>
  );
}

/** Cohesive drag preview for a whole group block (DragOverlay content, UAT #1):
 *  a static copy of the header + its (expanded) children that follows the pointer
 *  as one unit, while the real block dims in place. */
function GroupBlockPreview({
  entry,
  budgetCurrency,
  totalBudgetCents,
  maxAmountChars,
  expanded,
}: {
  entry: Extract<InvestmentEntry, { kind: "group" }>;
  budgetCurrency: string;
  totalBudgetCents: number;
  maxAmountChars: number;
  expanded: boolean;
}) {
  const agg = groupAggregate(entry.holdings);
  const portfolioPct =
    totalBudgetCents > 0 ? (agg.valueBudgetCents / totalBudgetCents) * 100 : 0;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] opacity-95 shadow-lg ring-1 ring-[var(--info-ring)]">
      <InvestmentGroupHeader
        groupName={entry.name}
        budgetCurrency={budgetCurrency}
        valueBudgetCents={agg.valueBudgetCents}
        plPct={agg.plPct}
        plCents={agg.plCents}
        portfolioPct={portfolioPct}
        maxAmountChars={maxAmountChars}
        expanded={expanded}
        onToggle={() => {}}
      />
      {expanded &&
        entry.holdings.map((h) => (
          <div
            key={h.id}
            className="relative ml-3 pl-3 before:absolute before:left-0 before:-top-2 before:bottom-0 before:w-px before:bg-[var(--hairline-dark)] before:content-['']"
          >
            <InvestmentRow holding={h} nested maxAmountChars={maxAmountChars} />
          </div>
        ))}
    </div>
  );
}

/** Midpoint of a dnd-kit rect (top + half height); null when the rect is absent. */
function midY(rect: { top: number; height: number } | null | undefined) {
  return rect ? rect.top + rect.height / 2 : null;
}

export function InvestmentsSection({
  budgetId,
  budgetCurrency: budgetCurrencyProp,
}: InvestmentsSectionProps) {
  const t = useTranslations("budget.investments");
  const tToast = useTranslations("budget.investments.toast");
  const locale = useLocale();

  // Self-gate (the list also gates) + currency fallback.
  const budgetQuery = useBudget(budgetId);
  const budgetMeta = budgetQuery.data as
    | {
        investmentsEnabled?: boolean;
        defaultCurrency?: string;
        default_currency?: string;
      }
    | undefined;
  const investmentsEnabled = budgetMeta?.investmentsEnabled ?? false;
  const budgetCurrency =
    budgetCurrencyProp ??
    budgetMeta?.defaultCurrency ??
    budgetMeta?.default_currency ??
    "EUR";

  const investmentsQuery = useInvestments(budgetId);
  const holdings = useMemo(
    () => investmentsQuery.data ?? [],
    [investmentsQuery.data],
  );
  // The id currently being dragged (null when idle) → drives the group-block
  // DragOverlay + the dimming of the dragged block in place.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Post-drop optimistic order: the committed arrangement applied synchronously on
  // drop so the DOM is already in its final order on the pointer-up frame. Without
  // this the row snaps back to its origin for one frame (the reorder mutation's
  // optimistic cache update lands a tick later, after `await cancelQueries`) →
  // "the item disappears then reappears" (UAT). Cleared once the server/optimistic
  // data catches up (the effect below), so it never masks later updates.
  const [committed, setCommitted] = useState<HoldingDto[] | null>(null);
  const liveHoldings = committed ?? holdings;
  useEffect(() => {
    // Fresh holdings arrived (the optimistic reorder, or a refetch) — drop the
    // post-drop override so we render live data again. Guarded to not fire mid-drag
    // (holdings is stable during a drag; only a background refetch could land).
    if (activeId === null) setCommitted(null);
  }, [holdings]);
  const updateMut = useUpdateHolding(budgetId);
  const reorderMut = useReorderHoldings(budgetId);
  const archiveMut = useArchiveHolding(budgetId);

  // ── Sheet state (single shared instance for add + edit) ──
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  // ── Interleaved entries (groups + loose) ──
  const entries = useMemo(
    () => buildInvestmentEntries(liveHoldings),
    [liveHoldings],
  );
  const groupNames = useMemo(
    () => entries.flatMap((e) => (e.kind === "group" ? [e.name] : [])),
    [entries],
  );

  const totalBudgetCents = useMemo(
    () =>
      liveHoldings.reduce((s, h) => s + Number(h.valueInBudgetCents || 0), 0),
    [liveHoldings],
  );

  // Longest formatted amount across the section (group budget-ccy amounts +
  // every holding's native amount) → drives the dynamic amount-column width so
  // the currency codes line up in a column (mirrors wallet-row, D-#align).
  const maxAmountChars = useMemo(() => {
    let max = 4;
    for (const h of liveHoldings)
      max = Math.max(max, centsToBare(h.valueCents, locale).length);
    for (const e of entries)
      if (e.kind === "group") {
        const v = groupAggregate(e.holdings).valueBudgetCents;
        max = Math.max(max, centsToBare(String(Math.round(v)), locale).length);
      }
    return max;
  }, [liveHoldings, entries, locale]);

  // ── Collapse state (localStorage, default expanded) ──
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const groupNamesKey = groupNames.join("|");
  useEffect(() => {
    setExpandedMap((prev) => {
      const next = { ...prev };
      for (const name of groupNames) {
        if (!(name in next)) {
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(
              `inv-group-${budgetId}-${slug(name)}`,
            );
          } catch {
            stored = null;
          }
          // Collapsed by default (D-#1); a stored "1"/"0" preference still wins.
          next[name] = stored == null ? false : stored === "1";
        }
      }
      return next;
    });
  }, [groupNamesKey, budgetId]);

  const isExpanded = (name: string) => expandedMap[name] ?? false;
  const toggleGroup = (name: string) => {
    setExpandedMap((prev) => {
      const val = !(prev[name] ?? false);
      try {
        localStorage.setItem(
          `inv-group-${budgetId}-${slug(name)}`,
          val ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return { ...prev, [name]: val };
    });
  };

  // Flat sortable items, in render order: each group HEADER id, then (if expanded)
  // its children, then loose rows. Group headers ARE sortable items now, so the
  // whole list lives in one SortableContext and a child never crosses contexts.
  // Collapsed children aren't rendered → excluded to keep measurements consistent.
  const sortableIds: string[] = [];
  for (const e of entries) {
    if (e.kind === "group") {
      sortableIds.push(groupSortId(e.name));
      if (isExpanded(e.name))
        for (const h of e.holdings) sortableIds.push(h.id);
    } else {
      sortableIds.push(e.holding.id);
    }
  }

  // ── DnD ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );
  // Apply a DragResult to a holdings array → new array in the result's order with
  // the moved holding's group updated. Used to seed the post-drop optimistic order
  // (`committed`) so the DOM is already final on the pointer-up frame.
  function applyResult(base: HoldingDto[], result: DragResult): HoldingDto[] {
    const map = new Map(base.map((h) => [h.id, h]));
    if (result.groupChange) {
      const h = map.get(result.groupChange.holdingId);
      if (h) map.set(h.id, { ...h, group: result.groupChange.group });
    }
    return result.orderedIds.map((id, i) => ({
      ...map.get(id)!,
      sortOrder: i,
    }));
  }

  // Each holding row's rect (top/bottom/centre) + its group, snapshotted at
  // drag-start (the STABLE, untransformed layout — reading rects mid-drag would
  // include @dnd-kit's gap transforms). The drop handler compares the dragged row's
  // translated centre to this to decide its insertion index + which group's
  // children-span it landed in.
  const dragGeomRef = useRef<
    {
      id: string;
      top: number;
      bottom: number;
      center: number;
      group: string | null;
    }[]
  >([]);

  function snapshotDragGeometry() {
    const rows: typeof dragGeomRef.current = [];
    if (typeof document !== "undefined") {
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-investment-row-wrapper]",
      )) {
        const id = el.getAttribute("data-investment-row-wrapper");
        if (!id) continue;
        const r = el.getBoundingClientRect();
        rows.push({
          id,
          top: r.top,
          bottom: r.bottom,
          center: r.top + r.height / 2,
          group: holdings.find((h) => h.id === id)?.group ?? null,
        });
      }
    }
    dragGeomRef.current = rows;
  }

  // Decide a holding's drop from geometry (children-span model): insertion index =
  // how many OTHER rows sit above the dragged centre; target group = the group
  // whose visible-children span — the full row extent of its members, EXCLUDING the
  // dragged row — contains the centre, else null (loose). So dropping on a member's
  // row joins/reorders within that group, while dropping on the header band or
  // below the last child (outside any member row) lands loose above/below it.
  function computeHoldingDrop(activeId: string, aMid: number) {
    const others = dragGeomRef.current.filter((r) => r.id !== activeId);
    const insertIndex = others.filter((r) => r.center < aMid).length;
    const spans = new Map<string, { top: number; bottom: number }>();
    for (const r of others) {
      if (!r.group) continue;
      const s = spans.get(r.group);
      if (!s) spans.set(r.group, { top: r.top, bottom: r.bottom });
      else {
        s.top = Math.min(s.top, r.top);
        s.bottom = Math.max(s.bottom, r.bottom);
      }
    }
    let targetGroup: string | null = null;
    for (const [g, s] of spans) {
      if (aMid >= s.top && aMid <= s.bottom) {
        targetGroup = g;
        break;
      }
    }
    return { insertIndex, targetGroup };
  }

  function handleDragStart(e: DragStartEvent) {
    snapshotDragGeometry();
    setActiveId(String(e.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  // No onDragOver live-move: the list is a single flat SortableContext, so
  // @dnd-kit's verticalListSortingStrategy animates EVERY reorder (within a group,
  // across groups, in/out of loose) via transforms — the rows slide, the dragged
  // row never leaves the DOM, and nothing shrinks mid-drag (UAT #4). Group
  // membership is inferred purely from the DROP target + rect direction here, and
  // committed once. (This also removes the onDragOver setState that, with
  // MeasuringStrategy.Always, used to re-fire and crash with React #185.)
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const aId = String(active.id);
    const overId = String(over.id);

    // Cross-section drop (a wallet section) → rejected.
    if (overId.startsWith("section-")) {
      toast.error(tToast("crossSectionRejected"));
      return;
    }

    const aMid = midY(active.rect.current.translated);
    const oMid = midY(over.rect);

    // A GROUP block drag commits via the over target + direction (placeAfter, UAT
    // #6) — its cohesive overlay already shows the move.
    if (isGroupSortId(aId)) {
      const placeAfter = aMid != null && oMid != null ? aMid > oMid : false;
      const result = resolveDragEnd(holdings, aId, overId, { placeAfter });
      if (result) {
        setCommitted(applyResult(holdings, result));
        reorderMut.mutate({ orderedIds: result.orderedIds });
      }
      return;
    }

    // A HOLDING drag is resolved purely by GEOMETRY (children-span model): where
    // the dragged row's centre LANDED decides its position + group, independent of
    // which item @dnd-kit reports as `over`. Dropping on a member's row joins/
    // reorders within that group; dropping on a header band or below the last child
    // (outside any member row) lands loose above/below it — so a row can always be
    // placed loose adjacent to a group and a 2-item group's items still reorder, no
    // explicit drop zones needed (UAT #1/#2 bugs).
    if (aMid == null) return;
    const { insertIndex, targetGroup } = computeHoldingDrop(aId, aMid);
    const result = resolveHoldingDrop(holdings, aId, insertIndex, targetGroup);
    if (!result) return;
    if (result.groupChange) {
      updateMut.mutate({ holdingId: aId, group: result.groupChange.group });
    }
    setCommitted(applyResult(holdings, result));
    reorderMut.mutate({ orderedIds: result.orderedIds });
  }

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

  // The group block currently being dragged → its cohesive DragOverlay preview +
  // the dimming of the real block in place (UAT #1).
  const activeGroupName =
    activeId != null && isGroupSortId(activeId)
      ? groupNameFromSortId(activeId)
      : null;
  const activeGroupEntry = activeGroupName
    ? entries.find((e) => e.kind === "group" && e.name === activeGroupName)
    : undefined;

  if (!investmentsEnabled) return null;

  return (
    <section
      data-testid="investments-section"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2"
    >
      <h3 className="flex items-center gap-1 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        {t("section.title")}
      </h3>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        // Always-measure so collisions stay accurate as @dnd-kit slides the rows
        // during a drag (the dragged rect is compared against live row rects).
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {entries.map((entry) =>
              entry.kind === "group" ? (
                <Fragment key={`group:${entry.name}`}>
                  <GroupHeaderItem
                    entry={entry}
                    budgetCurrency={budgetCurrency}
                    totalBudgetCents={totalBudgetCents}
                    maxAmountChars={maxAmountChars}
                    expanded={isExpanded(entry.name)}
                    onToggle={() => toggleGroup(entry.name)}
                  />
                  {isExpanded(entry.name) &&
                    entry.holdings.map((h) => (
                      <InvestmentRowSheet
                        key={h.id}
                        holding={h}
                        nested
                        // Dim the children of the group being dragged — the lifted
                        // copy lives in the DragOverlay (cohesive block, UAT #1).
                        ghost={activeGroupName === entry.name}
                        maxAmountChars={maxAmountChars}
                        onEdit={openEdit}
                        onArchive={(id) => archiveMut.mutate(id)}
                      />
                    ))}
                </Fragment>
              ) : (
                <InvestmentRowSheet
                  key={entry.holding.id}
                  holding={entry.holding}
                  maxAmountChars={maxAmountChars}
                  onEdit={openEdit}
                  onArchive={(id) => archiveMut.mutate(id)}
                />
              ),
            )}
          </div>
        </SortableContext>

        {/* Cohesive group drag preview (UAT #1): the whole block follows the
            pointer as one unit while the real block dims in place. Null for a
            holding drag (those keep their in-place transform). */}
        <DragOverlay>
          {activeGroupEntry && activeGroupEntry.kind === "group" ? (
            <GroupBlockPreview
              entry={activeGroupEntry}
              budgetCurrency={budgetCurrency}
              totalBudgetCents={totalBudgetCents}
              maxAmountChars={maxAmountChars}
              expanded={isExpanded(activeGroupEntry.name)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <DashedAddButton
        onClick={openAdd}
        label={t("add.cta")}
        testId="add-investment-button"
      />

      <HoldingSheet
        key={`${sheet.mode}-${sheet.holding?.id ?? "new"}-${sheet.open}`}
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        mode={sheet.mode}
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        groups={groupNames}
        holding={sheet.holding}
      />
    </section>
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
