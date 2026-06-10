/**
 * recurring-draft-repo.ts — Port interface for recurring draft persistence.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   Drafts are now expense_ledger rows with confirmed_at IS NULL.
 *   The separate recurring_drafts table is DROPPED by migration 0013 (02-01).
 *   Adapter targets budgeting.expense_ledger.
 *
 * Domain layer: no Drizzle imports.
 */

export interface RecurringDraftRow {
  id: string;
  tenantId: string;
  ruleId: string;
  dueDate: string; // ISO date YYYY-MM-DD (from transaction_date)
  amountOriginalCents: string;
  currency: string;
  categoryId: string | null;
  note: string | null;
  confirmedAt: Date | null; // null = draft (pending)
  kind: "SPENDING" | "INCOME";
  createdAt: Date;
}

export interface DraftEdits {
  amountOriginalCents?: string;
  currency?: string;
  categoryId?: string | null;
  note?: string | null;
}

export interface RecurringDraftRepo {
  /** Find by id (RLS-scoped). Returns null if not found or wrong tenant. */
  findById(tenantId: string, draftId: string): Promise<RecurringDraftRow | null>;

  /** List pending drafts (confirmed_at IS NULL) for tenant ordered by transaction_date ASC. */
  listPending(tenantId: string): Promise<RecurringDraftRow[]>;

  /**
   * Confirm a draft: set confirmed_at = now() and actor_user_id.
   * Caller owns the tx — must share tx with transactionRepo.
   */
  markConfirmed(tx: unknown, draftId: string, actorUserId: string): Promise<void>;

  /**
   * Soft-delete a draft (draft skip = deleted_at set).
   * Caller owns the tx.
   */
  markSkipped(tx: unknown, draftId: string, actorUserId: string): Promise<void>;

  /**
   * UPDATE future pending drafts in-place for a rule (D-01-d "apply to future" behavior).
   * Only touches rows WHERE recurring_rule_id=$1 AND confirmed_at IS NULL AND transaction_date >= CURRENT_DATE.
   * Preserves draft.id and UNIQUE (recurring_rule_id, transaction_date) invariant.
   * Returns array of affected draft ids for outbox payload.
   * Caller owns the tx.
   */
  regenerateFuturePending(
    tx: unknown,
    ruleId: string,
    edits: DraftEdits,
  ): Promise<string[]>;
}
