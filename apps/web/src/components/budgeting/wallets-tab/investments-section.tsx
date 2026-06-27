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
  pointerWithin,
  useDroppable,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Fragment, useEffect, useMemo, useState } from "react";
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
  withPersistentGroups,
  groupSortId,
  isGroupSortId,
  groupNameFromSortId,
  UNGROUPED_DROP_ID,
  LOOSE_TOP_DROP_ID,
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

/**
 * closestCenter compares the DRAGGED item's rect centre to droppables, so a tall
 * holding row dragged over a loose boundary zone never selects it (its centre
 * stays nearer the rows). Prioritise a zone whenever the POINTER is within it
 * (pointerWithin), and fall back to closestCenter for the normal row/group
 * reorder + join targets (UAT #3/#4/#8).
 */
const collisionDetection: CollisionDetection = (args) => {
  const zoneHit = pointerWithin(args).find(
    (c) => c.id === UNGROUPED_DROP_ID || c.id === LOOSE_TOP_DROP_ID,
  );
  return zoneHit ? [zoneHit] : closestCenter(args);
};

/** A dashed loose drop zone (UAT #3/#4/#8): a reliable target to land a holding
 *  loose at the very top (above a leading group) or end (below a trailing group /
 *  remove from group). Rendered only while a holding is dragged. */
function LooseZone({
  id,
  label,
  testId,
}: {
  id: string;
  label: string;
  testId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-testid={testId}
      className={[
        "flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-dashed px-3 text-caption transition-colors",
        isOver
          ? "border-[var(--info-ring)] bg-[var(--surface-elevated-dark)]/60 text-[var(--body-on-dark)]"
          : "border-[var(--hairline-dark)] text-[var(--muted-foreground)]",
      ].join(" ")}
    >
      {label}
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
  // Live arrangement during a drag (canonical @dnd-kit onDragOver pattern): the
  // dragged holding/group is moved into the target position in this local copy on
  // every dragOver, so the DOM continuously reflects the drag — the target group
  // grows as the row enters it (no overflow), @dnd-kit only animates tiny deltas,
  // and the drop is already in place. Null when not dragging → server data.
  const [dndHoldings, setDndHoldings] = useState<HoldingDto[] | null>(null);
  const liveHoldings = dndHoldings ?? holdings;
  // Ordered entry keys captured at drag-start. While dragging, a group whose last
  // member is pulled out would vanish mid-drag (its block is no longer built from
  // liveHoldings) — but it should persist as an empty drop target until the row is
  // actually DROPPED elsewhere (so the user can still drop it back in). We re-inject
  // such emptied groups at their snapshot position. Null when not dragging.
  const [dragSnapshot, setDragSnapshot] = useState<
    { key: string; group?: string }[] | null
  >(null);
  // The id currently being dragged (null when idle) → drives the ungroup-zone
  // visibility so it only appears while a GROUPED holding is in flight (UAT #8).
  const [activeId, setActiveId] = useState<string | null>(null);
  const updateMut = useUpdateHolding(budgetId);
  const reorderMut = useReorderHoldings(budgetId);
  const archiveMut = useArchiveHolding(budgetId);

  // ── Sheet state (single shared instance for add + edit) ──
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  // ── Interleaved entries (groups + loose) — from the LIVE arrangement ──
  const entries = useMemo(
    () => buildInvestmentEntries(liveHoldings),
    [liveHoldings],
  );
  const groupNames = useMemo(
    () => entries.flatMap((e) => (e.kind === "group" ? [e.name] : [])),
    [entries],
  );

  // What we actually render: `entries`, plus any group emptied mid-drag re-inserted
  // in place (so it stays visible + droppable until the row is dropped elsewhere).
  const displayEntries = useMemo<InvestmentEntry[]>(
    () =>
      dragSnapshot ? withPersistentGroups(entries, dragSnapshot) : entries,
    [entries, dragSnapshot],
  );

  // Entry shape from the STABLE server data (NOT the live drag copy) — drives the
  // loose-zone visibility. If it used the live arrangement, dragging a row to the
  // top would make the live-first a loose row → firstIsGroup flips false → the top
  // zone unmounts → collision falls to the group header → the row re-joins → group
  // first again → zone remounts: an unmount/remount oscillation that crashes with
  // React #185 (the "ERROR moving an item to the top"). Stable data → zone stays.
  const baseEntries = useMemo(
    () => buildInvestmentEntries(holdings),
    [holdings],
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
  for (const e of displayEntries) {
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
  // the moved holding's group updated (used for the live onDragOver arrangement).
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

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDndHoldings([...holdings]);
    // Snapshot the current entry order so an emptied group can be kept in place.
    setDragSnapshot(
      entries.map((e) =>
        e.kind === "group"
          ? { key: `group:${e.name}`, group: e.name }
          : { key: `loose:${e.holding.id}` },
      ),
    );
  }

  // Live-move the dragged HOLDING into the target position on every dragOver so the
  // DOM tracks the drag continuously (no overflow, no big transforms). A GROUP block
  // is NOT live-moved — its cohesive preview lives in the DragOverlay and it commits
  // on drop. (Live-moving a group + MeasuringStrategy.Always re-measures every
  // reorder → re-fires onDragOver → never converges → React #185 max-update-depth.)
  // Rect midpoint gives the direction the pure module can't see: a holding dragged
  // ABOVE a group header stays loose instead of joining (asLoose, UAT #5/#7).
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    if (oId.startsWith("section-")) return;
    if (isGroupSortId(aId)) return; // group blocks move on drop, not live

    const aMid = midY(active.rect.current.translated);
    const oMid = midY(over.rect);
    const aboveTarget = aMid != null && oMid != null ? aMid < oMid : false;

    setDndHoldings((prev) => {
      const base = prev ?? holdings;
      const result = isGroupSortId(oId)
        ? resolveDragEnd(base, aId, oId, { asLoose: aboveTarget })
        : resolveDragEnd(base, aId, oId);
      if (!result) return base;
      // Live-move ONLY for a cross-context change (group re-nesting) or a loose
      // zone. A same-group / loose-to-loose reorder is left to @dnd-kit's native
      // sorting so the gap SLIDES — live-reordering the array every frame swaps the
      // DOM nodes, resetting the sort transforms, so the row JUMPS instead of
      // animating ("no animation inside the group"). The final order is recomputed
      // from the stable holdings on drop, so skipping the live-move is lossless.
      const isZone = oId === UNGROUPED_DROP_ID || oId === LOOSE_TOP_DROP_ID;
      if (!result.groupChange && !isZone) return base;
      return applyResult(base, result);
    });
  }

  function handleDragCancel() {
    setActiveId(null);
    setDndHoldings(null);
    setDragSnapshot(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    setDndHoldings(null);
    setDragSnapshot(null);
    if (!over) return;
    const aId = String(active.id);
    const overId = String(over.id);

    // Cross-section drop (a wallet section) → rejected.
    if (overId.startsWith("section-")) {
      toast.error(tToast("crossSectionRejected"));
      return;
    }

    // Everything commits from the STABLE holdings + the drop target — never the
    // live arrangement (which may not exist for a same-context reorder left to
    // @dnd-kit). Direction from the final drop rects: a group block dropped BELOW
    // its anchor lands after it (placeAfter, UAT #6); a holding dropped ABOVE a
    // group header stays loose (asLoose, UAT #5/#7).
    const aMid = midY(active.rect.current.translated);
    const oMid = midY(over.rect);

    if (isGroupSortId(aId)) {
      const placeAfter = aMid != null && oMid != null ? aMid > oMid : false;
      const result = resolveDragEnd(holdings, aId, overId, { placeAfter });
      if (result) reorderMut.mutate({ orderedIds: result.orderedIds });
      return;
    }

    const asLoose =
      isGroupSortId(overId) && aMid != null && oMid != null && aMid < oMid;
    const result = isGroupSortId(overId)
      ? resolveDragEnd(holdings, aId, overId, { asLoose })
      : resolveDragEnd(holdings, aId, overId);
    if (!result) return;
    if (result.groupChange) {
      updateMut.mutate({ holdingId: aId, group: result.groupChange.group });
    }
    reorderMut.mutate({ orderedIds: result.orderedIds });
  }

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

  // Show the bottom "remove from group" zone only while a holding that STARTED in
  // a group is being dragged — that's the only case where ungroup is meaningful.
  const activeIsGrouped =
    activeId != null &&
    !isGroupSortId(activeId) &&
    (holdings.find((hh) => hh.id === activeId)?.group ?? null) != null;
  const activeIsHolding = activeId != null && !isGroupSortId(activeId);
  const activeGroupName =
    activeId != null && isGroupSortId(activeId)
      ? groupNameFromSortId(activeId)
      : null;
  const activeGroupEntry = activeGroupName
    ? displayEntries.find(
        (e) => e.kind === "group" && e.name === activeGroupName,
      )
    : undefined;
  // Loose boundary zones (UAT #3/#4): a top zone when the first entry is a group
  // (land a row loose ABOVE it) and a bottom zone when the last entry is a group
  // or the dragged row is grouped (land it loose BELOW / remove from group).
  const firstIsGroup = baseEntries[0]?.kind === "group";
  const lastIsGroup = baseEntries[baseEntries.length - 1]?.kind === "group";
  const topZoneVisible = activeIsHolding && firstIsGroup;
  const bottomZoneVisible = activeIsHolding && (activeIsGrouped || lastIsGroup);

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
        collisionDetection={collisionDetection}
        // Always-measure so the ungroup zone (mounted only mid-drag) is registered
        // as a drop target the moment it appears (UAT #8).
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {topZoneVisible && (
              <LooseZone
                id={LOOSE_TOP_DROP_ID}
                testId="loose-top-dropzone"
                label={t("looseZone")}
              />
            )}
            {displayEntries.map((entry) =>
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
            {bottomZoneVisible && (
              <LooseZone
                id={UNGROUPED_DROP_ID}
                testId="ungroup-dropzone"
                label={activeIsGrouped ? t("ungroupZone") : t("looseZone")}
              />
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
