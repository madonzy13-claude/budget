/**
 * history-repo.ts — HistoryRepo port (Phase 13). One booking = holding patches
 * + an optional new holding + history entries, written in ONE transaction so a
 * sale can never land half-booked. NO drizzle here.
 */
import type { NewHolding } from "./holding-repo";

export type HistoryKind =
  | "start"
  | "buy"
  | "add"
  | "value_change"
  | "withdraw"
  | "convert_out"
  | "convert_in"
  // Phase 13.1 (0088): transfer legs (D-10) and hand-priced quantity updates (D-18).
  | "transfer_out"
  | "transfer_in"
  | "price_change";

export interface NewHistoryEntry {
  /** Holding id, or "$new" for the booking's newHolding. */
  holdingRef: string;
  kind: HistoryKind;
  effectiveDate: string;
  amountCents: bigint | null;
  amountCurrency: string | null;
  qtyDelta: string | null;
  costDeltaCents: bigint;
  costCurrency: string | null;
  valueDeltaCents: bigint;
  flowCents: bigint;
  flowCurrency: string | null;
  soldCostBudgetCents: bigint | null;
  realizedBudgetCents: bigint | null;
  budgetCurrency: string | null;
  priorPrincipalCents: bigint | null;
  priorStartDate: string | null;
  /** Both legs of a conversion carry true and share one transfer id. */
  transfer: boolean;
  /** Wallet credited by an Out sale (D-20); "$newWallet" = the plan's created wallet. */
  walletId: string | null;
  /** Amount credited, wallet currency, major units (D-21). */
  walletDeltaNumeric: string | null;
  walletCreated: boolean;
  /** Snapshot before value_change / price_change / broker add (D-18 undo). */
  priorPriceCents: string | null;
  priorPriceCurrency: string | null;
  /** D-35 placeholder Start (migration only). */
  backfilled: boolean;
  /** R6-2: unsigned amount in the asset's own currency fixed at the deal
   *  (proceeds of a sale, cost of a buy / leg); null = not recorded. */
  assetAmountCents: bigint | null;
}

/** D-21: a wallet balance moves by a delta inside the booking transaction. */
export interface WalletCredit {
  target:
    | { walletId: string }
    | { create: { name: string; walletType: string; currency: string } };
  /** Positive major-unit decimal string. */
  amountMajor: string;
  /** Must equal the wallet's currency (WALT-04) or the commit rolls back. */
  currency: string;
  /** Undo of a sale: subtract instead of add (wallet missing → skipped). */
  reverse?: boolean;
}

export interface HoldingPatch {
  id: string;
  quantity?: string;
  buyPriceCents?: bigint;
  currentPriceCents?: bigint | string | null;
  currentPriceCurrency?: string | null;
  depositStartDate?: string;
  archive?: boolean;
  unarchive?: boolean;
}

export interface BookingPlan {
  budgetId: string;
  patches: HoldingPatch[];
  newHolding?: NewHolding;
  entries: NewHistoryEntry[];
  /** D-06 undo: entries to soft-delete (deleted_at = now()). */
  softDeleteEntryIds?: string[];
  /** Holdings to hard-delete (FK cascades their own history). */
  deleteHoldingIds?: string[];
  /** Phase 13.1: rows locked FOR UPDATE (sorted) before anything is checked. */
  lockHoldingIds?: string[];
  /** Re-checked under the lock; a different newest entry → "stale" (D-14). */
  expectedNewestEntryId?: { holdingId: string; entryId: string | null }[];
  /** Re-checked under the lock; an entry dated after `date` → "before_latest_entry" (D-15). */
  minEffectiveDate?: { holdingId: string; date: string }[];
  walletCredit?: WalletCredit;
  /** Label change; names are not unique (round-5 scope change). */
  renameHolding?: { id: string; name: string };
  /** Snapshot undo of a price/value update (D-18). */
  restorePrice?: {
    id: string;
    priceCents: string | null;
    currency: string | null;
  };
}

/** A live ledger row with everything its undo needs. */
export interface StoredEntry {
  id: string;
  holdingId: string;
  kind: HistoryKind;
  effectiveDate: string;
  amountCents: bigint | null;
  amountCurrency: string | null;
  qtyDelta: string | null;
  costDeltaCents: bigint;
  costCurrency: string | null;
  /** R6-2: see NewHistoryEntry.assetAmountCents. */
  assetAmountCents: bigint | null;
  valueDeltaCents: bigint;
  flowCents: bigint;
  realizedBudgetCents: bigint | null;
  soldCostBudgetCents: bigint | null;
  budgetCurrency: string | null;
  priorPrincipalCents: bigint | null;
  priorStartDate: string | null;
  transferId: string | null;
  createdAt: string;
  /** Name of the other leg's holding (conversions only). */
  counterpartyName: string | null;
  counterpartyHoldingId: string | null;
  walletId: string | null;
  /** Credited wallet's current name (null when none / deleted). */
  walletName: string | null;
  walletDeltaNumeric: string | null;
  walletCreated: boolean;
  priorPriceCents: string | null;
  priorPriceCurrency: string | null;
  backfilled: boolean;
}

export interface RealizedRow {
  uiType: string;
  /** R6-6: per-asset realized next to the per-type sum. */
  holdingId: string;
  budgetCurrency: string;
  realizedBudgetCents: bigint;
  soldCostBudgetCents: bigint;
}

export interface FlowRow {
  effectiveDate: string;
  flowCents: bigint;
  flowCurrency: string;
}

export interface HistoryRepo {
  commit(
    tenantId: string,
    userId: string,
    plan: BookingPlan,
  ): Promise<{
    newHoldingId: string | null;
    transferId: string | null;
    /** Wallet the plan credited/created (for RESERVE/CUSHION recompute, D-37). */
    walletId: string | null;
    walletType: string | null;
  }>;
  /** Newest live entry per holding by (effective_date, created_at, id). */
  newestFor(
    tenantId: string,
    userId: string,
    holdingIds: string[],
  ): Promise<Map<string, StoredEntry | null>>;
  /** Live (not deleted) entries' flows. Flow-0 rows included — they set the
   *  D-08 boundary. */
  listFlows(tenantId: string, budgetId: string): Promise<FlowRow[]>;
  /** The live entry plus its live transfer partner (empty when gone). */
  findLegs(
    tenantId: string,
    userId: string,
    entryId: string,
  ): Promise<StoredEntry[]>;
  /** A holding's live entries, oldest first (effective_date, created_at). */
  listForHolding(
    tenantId: string,
    userId: string,
    holdingId: string,
  ): Promise<StoredEntry[]>;
  /** Realized + sold cost of live withdraw/convert_out rows per CURRENT
   *  ui_type, archived holdings included (D-14). */
  realizedByType(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<RealizedRow[]>;
  // ponytail: the type order is one budgets column — no port of its own.
  getTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
  ): Promise<string[]>;
  setTypeOrder(
    tenantId: string,
    userId: string,
    budgetId: string,
    order: string[],
  ): Promise<void>;
}

/** Defaults for the fields most entries leave empty. */
export function entry(
  e: Pick<NewHistoryEntry, "holdingRef" | "kind" | "effectiveDate"> &
    Partial<NewHistoryEntry>,
): NewHistoryEntry {
  return {
    amountCents: null,
    amountCurrency: null,
    qtyDelta: null,
    costDeltaCents: 0n,
    costCurrency: null,
    valueDeltaCents: 0n,
    flowCents: 0n,
    flowCurrency: null,
    soldCostBudgetCents: null,
    realizedBudgetCents: null,
    budgetCurrency: null,
    priorPrincipalCents: null,
    priorStartDate: null,
    transfer: false,
    walletId: null,
    walletDeltaNumeric: null,
    walletCreated: false,
    priorPriceCents: null,
    priorPriceCurrency: null,
    backfilled: false,
    assetAmountCents: null,
    ...e,
  };
}
