"use client";
/**
 * investments-section.tsx — Investments section client island (Phase 9).
 *
 * Rendered LAST on the Wallets tab when investments_enabled (gated by
 * wallets-sectioned-list; self-gated here too for safety). Owns the DndContext,
 * groups holdings into collapsible groups + a flat ungrouped tail, and hosts the
 * single shared <HoldingSheet> for add/edit. Drag semantics (INV-11):
 *   - drop on a group header  → reassign group
 *   - drop on a wallet section → rejected (cross-section), toast
 *   - drop on a holding in another group → reassign to that group
 *   - drop on a holding in the same group → reorder (optimistic)
 *
 * Group-% = group value / total investments value (budget ccy), computed
 * client-side so it tracks optimistic mutations. Per-holding weight% comes from
 * the server (within-group when grouped, whole-portfolio when ungrouped).
 */
import {
  DndContext,
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { centsToBare } from "@/lib/cents-format";
import { useBudget } from "@/hooks/use-budget-data";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { useReorderHoldings } from "@/hooks/use-reorder-holdings";
import { useArchiveHolding } from "@/hooks/use-archive-holding";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { InvestmentGroupHeader } from "./investment-group-header";
import { HoldingSheet } from "./holding-sheet";

interface InvestmentsSectionProps {
  budgetId: string;
  budgetCurrency?: string;
}

const bySort = (a: HoldingDto, b: HoldingDto) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

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
  const holdings = investmentsQuery.data ?? [];
  const updateMut = useUpdateHolding(budgetId);
  const reorderMut = useReorderHoldings(budgetId);
  const archiveMut = useArchiveHolding(budgetId);

  // ── Sheet state (single shared instance for add + edit) ──
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  // ── Grouping ──
  const { groups, ungrouped, groupNames } = useMemo(() => {
    const sorted = [...holdings].sort(bySort);
    const map = new Map<string, HoldingDto[]>();
    const flat: HoldingDto[] = [];
    for (const h of sorted) {
      if (h.group) {
        const arr = map.get(h.group) ?? [];
        arr.push(h);
        map.set(h.group, arr);
      } else {
        flat.push(h);
      }
    }
    return {
      groups: map,
      ungrouped: flat,
      groupNames: Array.from(map.keys()),
    };
  }, [holdings]);

  const distinctGroups = groupNames;

  // ── Group-% (client-side, budget ccy) ──
  const totalBudgetCents = useMemo(
    () => holdings.reduce((s, h) => s + Number(h.valueInBudgetCents || 0), 0),
    [holdings],
  );
  const groupPct = (rows: HoldingDto[]) => {
    if (totalBudgetCents <= 0) return 0;
    const sum = rows.reduce((s, h) => s + Number(h.valueInBudgetCents || 0), 0);
    return (sum / totalBudgetCents) * 100;
  };

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
            stored = localStorage.getItem(`inv-group-${budgetId}-${slug(name)}`);
          } catch {
            stored = null;
          }
          next[name] = stored == null ? true : stored === "1";
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupNamesKey, budgetId]);

  const isExpanded = (name: string) => expandedMap[name] ?? true;
  const toggleGroup = (name: string) => {
    setExpandedMap((prev) => {
      const val = !(prev[name] ?? true);
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

  // ── DnD ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeHolding = activeId
    ? holdings.find((h) => h.id === activeId)
    : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const draggedId = String(active.id);
    const overId = String(over.id);
    const dragged = holdings.find((h) => h.id === draggedId);
    if (!dragged) return;

    // Drop on a group header → reassign group.
    if (overId.startsWith("group-")) {
      const groupName = overId.slice("group-".length);
      if (dragged.group !== groupName) {
        updateMut.mutate({ holdingId: dragged.id, group: groupName });
      }
      return;
    }

    // Cross-section drop (a wallet section) → rejected.
    if (overId.startsWith("section-")) {
      toast.error(tToast("crossSectionRejected"));
      return;
    }

    if (overId === draggedId) return;
    const target = holdings.find((h) => h.id === overId);
    if (!target) return;

    // Drop on a holding in a different group → reassign to that group.
    if ((target.group ?? null) !== (dragged.group ?? null)) {
      updateMut.mutate({ holdingId: dragged.id, group: target.group ?? null });
      return;
    }

    // Same group → reorder (send the full new global order).
    const allIds = [...holdings].sort(bySort).map((h) => h.id);
    const from = allIds.indexOf(draggedId);
    const to = allIds.indexOf(overId);
    if (from === -1 || to === -1 || from === to) return;
    allIds.splice(from, 1);
    allIds.splice(to, 0, draggedId);
    reorderMut.mutate({ orderedIds: allIds });
  }

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

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
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={holdings.map((h) => h.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {/* Groups (collapsible) */}
            {distinctGroups.map((name) => {
              const rows = groups.get(name) ?? [];
              return (
                <div key={name} className="flex flex-col gap-2">
                  <InvestmentGroupHeader
                    groupName={name}
                    groupPct={groupPct(rows)}
                    expanded={isExpanded(name)}
                    onToggle={() => toggleGroup(name)}
                  />
                  {isExpanded(name) &&
                    rows.map((h) => (
                      <InvestmentRowSheet
                        key={h.id}
                        holding={h}
                        onEdit={openEdit}
                        onArchive={(id) => archiveMut.mutate(id)}
                      />
                    ))}
                </div>
              );
            })}

            {/* Ungrouped — flat, always visible. */}
            {ungrouped.map((h) => (
              <InvestmentRowSheet
                key={h.id}
                holding={h}
                onEdit={openEdit}
                onArchive={(id) => archiveMut.mutate(id)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeHolding ? (
            <div className="flex min-h-[48px] items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-elevated-dark)] px-3 shadow-lg ring-1 ring-[var(--info-ring)]">
              <span className="min-w-0 flex-1 truncate text-body-md text-[var(--body-on-dark)]">
                {activeHolding.name}
              </span>
              <span className="text-num-md tabular-nums text-[var(--body-on-dark)]">
                {centsToBare(activeHolding.valueCents, locale)}
              </span>
            </div>
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
        groups={distinctGroups}
        holding={sheet.holding}
      />
    </section>
  );
}
