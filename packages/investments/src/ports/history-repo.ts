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
  | "convert_in";

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
}

export interface HoldingPatch {
  id: string;
  quantity?: string;
  buyPriceCents?: bigint;
  currentPriceCents?: bigint | string | null;
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
}

export interface RealizedRow {
  uiType: string;
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
  ): Promise<{ newHoldingId: string | null; transferId: string | null }>;
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
    ...e,
  };
}
