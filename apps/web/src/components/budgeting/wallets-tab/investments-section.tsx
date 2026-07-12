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
 *
 * ⚠️ Before changing ANY drag logic, read ./INVESTMENTS-DND.md — the model, the
 * join-band geometry, the no-flicker rules, and the don'ts are each a bug we
 * already paid for, plus the live-verification recipe (@dnd-kit interaction bugs
 * don't show up in unit tests).
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
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";
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
  computeJoinBands,
  groupSortId,
  isGroupSortId,
  groupNameFromSortId,
  type InvestmentEntry,
  type DragResult,
  type GroupGeom,
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
        // header is hidden (opacity-0, not dimmed): its children are SEPARATE
        // sortables that slide independently under the list strategy, so a dimmed
        // header left a broken/overlapping remnant in place (UAT #3). The open gap
        // already marks where the block will land.
        transform: isDragging
          ? undefined
          : dndTransform && dndTransform !== "none"
            ? dndTransform
            : undefined,
        transition,
      }}
      className={isDragging ? "relative opacity-0" : "relative"}
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
    // Drop the post-drop override only once live data MATCHES it (same id order +
    // same groups). A GROUP-change drop fires TWO optimistic mutations on the same
    // cache key — reorder (sortOrder) and group (PATCH) — which land on separate
    // ticks. Clearing on the FIRST holdings change rendered the half-applied state
    // (reordered but still the OLD group) for a frame → the drop "flicker" (UAT).
    // Waiting for a full match bridges to the settled/refetched data with no flash.
    if (activeId !== null || committed == null) return;
    const sorted = [...holdings].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    const matches =
      sorted.length === committed.length &&
      sorted.every(
        (hh, i) =>
          hh.id === committed[i].id &&
          (hh.group ?? null) === (committed[i].group ?? null),
      );
    if (matches) setCommitted(null);
  }, [holdings, activeId, committed]);
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

  // The active holding's live target group during a drag → drives the dragged row's
  // indentation preview (UAT #5: it adopts the level it will drop into). Null when
  // idle or dragging a group block.
  const [dragActive, setDragActive] = useState<{
    id: string;
    group: string | null;
  } | null>(null);

  // Layout snapshotted at drag-START (the STABLE, untransformed positions — reading
  // rects mid-drag would include @dnd-kit's gap transforms). `groupSpans` is each
  // group's JOIN band: top = the header's CENTRE (so it aligns with where the list
  // strategy swaps the dragged row across the header — child below / loose above),
  // bottom = its last visible member (expanded) or the header bottom (collapsed).
  // The dragged centre inside a band → join that group; outside → loose.
  const dragGeomRef = useRef<{
    groupSpans: { group: string; top: number; bottom: number }[];
  }>({ groupSpans: [] });

  // The dragged row's CENTRE at drag-start. The live centre = this + dnd-kit's
  // `delta.y` (the raw pointer displacement) — reliable on every move, unlike
  // `active.rect.translated` which can lag → the indent preview never updated
  // (UAT). Used for BOTH the live preview and the drop so they always agree.
  const activeStartMidRef = useRef<number | null>(null);

  // `activeGroup` = the dragged item's CURRENT group (null for a loose item). The
  // group the item already belongs to is treated as "ejecting": its band starts at
  // the header BOTTOM so the indent clears the instant the item rises to cover the
  // header (UAT: "moving an item out above the group shouldn't keep the indent").
  function snapshotDragGeometry(activeGroup: string | null) {
    let geoms: GroupGeom[] = [];
    if (typeof document !== "undefined") {
      // Header rect per group (the root `investment-group-<Name>`, not -toggle/etc).
      const headers = new Map<
        string,
        { top: number; center: number; bottom: number }
      >();
      for (const el of document.querySelectorAll<HTMLElement>(
        '[data-testid^="investment-group-"]',
      )) {
        const name = (el.getAttribute("data-testid") ?? "").slice(
          "investment-group-".length,
        );
        if (!name || !groupNames.includes(name) || headers.has(name)) continue;
        const r = el.getBoundingClientRect();
        headers.set(name, {
          top: r.top,
          center: r.top + r.height / 2,
          bottom: r.bottom,
        });
      }
      // Visible member rows → the bottom of each expanded group's band.
      const memberBottoms = new Map<string, number>();
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-investment-row-wrapper]",
      )) {
        const id = el.getAttribute("data-investment-row-wrapper");
        if (!id) continue;
        const g = holdings.find((h) => h.id === id)?.group ?? null;
        if (!g) continue;
        const b = el.getBoundingClientRect().bottom;
        memberBottoms.set(g, Math.max(memberBottoms.get(g) ?? b, b));
      }
      geoms = groupNames.flatMap((name) => {
        const h = headers.get(name);
        if (!h) return [];
        return [
          {
            name,
            headerTop: h.top,
            headerCenter: h.center,
            headerBottom: h.bottom,
            memberBottom: memberBottoms.get(name) ?? null,
          },
        ];
      });
    }
    // Band TOP/BOTTOM rules live in the pure `computeJoinBands` (unit-tested): a
    // group joined from outside starts at headerTop − gap/2 (the swap point, so the
    // indent turns on the instant the row clears the header — no dead zone), while
    // ejecting / collapsed groups start at headerBottom.
    dragGeomRef.current = { groupSpans: computeJoinBands(geoms, activeGroup) };
  }

  // Which group (if any) the dragged centre is currently within → join that group;
  // null = loose (on a header band of an expanded group, in a gap, or among loose
  // rows). Pure vertical test, so the indent preview never feeds back into layout.
  function computeTargetGroup(aMid: number): string | null {
    for (const s of dragGeomRef.current.groupSpans)
      if (aMid >= s.top && aMid <= s.bottom) return s.group;
    return null;
  }

  // Insertion index in the HOLDINGS order, derived from @dnd-kit's `over` so the
  // commit matches exactly what the user sees previewed (arrayMove of the visible
  // sortable items — headers + visible holdings), then collapsed group headers are
  // expanded back to their members. This is what fixes the "drop jumps back" cases,
  // incl. reordering relative to a COLLAPSED group (its members aren't rendered, so
  // the old geometry had no anchor for them). Returns null when unresolvable.
  function computeInsertIndex(activeId: string, overId: string): number | null {
    const ai = sortableIds.indexOf(activeId);
    const oi = sortableIds.indexOf(overId);
    if (ai === -1 || oi === -1) return null;
    const moved = ai === oi ? sortableIds : arrayMove(sortableIds, ai, oi);
    const flat: string[] = [];
    for (const id of moved) {
      if (isGroupSortId(id)) {
        const name = groupNameFromSortId(id);
        if (!isExpanded(name)) {
          // Collapsed → its members aren't in `moved`; re-insert them in order.
          for (const h of holdings
            .filter((h) => (h.group ?? null) === name && h.id !== activeId)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
            flat.push(h.id);
        }
        // Expanded → members are their own ids in `moved`; skip the header.
      } else {
        flat.push(id);
      }
    }
    const idx = flat.indexOf(activeId);
    return idx === -1 ? null : idx;
  }

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    const activeGroup = isGroupSortId(id)
      ? null
      : (holdings.find((h) => h.id === id)?.group ?? null);
    snapshotDragGeometry(activeGroup);
    setActiveId(id);
    // Capture the dragged row's start centre from its untransformed rect.
    const el = isGroupSortId(id)
      ? document.querySelector<HTMLElement>(
          `[data-testid="investment-group-${groupNameFromSortId(id)}"]`,
        )
      : document.querySelector<HTMLElement>(
          `[data-investment-row-wrapper="${id}"]`,
        );
    activeStartMidRef.current = el
      ? (() => {
          const r = el.getBoundingClientRect();
          return r.top + r.height / 2;
        })()
      : null;
    if (!isGroupSortId(id))
      setDragActive({
        id,
        group: holdings.find((h) => h.id === id)?.group ?? null,
      });
  }

  // The dragged centre, live, from the start centre + dnd-kit's pointer delta.
  function liveMid(deltaY: number): number | null {
    return activeStartMidRef.current == null
      ? null
      : activeStartMidRef.current + deltaY;
  }

  // Track the dragged holding's live target group so its row previews the indent of
  // the level it will land in (UAT). Fires on EVERY move (onDragMove, not onDragOver)
  // and we only setState when the group actually changes → no re-measure loop / #185.
  function handleDragMove(e: DragMoveEvent) {
    const aId = String(e.active.id);
    if (isGroupSortId(aId)) return;
    const aMid = liveMid(e.delta.y);
    if (aMid == null) return;
    const group = computeTargetGroup(aMid);
    setDragActive((prev) =>
      prev && prev.id === aId && prev.group === group
        ? prev
        : { id: aId, group },
    );
  }

  function handleDragCancel() {
    setActiveId(null);
    setDragActive(null);
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
    setDragActive(null);
    if (!over) return;
    const aId = String(active.id);
    const overId = String(over.id);

    // Cross-section drop (a wallet section) → rejected.
    if (overId.startsWith("section-")) {
      toast.error(tToast("crossSectionRejected"));
      return;
    }

    const aMid = liveMid(e.delta.y);
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

    // A HOLDING drag: POSITION comes from @dnd-kit's `over` (so the commit equals
    // the previewed gap — no jump-back, and it works against a COLLAPSED group);
    // GROUP comes from the children-span (dragged centre inside a group's member
    // band → join; on a header band / gap / loose → loose).
    if (aMid == null) return;
    const insertIndex = computeInsertIndex(aId, overId);
    if (insertIndex == null) return;
    const targetGroup = computeTargetGroup(aMid);
    const result = resolveHoldingDrop(holdings, aId, insertIndex, targetGroup);
    if (!result) return;
    if (result.groupChange) {
      // Silent: a drag is not a "saved" moment — the reorder already feels done
      // (UAT: no "Investments updated" toast on sort).
      updateMut.mutate({
        holdingId: aId,
        group: result.groupChange.group,
        silent: true,
      });
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

  // A holding row is indented when it's a grouped child. WHILE that row is being
  // dragged, it previews the level it will land in instead (UAT #5: indent appears
  // when entering a group, disappears when leaving) — `dragActive.group` is the
  // live target from onDragOver.
  const rowNested = (holdingId: string, defaultNested: boolean) =>
    dragActive && dragActive.id === holdingId
      ? dragActive.group != null
      : defaultNested;

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
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          {/* FLAT children — every header and holding is a DIRECT child of this one
              container (no per-group <Fragment> wrapper). A <Fragment> is a
              reconciliation boundary: a holding moving in/out of a group's Fragment
              on drop would unmount at the old spot and remount at the new one, so the
              row blinked out for a frame ("disappears then reappears", UAT). As a
              flat list keyed by holding id, React MOVES the row instead → no remount,
              no flicker. */}
          <div className="flex flex-col gap-2">
            {entries.flatMap((entry) =>
              entry.kind === "group"
                ? [
                    <GroupHeaderItem
                      key={`group:${entry.name}`}
                      entry={entry}
                      budgetCurrency={budgetCurrency}
                      totalBudgetCents={totalBudgetCents}
                      maxAmountChars={maxAmountChars}
                      expanded={isExpanded(entry.name)}
                      onToggle={() => toggleGroup(entry.name)}
                    />,
                    ...(isExpanded(entry.name)
                      ? entry.holdings.map((h) => (
                          <InvestmentRowSheet
                            key={h.id}
                            holding={h}
                            nested={rowNested(h.id, true)}
                            // Dim the children of the group being dragged — the
                            // lifted copy lives in the DragOverlay (cohesive block).
                            ghost={activeGroupName === entry.name}
                            maxAmountChars={maxAmountChars}
                            onEdit={openEdit}
                            onArchive={(id) => archiveMut.mutate(id)}
                          />
                        ))
                      : []),
                  ]
                : [
                    <InvestmentRowSheet
                      key={entry.holding.id}
                      holding={entry.holding}
                      nested={rowNested(entry.holding.id, false)}
                      maxAmountChars={maxAmountChars}
                      onEdit={openEdit}
                      onArchive={(id) => archiveMut.mutate(id)}
                    />,
                  ],
            )}
          </div>
        </SortableContext>

        {/* Cohesive group drag preview (UAT #1): the whole block follows the
            pointer as one unit while the real block dims in place. Null for a
            holding drag (those keep their in-place transform).
            dropAnimation={null}: with the overlay mounted, @dnd-kit's default drop
            animation pins the SOURCE row at opacity:0 for ~250ms after pointer-up
            while it "flies" the overlay home — even for a holding drag (overlay
            child null) → the dropped row blinks out then back ("flicker", UAT). We
            already place the row instantly via `committed`, so the animation is
            pure downside; disabling it makes the drop land with no blink. */}
        <DragOverlay dropAnimation={null}>
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
