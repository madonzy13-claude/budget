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
 * Three levels (13.1): type block → asset row → the asset's ledger strip,
 * opened by tapping the asset. Open state lives in memory only — every asset
 * starts closed after a reload, and collapsing a type closes its assets (R5-3,
 * overturns D-27's per-device memory). Assets with quantity 0 are hidden (D-17).
 *
 * Drag: a block moves by its header handle (order saved per budget); a row
 * moves only within its own type — a drop on another type is a no-op. Ledger
 * strips are never sortable and collapse while an asset is dragged (D-30).
 * ⚠️ Before changing ANY drag logic, read ./INVESTMENTS-DND.md.
 */
import { pricesItself } from "@/lib/investment-types";
import { isCashLike } from "@/lib/cash-like";
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
import { centsToRounded, centsToShort } from "@/lib/cents-format";
import { amountColumnChars } from "@/lib/amount-column";
import { useBudget } from "@/hooks/use-budget-data";
import { useMemberUiPrefs } from "@/hooks/use-member-ui-prefs";
import { useCurrencyPLs } from "@/hooks/use-fx-rates";
import {
  useHiddenHoldings,
  useInvestments,
  type HoldingDto,
} from "@/hooks/use-investments";
import { useSetTypeOrder, useTypeSummary } from "@/hooks/use-type-summary";
import { useReorderHoldings } from "@/hooks/use-reorder-holdings";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { setDndDragging } from "@/lib/dnd-dragging";
import { useUpdateHolding } from "@/hooks/use-update-holding";
import { parseDecimal } from "@/lib/decimal";
import {
  deriveUiType,
  unitPriceCents,
  type UiType,
} from "@/lib/investment-types";
import {
  buildTypeBlocks,
  moveTypeBlock,
  portfolioPL,
  typeGroupPL,
  typeOf,
  type TypeBlock,
  type TypeGroupPL,
} from "@/lib/investment-type-groups";
import { InvestmentRowSheet } from "./investment-row-sheet";
import { AssetLedger } from "./asset-ledger";
import { useQueries } from "@tanstack/react-query";
import {
  useArchiveHolding,
  useRestoreHolding,
} from "@/hooks/use-archive-holding";
import { useDeleteEntry } from "@/hooks/use-delete-entry";
import {
  entriesKey,
  fetchAssetEntries,
  usePrefetchAssetEntries,
} from "@/hooks/use-asset-entries";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SlideCollapse } from "@/components/common/slide-collapse";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { sharePercentLabel } from "@/lib/share-bar";
import { InvestmentTypeHeader } from "./investment-type-header";
import { NewTransactionSheet } from "./new-transaction-sheet";
import { SwapSheet } from "./swap-sheet";
import { EditAssetSheet } from "./edit-asset-sheet";

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

/** R6 (user): a group's newest change — the latest of its assets' own
 *  "updated" times (a self-priced asset's is its price refresh), and whether
 *  that newest one was automatic (↻) or typed (pen). */
function newestUpdate(
  hs: HoldingDto[],
): { at: string; kind: "price" | "value" } | null {
  let best: { at: string; kind: "price" | "value" } | null = null;
  for (const h of hs) {
    const auto = pricesItself(h);
    const at = auto && h.priceFetchedAt ? h.priceFetchedAt : h.valueUpdatedAt;
    if (at && (!best || at > best.at))
      best = { at, kind: auto ? "price" : "value" };
  }
  return best;
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
        // Round 4 (user): a sold-out asset stays listed; only an explicit
        // Archive hides it (archived rows never reach this list).
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
  // Round 4: preload every ledger; read them back to know which assets have
  // nothing but their opening entry (those offer Delete instead of Archive).
  usePrefetchAssetEntries(
    budgetId,
    holdings.map((h) => h.id),
  );
  const ledgers = useQueries({
    queries: holdings.map((h) => ({
      queryKey: entriesKey(budgetId, h.id),
      queryFn: () => fetchAssetEntries(budgetId, h.id),
      enabled: false,
    })),
  });
  const soleEntry = new Map<string, string>();
  holdings.forEach((h, i) => {
    const stored = (ledgers[i]?.data ?? []).filter((e) => e.id !== null);
    if (ledgers[i]?.data && stored.length === 1)
      soleEntry.set(h.id, stored[0]!.id!);
  });
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
  const [draggingRow, setDraggingRow] = useState(false);
  // R5-3: open assets in memory only (the row's own tap state still survives
  // pill navigation via the BDP store).
  const bdpStore = useBdpUiStore();
  const [openAssets, setOpenAssets] = useState<Set<string>>(
    () =>
      new Set(
        Object.entries(bdpStore?.wallets.expandedRows ?? {})
          .filter(([, v]) => v)
          .map(([id]) => id),
      ),
  );
  useEffect(() => {
    try {
      // ponytail: stale-key cleanup from the per-device era; drop later.
      localStorage.removeItem("inv.assetOpen.v1");
    } catch {
      /* private mode */
    }
  }, []);
  // 13.1 UAT 5: the swiped asset's open ledger slides with it.
  const [swipe, setSwipe] = useState<{
    id: string;
    px: number;
    live: boolean;
  } | null>(null);
  const toggleAsset = (id: string, open: boolean) =>
    setOpenAssets((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  // Round 4: a linked ledger entry opens its partner, highlighted for 1.5s.
  const [flash, setFlash] = useState<{
    holdingId: string;
    transferId: string;
  } | null>(null);
  const openLinked = (holdingId: string, transferId: string) => {
    const h = holdings.find((x) => x.id === holdingId);
    if (!h) return;
    const ui = deriveUiType(h.uiType, h.holdingType, h.isCustom);
    if (!isExpanded(ui)) toggleType(ui);
    toggleAsset(holdingId, true);
    setFlash({ holdingId, transferId });
    window.setTimeout(() => setFlash(null), 1500);
  };
  const updateMut = useUpdateHolding(budgetId);
  const reorderMut = useReorderHoldings(budgetId);
  const setOrderMut = useSetTypeOrder(budgetId);
  // One Swap and one Edit sheet for the section (13.1 D-05).
  const [swapping, setSwapping] = useState<HoldingDto | null>(null);
  // 13.1 UAT 7: "New transaction" picks Buy / Sell / Transfer first.
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<HoldingDto | null>(null);
  // R6 (user): Hide / Unhide act at once (no confirm); history stays.
  const archiveMut = useArchiveHolding(budgetId);
  const restoreMut = useRestoreHolding(budgetId);
  const hiddenQuery = useHiddenHoldings(budgetId);
  const hidden = useMemo(
    () =>
      (hiddenQuery.data ?? []).filter((h) => h.holdingType !== "possession"),
    [hiddenQuery.data],
  );
  // Groups whose hidden assets are listed (the "N hidden" link toggles).
  const [showHidden, setShowHidden] = useState<Set<string>>(new Set());
  const toggleHidden = (uiType: string) =>
    setShowHidden((cur) => {
      const next = new Set(cur);
      if (!next.delete(uiType)) next.add(uiType);
      return next;
    });
  // Round 4: an asset with nothing but its opening entry is deleted (its
  // last entry wipes it, D-17); ledgers are preloaded so this is known.
  const [deleting, setDeleting] = useState<{
    holding: HoldingDto;
    entryId: string;
  } | null>(null);
  const deleteMut = useDeleteEntry(budgetId);

  /**
   * 260731: inline value edit on a manual-value row (cash / broker / savings —
   * quantity is 1, so the typed number IS the current value). Only the CURRENT
   * price moves; the buy price stays the cost basis, so savings keeps its
   * "started at" figure and the %-change stays honest.
   */
  // The row edits the TOTAL; the price is per unit (user, 261023). 13.1
  // WR-06: the server books it as a Value/Price updated ledger entry.
  async function saveInlineValue(holding: HoldingDto, amount: string) {
    const cents = parseDecimal(amount);
    if (cents === null) return;
    await updateMut.mutateAsync(
      Number(holding.quantity) === 1
        ? { holdingId: holding.id, currentValueCents: String(cents) }
        : {
            holdingId: holding.id,
            currentPriceCents: unitPriceCents(cents, holding.quantity),
          },
    );
  }

  // ── Type blocks (D-12..D-16) ──
  // A type with only hidden assets keeps its block, so they can come back.
  const blocks = useMemo(() => {
    const ids = new Set(hidden.map((h) => h.id));
    return buildTypeBlocks([...holdings, ...hidden], typeOrder).map((b) => ({
      ...b,
      holdings: b.holdings.filter((h) => !ids.has(h.id)),
    }));
  }, [holdings, hidden, typeOrder]);
  const hiddenOf = (uiType: string) =>
    hidden.filter((h) => typeOf(h) === uiType);
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
  // R6 (user): each group may be shown in another currency — the member's
  // pick, converted at today's rate (the % is unchanged).
  const uiPrefs = useMemberUiPrefs(budgetId);
  const ccyKey = (uiType: string) => `invGroupCcy.${uiType}`;
  const groupCcy = (uiType: string) =>
    uiPrefs.prefs[ccyKey(uiType)]?.[0] ?? budgetCurrency;
  // R6 (user): every currency — the budget's too — is a replay of the
  // group's ledger at each entry's own date's rate (GET /investments/pl).
  const groupPLs = useCurrencyPLs(
    budgetId,
    blocks.map((b) => ({
      currency: groupCcy(b.uiType),
      ids: [...b.holdings, ...hiddenOf(b.uiType)].map((h) => h.id),
    })),
  );
  // R6 (user): an asset may be shown in another currency too — the member's
  // pick per asset, figures from the same replay.
  const assetKey = (id: string) => `invAssetCcy.${id}`;
  const ownCcy = (h: HoldingDto) =>
    h.currentPriceCurrency ?? h.buyCurrency ?? budgetCurrency;
  const assetCcy = (h: HoldingDto) =>
    uiPrefs.prefs[assetKey(h.id)]?.[0] ?? ownCcy(h);
  const convertedAssets = [...holdings, ...hidden].filter(
    (h) => assetCcy(h) !== ownCcy(h),
  );
  const assetPLs = useCurrencyPLs(
    budgetId,
    convertedAssets.map((h) => ({ currency: assetCcy(h), ids: [h.id] })),
  );
  const assetView = (h: HoldingDto) => {
    const i = convertedAssets.findIndex((x) => x.id === h.id);
    return {
      currencyPick: {
        value: assetCcy(h),
        onChange: (c: string) => void uiPrefs.save(assetKey(h.id), [c]),
      },
      converted: i >= 0 ? assetPLs[i] : undefined,
    };
  };
  /** The group's P/L in its chosen currency; until the replay lands, the
   *  budget-currency figures already on hand. */
  const shownPL = (uiType: string, pl: TypeGroupPL) => {
    const r = groupPLs[blocks.findIndex((b) => b.uiType === uiType)];
    if (!r) return { ccy: budgetCurrency, pl };
    return {
      ccy: r.currency,
      pl: {
        valueBudgetCents: Number(r.valueCents),
        unrealizedCents: Number(r.unrealizedCents),
        realizedCents: Number(r.realizedCents),
        totalPLCents: Number(r.totalPLCents),
        lifetimeCostCents: Number(r.contributedCents),
        pct: r.pct,
      },
    };
  };
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
  // R6 (user): sized from the figures AS SHOWN (short, picked currency) — the
  // bare cents version ran ~3 chars wider and pushed the code off the amount.
  const amountCols = amountColumnChars(
    blocks.map((b) =>
      centsToShort(
        String(
          Math.round(
            Math.abs(
              shownPL(b.uiType, blockPL.get(b.uiType)!).pl.valueBudgetCents,
            ),
          ),
        ),
        locale,
      ),
    ),
    Object.fromEntries(
      blocks.map((b) => [
        b.uiType,
        b.holdings.map((h) =>
          centsToShort(
            assetView(h).converted?.valueCents ?? h.valueCents,
            locale,
          ),
        ),
      ]),
    ),
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
      // R5-3: closing a type closes its assets.
      if (nowCollapsed) {
        const ids = holdings
          .filter(
            (h) => deriveUiType(h.uiType, h.holdingType, h.isCustom) === ui,
          )
          .map((h) => h.id);
        setOpenAssets((open) => {
          const next = new Set(open);
          for (const id of ids) next.delete(id);
          return next;
        });
        if (bdpStore)
          for (const id of ids) bdpStore.wallets.expandedRows[id] = false;
      }
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
    else setDraggingRow(true);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDndDragging(false);
    setDraggingBlock(false);
    setDraggingRow(false);
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
      // WR-09: a failed save must not leave the optimistic order on screen.
      setOrderMut.mutate(next, { onError: () => setCommittedOrder(null) });
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
    reorderMut.mutate(
      { orderedIds: flat.map((h) => h.id) },
      { onError: () => setCommitted(null) },
    );
  }

  function handleDragCancel() {
    setDndDragging(false);
    setDraggingBlock(false);
    setDraggingRow(false);
  }

  function openEdit(holding: HoldingDto) {
    setEditing(holding);
  }

  if (!investmentsEnabled) return null;

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
                      budgetCurrency={shownPL(block.uiType, pl).ccy}
                      pl={shownPL(block.uiType, pl).pl}
                      onCurrencyChange={(c) =>
                        void uiPrefs.save(ccyKey(block.uiType), [c])
                      }
                      portfolioPct={
                        totalBudgetCents > 0
                          ? (pl.valueBudgetCents / totalBudgetCents) * 100
                          : 0
                      }
                      maxAmountChars={amountCols.top}
                      updated={newestUpdate(block.holdings)}
                      expanded={isExpanded(block.uiType)}
                      onToggle={() => toggleType(block.uiType)}
                    />
                  )}
                >
                  {/* Round 4: assets slide open / shut under the header (no
                      slide while a block is dragged). The header gap lives
                      inside the slide so it closes with it. */}
                  <SlideCollapse
                    open={isExpanded(block.uiType)}
                    instant={draggingBlock}
                    className="-mt-2"
                  >
                    <div
                      // R6-7: an open group draws a hairline guide in the
                      // assets' indent (a 1px background stripe — no layout shift).
                      data-testid={`investment-group-guide-${block.uiType}`}
                      className="flex flex-col gap-2 pt-2"
                      style={{
                        backgroundImage:
                          "linear-gradient(var(--color-hairline-dark), var(--color-hairline-dark))",
                        backgroundSize: "1px calc(100% - 0.5rem)",
                        backgroundPosition: "7px 0.5rem",
                        backgroundRepeat: "no-repeat",
                      }}
                    >
                      <SortableContext
                        items={block.holdings.map((h) => h.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {block.holdings.map((h) => (
                          <div
                            key={h.id}
                            data-asset-block
                            // UAT 13.1 test 4: assets nest under their type header.
                            className="flex flex-col pl-4"
                          >
                            <InvestmentRowSheet
                              holding={h}
                              nested
                              maxAmountChars={amountCols.group[block.uiType]}
                              open={openAssets.has(h.id)}
                              realized={summary?.holdings?.[h.id]}
                              {...assetView(h)}
                              onToggle={toggleAsset}
                              onSwipeOffset={(id, px, live) =>
                                setSwipe({ id, px, live })
                              }
                              onEdit={openEdit}
                              onSwap={setSwapping}
                              onArchive={(x) => archiveMut.mutate(x.id)}
                              onDelete={
                                soleEntry.get(h.id)
                                  ? (x) =>
                                      setDeleting({
                                        holding: x,
                                        entryId: soleEntry.get(h.id)!,
                                      })
                                  : undefined
                              }
                              onValueChange={(amount) =>
                                saveInlineValue(h, amount)
                              }
                            />
                            {/* L3: same left edge as the asset, outside the sortable
                            row; collapsed while an asset is dragged (D-28/D-30). */}
                            <AssetLedger
                              budgetId={budgetId}
                              assetId={h.id}
                              assetName={h.name}
                              noRealized={isCashLike(h)}
                              currency={
                                assetCcy(h) !== ownCcy(h)
                                  ? assetCcy(h)
                                  : undefined
                              }
                              open={openAssets.has(h.id) && !draggingRow}
                              swipeOffset={swipe?.id === h.id ? swipe.px : 0}
                              swiping={swipe?.id === h.id && swipe.live}
                              onOpenLinked={openLinked}
                              canOpen={(id) =>
                                holdings.some((x) => x.id === id)
                              }
                              flashTransferId={
                                flash?.holdingId === h.id
                                  ? flash.transferId
                                  : null
                              }
                            />
                          </div>
                        ))}
                      </SortableContext>
                      {hiddenOf(block.uiType).length > 0 && (
                        <button
                          type="button"
                          data-testid={`hidden-toggle-${block.uiType}`}
                          data-count={hiddenOf(block.uiType).length}
                          onClick={() => toggleHidden(block.uiType)}
                          className="self-start pl-7 text-left text-[12px] text-[var(--muted-foreground)] underline decoration-dotted underline-offset-2"
                        >
                          {showHidden.has(block.uiType)
                            ? t("asset.hidden.close")
                            : t("asset.hidden.show", {
                                count: hiddenOf(block.uiType).length,
                              })}
                        </button>
                      )}
                      {showHidden.has(block.uiType) &&
                        hiddenOf(block.uiType).map((h) => (
                          <div
                            key={h.id}
                            data-testid={`hidden-asset-${h.id}`}
                            className="flex flex-col pl-4"
                            // R6 (user): listed like any asset, but fainter.
                            style={{ opacity: 0.5 }}
                          >
                            <InvestmentRowSheet
                              holding={h}
                              nested
                              maxAmountChars={amountCols.group[block.uiType]}
                              open={openAssets.has(h.id)}
                              realized={summary?.holdings?.[h.id]}
                              {...assetView(h)}
                              onToggle={toggleAsset}
                              onSwipeOffset={(id, px, live) =>
                                setSwipe({ id, px, live })
                              }
                              onEdit={openEdit}
                              onSwap={setSwapping}
                              onUnhide={(x) => restoreMut.mutate(x.id)}
                            />
                            {/* R6 (user): its transactions open like any asset's. */}
                            <AssetLedger
                              budgetId={budgetId}
                              assetId={h.id}
                              assetName={h.name}
                              noRealized={isCashLike(h)}
                              currency={
                                assetCcy(h) !== ownCcy(h)
                                  ? assetCcy(h)
                                  : undefined
                              }
                              open={openAssets.has(h.id)}
                              swipeOffset={swipe?.id === h.id ? swipe.px : 0}
                              swiping={swipe?.id === h.id && swipe.live}
                              onOpenLinked={openLinked}
                              canOpen={(id) =>
                                holdings.some((x) => x.id === id)
                              }
                              flashTransferId={null}
                            />
                          </div>
                        ))}
                    </div>
                  </SlideCollapse>
                </SortableTypeBlock>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <DashedAddButton
        onClick={() => setChoosing(true)}
        label={t("add.cta")}
        testId="add-investment-button"
        navKey="add-invest"
      />

      <NewTransactionSheet
        key={`tx-${choosing}`}
        open={choosing}
        onOpenChange={setChoosing}
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        holdings={holdings}
      />
      {swapping && (
        <SwapSheet
          key={swapping.id}
          open
          onOpenChange={(o) => {
            if (o) return;
            setSwapping(null);
          }}
          budgetId={budgetId}
          budgetCurrency={budgetCurrency}
          holding={swapping}
          holdings={holdings}
        />
      )}
      {editing && (
        <EditAssetSheet
          key={editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          budgetId={budgetId}
          budgetCurrency={budgetCurrency}
          holding={editing}
        />
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ledger.confirm.last.title", {
                name: deleting?.holding.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ledger.confirm.last.body", {
                name: deleting?.holding.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("ledger.confirm.last.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="investment-delete-confirm"
              className="bg-[var(--trading-down)] text-white"
              onClick={() => {
                if (deleting) deleteMut.mutate({ entryId: deleting.entryId });
                setDeleting(null);
              }}
            >
              {t("ledger.confirm.last.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
