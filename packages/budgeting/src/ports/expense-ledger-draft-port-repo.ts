/**
 * expense-ledger-draft-port-repo.ts — Port interface for dismiss/confirm draft operations.
 * Separates Phase 4 draft-management surface from the original RecurringDraftRepo.
 * Implemented by DrizzleExpenseLedgerDraftPortRepo in adapters/persistence/.
 */

export interface ExpenseLedgerDraftPortRepo {
  dismiss(
    tenantId: string,
    draftId: string,
    actorUserId: string,
  ): Promise<"ok" | "not_found" | "already_confirmed">;

  confirm(
    tenantId: string,
    draftId: string,
    actorUserId: string,
    amountOverrideCents?: number,
  ): Promise<"ok" | "not_found" | "already_confirmed" | "already_dismissed">;
}
