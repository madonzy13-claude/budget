"use client";
/**
 * investments-section.tsx — Investments section client island (Phase 9, type
 * groups since Phase 13).
 *
 * Rendered LAST on the Wallets tab when investments_enabled. Holdings render
 * as one BLOCK per investment type that has holdings (D-13): an
 * InvestmentTypeHeader (value · total P/L incl. realized · lifetime %) and its
 * rows. Types with realized gain but no holdings are hidden; their realized
 * still shows as a muted line under the section total (D-14). Block order =
 * the budget's saved type order, then picker order (D-12).
 *
 * Drag: a block moves by its header handle (order saved per budget); a row
 * moves only within its own type — a drop on another type is a no-op.
 * ⚠️ Before changing ANY drag logic, read ./INVESTMENTS-DND.md.
 */
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DashedAddButton } from "@/components/common/dashed-add-button";
import { centsToBare, centsToRounded } from "@/lib/cents-format";
import { amountColumnChars } from "@/lib/amount-column";
import { useBudget } from "@/hooks/use-budget-data";
import { useInvestments, type HoldingDto } from "@/hooks/use-investments";
import { useSetTypeOrder, useTypeSummary } from "@/hooks/use-type-summary";
import { useReorderHoldings } from "@/hooks/use-reorder-holdings";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { setDndDragging } from "@/lib/dnd-dragging";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { parseDecimal } from "@/lib/decimal";
import { unitPriceCents, type UiType } from "@/lib/investment-types";
import { useDeleteHolding } from "@/hooks/use-delete-holding";
import {
  buildTypeBlocks,
  moveTypeBlock,
  portfolioPL,
  typeGroupPL,
  typeOf,
  type TypeBlock,
} from "@/lib/investment-type-groups";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { sharePercentLabel } from "@/lib/share-bar";
import { InvestmentTypeHeader } from "./investment-type-header";
import { HoldingSheet } from "./holding-sheet";
import { SellSheet } from "./sell-sheet";

interface InvestmentsSectionProps {
  budgetId: string;
  budgetCurrency?: string;
  /** Every asset on the tab, in budget currency — denominator for the header's
   *  share. Share BETWEEN sections, not within one (user, 260823). */
  assetsTotalBudgetCents?: number;
}

const BLOCK = "type:";
const blockId = (ui: UiType) => `${BLOCK}${ui}`;
const isBlockId = (id: string) => id.startsWith(BLOCK);

/** A type block as ONE sortable item: its header carries the drag handle, so
 *  header + rows move together. Rows sort in the block's own context. */
function SortableTypeBlock({
  uiType,
  children,
  header,
}: {
  uiType: UiType;
  header: (handle: React.ReactNode) => React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("budget.investments");
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: blockId(uiType), animateLayoutChanges: () => false });
  const name = t(`uitype.${uiType}`);
  return (
    <div
      ref={setNodeRef}
      data-testid={`investment-type-block-${uiType}`}
      style={{
        transform: CSS.Transform.toString(transform) ?? undefined,
        transition,
      }}
      className={[
        "flex flex-col gap-2",
        isDragging ? "relative z-50" : "",
      ].join(" ")}
    >
      {header(
        <RowDragHandle
          name={`type ${uiType}`}
          listeners={listeners}
          attributes={attributes}
          ariaLabel={t("group.dragAria", { name })}
        />,
      )}
      {children}
    </div>
  );
}

export function InvestmentsSection({
  budgetId,
  budgetCurrency: budgetCurrencyProp,
  assetsTotalBudgetCents,
}: InvestmentsSectionProps) {
  const t = useTranslations("budget.investments");
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
  const summary = useTypeSummary(budgetId).data;
  const serverHoldings = useMemo(
    // Possessions share the holdings endpoint but render in their own section.
    () =>
      (investmentsQuery.data ?? []).filter(
        (h) => h.holdingType !== "possession",
      ),
    [investmentsQuery.data],
  );
  // Post-drop optimistic orders, applied synchronously on drop so the DOM is
  // final on the pointer-up frame (the mutations' cache updates land a tick
  // later, after `await cancelQueries` → one frame of snap-back). Each clears
  // once the live data matches it.
  const [committed, setCommitted] = useState<HoldingDto[] | null>(null);
  const [committedOrder, setCommittedOrder] = useState<UiType[] | null>(null);
  const holdings = committed ?? serverHoldings;
  const typeOrder = committedOrder ?? summary?.order ?? [];
  useEffect(() => {
    if (!committed) return;
    const live = [...serverHoldings].sort((a, b) => a.sortOrder - b.sortOrder);
    if (live.map((h) => h.id).join() === committed.map((h) => h.id).join())
      setCommitted(null);
  }, [serverHoldings, committed]);
  useEffect(() => {
    if (committedOrder && summary?.order.join() === committedOrder.join())
      setCommittedOrder(null);
  }, [summary?.order, committedOrder]);
  const [draggingBlock, setDraggingBlock] = useState(false);
  const updateMut = useUpdateHolding(budgetId);
  const reorderMut = useReorderHoldings(budgetId);
  const setOrderMut = useSetTypeOrder(budgetId);
  const deleteMut = useDeleteHolding(budgetId);
  // One Sell sheet for the section (D-01).
  const [selling, setSelling] = useState<HoldingDto | null>(null);

  /**
   * 260731: inline value edit on a manual-value row (cash / broker / savings —
   * quantity is 1, so the typed number IS the current value). Only the CURRENT
   * price moves; the buy price stays the cost basis, so savings keeps its
   * "started at" figure and the %-change stays honest.
   */
  // The row edits the TOTAL; the price is per unit (user, 261023).
  async function saveInlineValue(holding: HoldingDto, amount: string) {
    const cents = parseDecimal(amount);
    if (cents === null) return;
    await updateMut.mutateAsync({
      holdingId: holding.id,
      currentPriceCents: unitPriceCents(cents, holding.quantity),
    });
  }

  // ── Sheet state (single shared instance for add + edit) ──
  const [sheet, setSheet] = useState<{
    open: boolean;
    mode: "create" | "edit";
    holding: HoldingDto | null;
  }>({ open: false, mode: "create", holding: null });

  // ── Type blocks (D-12..D-16) ──
  const blocks = useMemo(
    () => buildTypeBlocks(holdings, typeOrder),
    [holdings, typeOrder],
  );
  const blockPL = useMemo(
    () =>
      new Map(
        blocks.map((b) => [
          b.uiType,
          typeGroupPL(b.holdings, summary?.types[b.uiType]),
        ]),
      ),
    [blocks, summary],
  );
  const total = useMemo(
    () => portfolioPL(holdings, summary),
    [holdings, summary],
  );
  const totalBudgetCents = total.valueBudgetCents;
  const investmentsShare = sharePercentLabel(
    totalBudgetCents,
    assetsTotalBudgetCents,
  );

  // Longest formatted amount → dynamic amount-column width so the currency
  // codes line up in a column (mirrors wallet-row, D-#align). Headers share one
  // width; each block's rows get their own.
  const amountCols = useMemo(
    () =>
      amountColumnChars(
        blocks.map((b) =>
          centsToBare(
            String(Math.round(blockPL.get(b.uiType)?.valueBudgetCents ?? 0)),
            locale,
          ),
        ),
        Object.fromEntries(
          blocks.map((b) => [
            b.uiType,
            b.holdings.map((h) => centsToBare(h.valueCents, locale)),
          ]),
        ),
      ),
    [blocks, blockPL, locale],
  );

  // ── Collapse state per type (localStorage, default expanded) ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const typesKey = blocks.map((b) => b.uiType).join("|");
  useEffect(() => {
    setCollapsed((prev) => {
      const next = { ...prev };
      for (const b of blocks)
        if (!(b.uiType in next)) {
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(`inv-type-${budgetId}-${b.uiType}`);
          } catch {
            stored = null;
          }
          next[b.uiType] = stored === "0";
        }
      return next;
    });
  }, [typesKey, budgetId]);
  // Blocks collapse while one is dragged, for a stable target (UI-SPEC).
  const isExpanded = (ui: UiType) => !draggingBlock && !collapsed[ui];
  const toggleType = (ui: UiType) =>
    setCollapsed((prev) => {
      const nowCollapsed = !prev[ui];
      try {
        localStorage.setItem(
          `inv-type-${budgetId}-${ui}`,
          nowCollapsed ? "0" : "1",
        );
      } catch {
        /* ignore */
      }
      return { ...prev, [ui]: nowCollapsed };
    });

  // ── DnD (D-12) ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  // Blocks and rows share one DndContext, so the big block droppables would win
  // closestCenter for a row drag. Each drag only sees its own kind: a block sees
  // blocks, a row sees rows of ITS type (cross-type drop impossible, D-12).
  const collisionDetection: CollisionDetection = (args) => {
    const aId = String(args.active.id);
    const aType = isBlockId(aId) ? null : holdings.find((h) => h.id === aId);
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        const id = String(c.id);
        if (!aType) return isBlockId(id);
        const o = holdings.find((h) => h.id === id);
        return !!o && typeOf(o) === typeOf(aType);
      }),
    });
  };

  function handleDragStart(e: DragStartEvent) {
    setDndDragging(true);
    if (isBlockId(String(e.active.id))) setDraggingBlock(true);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDndDragging(false);
    setDraggingBlock(false);
    const { active, over } = e;
    if (!over) return;
    const aId = String(active.id);
    const oId = String(over.id);
    const typeOfId = (id: string): UiType | null => {
      if (isBlockId(id)) return id.slice(BLOCK.length) as UiType;
      const h = holdings.find((x) => x.id === id);
      return h ? typeOf(h) : null;
    };

    if (isBlockId(aId)) {
      const from = typeOfId(aId);
      const to = typeOfId(oId);
      if (!from || !to || from === to) return;
      const next = moveTypeBlock(
        blocks.map((b) => b.uiType),
        from,
        to,
      );
      setCommittedOrder(next);
      setOrderMut.mutate(next);
      return;
    }

    // A row moves only within its own type (D-12): anything else is a no-op.
    const from = typeOfId(aId);
    if (!from || isBlockId(oId) || typeOfId(oId) !== from || aId === oId)
      return;
    const moved: TypeBlock[] = blocks.map((b) => {
      if (b.uiType !== from) return b;
      const ids = b.holdings.map((h) => h.id);
      return {
        ...b,
        holdings: arrayMove(b.holdings, ids.indexOf(aId), ids.indexOf(oId)),
      };
    });
    const flat = moved.flatMap((b) => b.holdings);
    setCommitted(flat.map((h, i) => ({ ...h, sortOrder: i + 1 })));
    reorderMut.mutate({ orderedIds: flat.map((h) => h.id) });
  }

  function handleDragCancel() {
    setDndDragging(false);
    setDraggingBlock(false);
  }

  function openEdit(holding: HoldingDto) {
    setSheet({ open: true, mode: "edit", holding });
  }
  function openAdd() {
    setSheet({ open: true, mode: "create", holding: null });
  }

  if (!investmentsEnabled) return null;

  const signed = (cents: number) =>
    `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${centsToBare(String(Math.round(Math.abs(cents))), locale)}`;

  return (
    <section
      data-testid="investments-section"
      className="flex flex-col gap-2 rounded-[var(--radius-lg)] p-2"
    >
      {/* Like every wallet section, the header reports what this one holds in
          BUDGET currency (user, 260822). The columns it has to line up with are
          the INVESTMENT row's, which differ from a wallet row's: a P/L gutter,
          then currency tight to the amount on `gap-1`, then the trash. Matching
          the row's own `gap-2 px-3` is what puts the two numbers on one axis. */}
      {/* Same treatment as every wallet section: one formatted string with the
          short currency sign, so nothing has to align against the rows. */}
      <h3 className="flex items-center gap-2 px-3 text-caption uppercase tracking-wider text-[var(--muted-foreground)]">
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="min-w-0 truncate">{t("section.title")}</span>
          {/* Phone has no share column, so the share sits beside the name,
              as on every wallet section (user, 261024). */}
          {investmentsShare !== null && (
            <span
              data-testid="section-share-inline-INVESTMENTS"
              className="shrink-0 normal-case tabular-nums tracking-normal opacity-60 sm:hidden"
            >
              {investmentsShare}
            </span>
          )}
        </span>
        <span
          data-testid="section-total-INVESTMENTS"
          // normal-case: the h3 is uppercase for its LABEL, and that was
          // turning the currency sign into "ZŁ" (user, 260823).
          className="shrink-0 normal-case tabular-nums tracking-normal opacity-60"
        >
          {centsToRounded(
            String(Math.round(totalBudgetCents)),
            budgetCurrency,
            "en",
            true,
          )}
        </span>
        <span
          data-testid="section-share-INVESTMENTS"
          className="hidden w-16 shrink-0 text-right text-num-sm tabular-nums tracking-normal sm:block"
        >
          {investmentsShare ?? ""}
        </span>
        <span className="hidden w-7 shrink-0 sm:block" aria-hidden="true" />
      </h3>

      {/* D-14: realized of types with no holdings left still counts. */}
      {total.hiddenRealizedCents !== 0 && (
        <p
          data-testid="investments-total-realized"
          className="px-3 text-[12px] leading-[1.4]"
          style={{ color: "var(--muted-foreground)" }}
        >
          {t("typeGroup.inclRealized", {
            amount: signed(total.hiddenRealizedCents),
          })}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={blocks.map((b) => blockId(b.uiType))}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {blocks.map((block) => {
              const pl = blockPL.get(block.uiType)!;
              return (
                <SortableTypeBlock
                  key={block.uiType}
                  uiType={block.uiType}
                  header={(handle) => (
                    <InvestmentTypeHeader
                      dragHandle={handle}
                      uiType={block.uiType}
                      budgetCurrency={budgetCurrency}
                      pl={pl}
                      portfolioPct={
                        totalBudgetCents > 0
                          ? (pl.valueBudgetCents / totalBudgetCents) * 100
                          : 0
                      }
                      maxAmountChars={amountCols.top}
                      expanded={isExpanded(block.uiType)}
                      onToggle={() => toggleType(block.uiType)}
                    />
                  )}
                >
                  {isExpanded(block.uiType) && (
                    <SortableContext
                      items={block.holdings.map((h) => h.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {block.holdings.map((h) => (
                        <InvestmentRowSheet
                          key={h.id}
                          holding={h}
                          nested
                          maxAmountChars={amountCols.group[block.uiType]}
                          onEdit={openEdit}
                          onArchive={(id) => deleteMut.mutate(id)}
                          onSell={setSelling}
                          onValueChange={(amount) => saveInlineValue(h, amount)}
                        />
                      ))}
                    </SortableContext>
                  )}
                </SortableTypeBlock>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <DashedAddButton
        onClick={openAdd}
        label={t("add.cta")}
        testId="add-investment-button"
        navKey="add-invest"
      />

      <HoldingSheet
        key={`${sheet.mode}-${sheet.holding?.id ?? "new"}-${sheet.open}`}
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        mode={sheet.mode}
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        holding={sheet.holding}
      />
      {selling && (
        <SellSheet
          key={selling.id}
          open
          onOpenChange={(o) => !o && setSelling(null)}
          budgetId={budgetId}
          budgetCurrency={budgetCurrency}
          holding={selling}
          holdings={holdings}
        />
      )}
    </section>
  );
}
