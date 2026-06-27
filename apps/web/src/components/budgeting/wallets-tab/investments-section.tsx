"use client";
/**
 * investments-section.tsx — Investments section client island (Phase 9 + group
 * redesign).
 *
 * Rendered LAST on the Wallets tab when investments_enabled. The list interleaves
 * GROUP blocks and LOOSE holdings in a single sortable list:
 *   - drag a GROUP (its handle)          → the whole block moves as a unit
 *   - drag a holding onto a group header  → join that group
 *   - drag a holding onto a row in another group / a loose row → move there
 *   - drag a holding within its group     → reorder within the group
 *   - drop on a wallet section            → rejected (cross-section), toast
 * The interleave + reorder maths is the pure `investment-grouping` module; this
 * island just renders entries and dispatches its DragResult to the reorder +
 * group-update mutations. Group children render indented (left rail). Group
 * amount/P/L/% are aggregated client-side so they track optimistic mutations.
 */
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
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
  flattenEntries,
  groupAggregate,
  resolveDragEnd,
  withPersistentGroups,
  groupSortId,
  isGroupSortId,
  UNGROUPED_DROP_ID,
  type InvestmentEntry,
  type DragResult,
} from "@/lib/investment-grouping";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { InvestmentGroupHeader } from "./investment-group-header";
import { HoldingSheet } from "./holding-sheet";

interface InvestmentsSectionProps {
  budgetId: string;
  budgetCurrency?: string;
}

/** A draggable, collapsible group block with an indented, sortable child list. */
function GroupBlock({
  entry,
  budgetCurrency,
  totalBudgetCents,
  maxAmountChars,
  expanded,
  onToggle,
  onEdit,
  onArchive,
}: {
  entry: Extract<InvestmentEntry, { kind: "group" }>;
  budgetCurrency: string;
  totalBudgetCents: number;
  maxAmountChars: number;
  expanded: boolean;
  onToggle: () => void;
  onEdit: (h: HoldingDto) => void;
  onArchive: (id: string) => void;
}) {
  const t = useTranslations("budget.investments");
  const agg = groupAggregate(entry.holdings);
  const portfolioPct =
    totalBudgetCents > 0 ? (agg.valueBudgetCents / totalBudgetCents) * 100 : 0;
  // A group is a DROP target (drop a holding here → join) + a DRAGGABLE block (its
  // handle). It is NOT a sortable item, so dragging a child next to it never makes
  // the whole group jump, and dragging the group never scatters the holdings (D-#dnd).
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: groupSortId(entry.name),
  });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
    transform,
  } = useDraggable({ id: groupSortId(entry.name) });
  // Drop + drag refs on the SAME outer block so the whole group (header +
  // children) moves as a unit (no overlay → lands exactly where dropped).
  const setRefs = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <div
      ref={setRefs}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        zIndex: isDragging ? 50 : undefined,
        position: isDragging ? "relative" : undefined,
      }}
      className={[
        "flex flex-col gap-2",
        isDragging
          ? "rounded-[var(--radius-md)] opacity-95 shadow-lg ring-1 ring-[var(--info-ring)]"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
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
      {expanded && (
        <div className="ml-3 flex flex-col gap-2 border-l border-[var(--hairline-dark)] pl-3">
          {/* Children are sortable items of the SECTION's single SortableContext
              (not a nested one) — a nested context can't animate a drop gap or
              collapse the source slot when a row crosses contexts (D-#dnd). */}
          {entry.holdings.map((h) => (
            <InvestmentRowSheet
              key={h.id}
              holding={h}
              nested
              maxAmountChars={maxAmountChars}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** "Remove from group" drop target (UAT #8). Rendered only while a grouped
 *  holding is being dragged — gives an always-available loose target even when a
 *  single group holds every item (no loose row to drop onto). */
function UngroupDropZone() {
  const t = useTranslations("budget.investments");
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUPED_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      data-testid="ungroup-dropzone"
      className={[
        "flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-dashed px-3 text-caption transition-colors",
        isOver
          ? "border-[var(--info-ring)] bg-[var(--surface-elevated-dark)]/60 text-[var(--body-on-dark)]"
          : "border-[var(--hairline-dark)] text-[var(--muted-foreground)]",
      ].join(" ")}
    >
      {t("ungroupZone")}
    </div>
  );
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
  // dragged holding is moved into the target group/position in this local copy on
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

  // Sortable items are HOLDINGS ONLY (group headers are droppable + draggable,
  // not sortable) — so @dnd-kit's visual arrayMove matches resolveDragEnd exactly
  // (no drop jump / move-back) and a child drag never reorders the group header.
  // Collapsed children aren't rendered → excluded to keep measurements consistent.
  const sortableIds: string[] = [];
  for (const e of entries) {
    if (e.kind === "group") {
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

  // Live-move the dragged HOLDING into the target group/position on every dragOver
  // so the DOM tracks the drag continuously (no overflow, no big transforms). A
  // group block is NOT live-moved — it moves on drop.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    if (isGroupSortId(activeId)) return;
    const overId = String(over.id);
    if (overId.startsWith("section-")) return;
    setDndHoldings((prev) => {
      const base = prev ?? holdings;
      const result = resolveDragEnd(base, activeId, overId);
      return result ? applyResult(base, result) : base;
    });
  }

  function handleDragCancel() {
    setActiveId(null);
    setDndHoldings(null);
    setDragSnapshot(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const live = dndHoldings;
    setActiveId(null);
    setDndHoldings(null);
    setDragSnapshot(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // Cross-section drop (a wallet section) → rejected.
    if (overId.startsWith("section-")) {
      toast.error(tToast("crossSectionRejected"));
      return;
    }

    // Group block → computed at drop (not live-moved).
    if (isGroupSortId(activeId)) {
      const result = resolveDragEnd(holdings, activeId, overId);
      if (result) reorderMut.mutate({ orderedIds: result.orderedIds });
      return;
    }

    // Holding → persist the LIVE arrangement (already built by onDragOver).
    const base = live ?? holdings;
    const orderedIds = base.map((h) => h.id);
    const origIds = flattenEntries(buildInvestmentEntries(holdings));
    const moved = base.find((h) => h.id === activeId);
    const original = holdings.find((h) => h.id === activeId);
    const groupChanged =
      !!moved &&
      !!original &&
      (moved.group ?? null) !== (original.group ?? null);
    if (orderedIds.join() === origIds.join() && !groupChanged) return; // no-op
    if (groupChanged && moved) {
      updateMut.mutate({ holdingId: activeId, group: moved.group ?? null });
    }
    reorderMut.mutate({ orderedIds });
  }

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

  // Show the ungroup zone only while a holding that STARTED in a group is being
  // dragged — that's the only case where "remove from group" is meaningful.
  const activeIsGrouped =
    activeId != null &&
    !isGroupSortId(activeId) &&
    (holdings.find((hh) => hh.id === activeId)?.group ?? null) != null;

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
            {displayEntries.map((entry) =>
              entry.kind === "group" ? (
                <GroupBlock
                  key={`group:${entry.name}`}
                  entry={entry}
                  budgetCurrency={budgetCurrency}
                  totalBudgetCents={totalBudgetCents}
                  maxAmountChars={maxAmountChars}
                  expanded={isExpanded(entry.name)}
                  onToggle={() => toggleGroup(entry.name)}
                  onEdit={openEdit}
                  onArchive={(id) => archiveMut.mutate(id)}
                />
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
            {activeIsGrouped && <UngroupDropZone />}
          </div>
        </SortableContext>
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
