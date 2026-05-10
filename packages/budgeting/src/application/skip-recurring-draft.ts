/**
 * skip-recurring-draft.ts — Skip a PENDING draft (no ledger write).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringDraftRepo } from "../ports/recurring-draft-repo";
import { DraftNotFoundError, AlreadyConfirmedError } from "./confirm-recurring-draft";

export interface SkipRecurringDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export function skipRecurringDraft(deps: { draftRepo: RecurringDraftRepo }) {
  return async (input: SkipRecurringDraftInput): Promise<Result<void, Error>> => {
    const r = await withTenantTx(TenantId(input.tenantId), UserId(input.actorUserId), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      const { sql } = await import("drizzle-orm");

      const draftResult = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_drafts
         WHERE id = ${input.draftId}::uuid AND tenant_id = ${input.tenantId}::uuid
         FOR UPDATE
      `);

      if (!draftResult.rows[0]) {
        throw new DraftNotFoundError(input.draftId);
      }

      const draft = draftResult.rows[0] as Record<string, unknown>;

      if (draft.status !== "PENDING") {
        throw new AlreadyConfirmedError(input.draftId);
      }

      // NO ledger insert — skip only marks status + audit + outbox
      await deps.draftRepo.markSkipped(tx, input.draftId, input.actorUserId);

      await writeAudit(tx, {
        tenantId: TenantId(input.tenantId),
        actorUserId: UserId(input.actorUserId),
        entityType: "recurring_draft",
        entityId: input.draftId,
        action: "update" as const,
        before: { status: "PENDING" },
        after: { status: "SKIPPED" },
      });

      await writeOutbox(tx, {
        tenantId: TenantId(input.tenantId),
        aggregateType: "recurring_draft",
        aggregateId: input.draftId,
        eventType: "budgeting.recurring.skipped",
        payload: { draftId: input.draftId, tenantId: input.tenantId },
      });
    });

    return r;
  };
}
