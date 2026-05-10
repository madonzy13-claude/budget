/**
 * list-pending-drafts.ts — List PENDING recurring drafts for a tenant.
 */
import { ok, type Result } from "@budget/shared-kernel";
import type { RecurringDraftRepo, RecurringDraftRow } from "../ports/recurring-draft-repo";

export interface ListPendingDraftsInput {
  tenantId: string;
  includeOverdue?: boolean;
}

export function listPendingDrafts(deps: { draftRepo: RecurringDraftRepo }) {
  return async (input: ListPendingDraftsInput): Promise<Result<RecurringDraftRow[], Error>> => {
    const drafts = await deps.draftRepo.listPending(input.tenantId);
    return ok(drafts);
  };
}
