/**
 * expense-ledger-draft-port-repo.ts — Port interface for dismiss/confirm draft operations.
 * Separates Phase 4 draft-management surface from the original ScheduledDraftRepo.
 * Implemented by DrizzleExpenseLedgerDraftPortRepo in adapters/persistence/.
 */

export interface ExpenseLedgerDraftPortRepo {
  dismiss(
    tenantId: string,
    draftId: string,
    actorUserId: string,
  ): Promise<"ok" | "not_found" | "already_confirmed">;

  /** User (R6): after an unconfirmed payment's date changed — a future
   *  date (budget timezone) sets it aside and resolves its confirm task; an
   *  earlier one keeps the task, now showing the new date. */
  syncDate(
    tenantId: string,
    draftId: string,
    actorUserId: string,
  ): Promise<"deferred" | "moved" | "none">;

  confirm(
    tenantId: string,
    draftId: string,
    actorUserId: string,
    amountOverrideCents?: number,
  ): Promise<"ok" | "not_found" | "already_confirmed" | "already_dismissed">;
}
