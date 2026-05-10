/**
 * recurring-draft-repo.ts — Port interface for RecurringDraft persistence.
 * Domain layer: no Drizzle imports.
 */

export type DraftStatus = "PENDING" | "CONFIRMED" | "SKIPPED";

export interface RecurringDraftRow {
  id: string;
  tenantId: string;
  ruleId: string;
  dueDate: string; // ISO date YYYY-MM-DD
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string | null;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  note: string | null;
  status: DraftStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  actorUserId: string | null;
}

export interface DraftEdits {
  amount?: string;
  currency?: string;
  accountId?: string;
  categoryId?: string | null;
  kind?: "EXPENSE" | "INCOME" | "TRANSFER";
  note?: string | null;
}

export interface RecurringDraftRepo {
  /**
   * Insert a new draft (ON CONFLICT (rule_id, due_date) DO NOTHING for idempotency).
   * Returns the created id or null if the conflict was ignored.
   */
  insert(
    tx: unknown,
    draft: {
      tenantId: string;
      ruleId: string;
      dueDate: string;
      amount: string;
      currency: string;
      accountId: string;
      categoryId: string | null;
      kind: "EXPENSE" | "INCOME" | "TRANSFER";
      note: string | null;
      actorUserId: string;
    },
  ): Promise<{ id: string } | null>;

  /** Find by id (RLS-scoped). Returns null if not found or wrong tenant. */
  findById(tenantId: string, draftId: string): Promise<RecurringDraftRow | null>;

  /** List pending drafts for tenant ordered by due_date ASC. */
  listPending(tenantId: string): Promise<RecurringDraftRow[]>;

  /**
   * Mark draft as CONFIRMED.
   * Caller owns the tx — must share tx with transactionRepo.createInTx.
   */
  markConfirmed(tx: unknown, draftId: string, actorUserId: string): Promise<void>;

  /** Mark draft as SKIPPED. */
  markSkipped(tx: unknown, draftId: string, actorUserId: string): Promise<void>;

  /**
   * UPDATE future PENDING drafts in-place for a rule (D-01-d "apply to future" behavior).
   * Only touches rows WHERE rule_id=$1 AND status='PENDING' AND due_date >= CURRENT_DATE.
   * Preserves draft.id (PENDING-id stable) and UNIQUE (rule_id, due_date) invariant.
   * Returns array of affected draft ids for outbox payload.
   * Caller owns the tx.
   */
  regenerateFuturePending(
    tx: unknown,
    ruleId: string,
    edits: DraftEdits,
  ): Promise<string[]>;
}
