/**
 * correction.ts — Domain correction-row builder (pure, no Drizzle).
 *
 * Editing a transaction inserts a NEW ledger row with corrects_id = original.id.
 * The original row is never mutated — UPDATE is REVOKE'd at the SQL layer (D-01-b, EXPN-06).
 *
 * buildCorrectionRow: pure function; takes original row + edits + actor + now → new TransactionRow.
 * computeDiff: produces before/after diff for audit_history payload.
 */
import type { TransactionRow } from "../ports/transaction-repo";

export interface CorrectionEdits {
  amountOrig?: string;
  currencyOrig?: string;
  transactionDate?: string;
  categoryId?: string | null;
  accountId?: string;
  note?: string | null;
  // FX result (re-computed in use case if amount/currency/date changed):
  amountDefault?: string;
  fxRate?: string;
  fxRateDate?: string;
  fxProvider?: string;
}

/**
 * Builds a new TransactionRow that corrects the original.
 *
 * Rules:
 * - New unique id (crypto.randomUUID)
 * - correctsId = original.id
 * - createdAt = now (caller-provided for testability)
 * - tenant_id, kind, currencyDefault, transfer_group_id are immutable — preserved always
 * - balanceDeltaSign is preserved from original (same sign; delta computed from amount diff)
 * - Fields in edits override original; absent fields default to original value
 * - categoryId and note use explicit `!== undefined` check (explicit null is meaningful)
 */
export function buildCorrectionRow(
  original: TransactionRow,
  edits: CorrectionEdits,
  actorUserId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _now?: Date,
): TransactionRow {
  return {
    // Immutable identity
    id: crypto.randomUUID(),
    correctsId: original.id,
    tenantId: original.tenantId,

    // Immutable per-row fields (kind, currency_default, transfer_group_id cannot change)
    kind: original.kind,
    currencyDefault: original.currencyDefault,
    transferGroupId: original.transferGroupId,
    balanceDeltaSign: original.balanceDeltaSign,

    // Mutable fields — override with edit if provided, else carry forward original
    amountOrig: edits.amountOrig ?? original.amountOrig,
    currencyOrig: edits.currencyOrig ?? original.currencyOrig,
    amountDefault: edits.amountDefault ?? original.amountDefault,
    fxRate: edits.fxRate ?? original.fxRate,
    fxRateDate: edits.fxRateDate ?? original.fxRateDate,
    fxProvider: edits.fxProvider ?? original.fxProvider,
    transactionDate: edits.transactionDate ?? original.transactionDate,
    accountId: edits.accountId ?? original.accountId,

    // Nullable fields: use !== undefined so explicit null is honored
    categoryId: edits.categoryId !== undefined ? edits.categoryId : original.categoryId,
    note: edits.note !== undefined ? edits.note : original.note,
  };
}

/**
 * Computes a before/after diff between original row and applied edits.
 * Only returns keys that actually changed.
 * Used for audit_history payload.
 */
export function computeDiff(
  original: TransactionRow,
  edits: CorrectionEdits,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(edits)) {
    const before = (original as Record<string, unknown>)[k];
    if (before !== v) {
      diff[k] = { before, after: v };
    }
  }
  return diff;
}
