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
