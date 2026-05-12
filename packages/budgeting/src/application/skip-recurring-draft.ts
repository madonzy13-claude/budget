/**
 * skip-recurring-draft.ts — Skip a pending draft (soft-delete expense_ledger row).
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   Drafts are expense_ledger rows with confirmed_at IS NULL.
 *   Skip = soft-delete (set deleted_at = now()).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { DraftNotFoundError, AlreadyConfirmedError } from "./confirm-recurring-draft";

export interface SkipRecurringDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export function skipRecurringDraft(_deps: Record<string, unknown> = {}) {
  return async (input: SkipRecurringDraftInput): Promise<Result<void, Error>> => {
    const r = await withTenantTx(TenantId(input.tenantId), UserId(input.actorUserId), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      const { sql } = await import("drizzle-orm");

      const draftResult = await drizzleTx.execute(sql`
        SELECT id, confirmed_at, deleted_at
          FROM budgeting.expense_ledger
         WHERE id = ${input.draftId}::uuid
           AND tenant_id = ${input.tenantId}::uuid
           AND recurring_rule_id IS NOT NULL
         FOR UPDATE
      `);

      if (!draftResult.rows[0]) {
        throw new DraftNotFoundError(input.draftId);
      }

      const draft = draftResult.rows[0] as Record<string, unknown>;

      if (draft.confirmed_at != null || draft.deleted_at != null) {
        throw new AlreadyConfirmedError(input.draftId);
      }

      // Soft-delete (skip = deleted_at set)
      await drizzleTx.execute(sql`
        UPDATE budgeting.expense_ledger
           SET deleted_at = now(),
               updated_at = now()
         WHERE id = ${input.draftId}::uuid
      `);

      await writeAudit(tx, {
        tenantId: TenantId(input.tenantId),
        actorUserId: UserId(input.actorUserId),
        entityType: "expense_ledger",
        entityId: input.draftId,
        action: "update" as const,
        before: { deleted_at: null },
        after: { deleted_at: "now()" },
      });

      await writeOutbox(tx, {
        tenantId: TenantId(input.tenantId),
        aggregateType: "expense_ledger",
        aggregateId: input.draftId,
        eventType: "budgeting.recurring.skipped",
        payload: { draftId: input.draftId, tenantId: input.tenantId },
      });
    });

    return r;
  };
}
