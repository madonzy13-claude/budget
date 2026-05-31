/**
 * confirm-recurring-draft.ts — Confirm a draft (expense_ledger row with confirmed_at IS NULL).
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   Drafts are now expense_ledger rows with confirmed_at IS NULL (recurring_rule_id set).
 *   Confirming = SET confirmed_at = now(). No separate ledger INSERT needed.
 *   D-PH2-08: unified draft + confirmed view under one transactions resource.
 */
import { type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { TaskRepo, TenantTx } from "../ports/task-repo";

export interface ConfirmRecurringDraftDeps {
  /** Phase 7 (D-PH7-09): auto-resolve the CONFIRM_DRAFT task on confirm. */
  taskRepo?: TaskRepo;
}

export interface ConfirmRecurringDraftInput {
  tenantId: string;
  draftId: string;
  actorUserId: string;
}

export class AlreadyConfirmedError extends Error {
  readonly kind = "AlreadyConfirmed" as const;
  constructor(public readonly draftId: string) {
    super(`Draft ${draftId} is already confirmed or deleted`);
    this.name = "AlreadyConfirmedError";
  }
}

export class DraftNotFoundError extends Error {
  readonly kind = "DraftNotFound" as const;
  constructor(public readonly draftId: string) {
    super(`Draft ${draftId} not found`);
    this.name = "DraftNotFoundError";
  }
}

export function confirmRecurringDraft(deps: ConfirmRecurringDraftDeps = {}) {
  return async (
    input: ConfirmRecurringDraftInput,
  ): Promise<Result<{ ledgerId: string }, Error>> => {
    const r = await withTenantTx(
      TenantId(input.tenantId),
      UserId(input.actorUserId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const { sql } = await import("drizzle-orm");

        // SELECT FOR UPDATE to prevent concurrent confirms
        const draftResult = await drizzleTx.execute(sql`
        SELECT id, confirmed_at, deleted_at, recurring_rule_id, transaction_date
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

        if (draft.confirmed_at != null) {
          throw new AlreadyConfirmedError(input.draftId);
        }
        if (draft.deleted_at != null) {
          throw new AlreadyConfirmedError(input.draftId);
        }

        // Confirm = set confirmed_at = now()
        await drizzleTx.execute(sql`
        UPDATE budgeting.expense_ledger
           SET confirmed_at = now(),
               updated_at = now()
         WHERE id = ${input.draftId}::uuid
      `);

        // Phase 7 (D-PH7-09): auto-resolve CONFIRM_DRAFT task in the same tx
        // so the banner refreshes on next poll. Idempotent — no-op when no
        // PENDING task exists for this draft (e.g. legacy draft pre-Phase-7).
        if (deps.taskRepo) {
          await deps.taskRepo.resolveConfirmDraftByDraftId(
            input.tenantId,
            input.draftId,
            drizzleTx as TenantTx,
          );
        }

        await writeAudit(tx, {
          tenantId: TenantId(input.tenantId),
          actorUserId: UserId(input.actorUserId),
          entityType: "expense_ledger",
          entityId: input.draftId,
          action: "update" as const,
          before: { confirmed_at: null },
          after: { confirmed_at: "now()" },
        });

        await writeOutbox(tx, {
          tenantId: TenantId(input.tenantId),
          aggregateType: "expense_ledger",
          aggregateId: input.draftId,
          eventType: "budgeting.recurring.confirmed",
          payload: {
            draftId: input.draftId,
            ledgerId: input.draftId,
            tenantId: input.tenantId,
          },
        });

        return { ledgerId: input.draftId };
      },
    );

    return r;
  };
}
