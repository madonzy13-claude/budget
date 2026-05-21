/**
 * edit-and-confirm-recurring-draft.ts — Edit draft fields then confirm in one atomic tx.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   Drafts are expense_ledger rows with confirmed_at IS NULL.
 *   Edit + confirm = UPDATE expense_ledger fields + SET confirmed_at = now() in one tx.
 */
import { type Result } from "@budget/shared-kernel";
import { withTenantTx, writeAudit, writeOutbox } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import {
  AlreadyConfirmedError,
  DraftNotFoundError,
} from "./confirm-recurring-draft";

export interface EditAndConfirmInput {
  tenantId: string;
  draftId: string;
  edits: {
    amountOriginalCents?: string;
    currency?: string;
    categoryId?: string | null;
    note?: string | null;
  };
  actorUserId: string;
}

export function editAndConfirmRecurringDraft(
  _deps: Record<string, unknown> = {},
) {
  return async (
    input: EditAndConfirmInput,
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
        SELECT id, confirmed_at, deleted_at, amount_original_cents, currency_original,
               category_id, note, transaction_date
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

        // Apply edits + confirm in one UPDATE
        const amountClause =
          input.edits.amountOriginalCents !== undefined
            ? sql`amount_original_cents = ${input.edits.amountOriginalCents}::bigint, amount_converted_cents = ${input.edits.amountOriginalCents}::bigint,`
            : sql``;
        const currencyClause =
          input.edits.currency !== undefined
            ? sql`currency_original = ${input.edits.currency},`
            : sql``;
        const categoryClause =
          input.edits.categoryId !== undefined
            ? sql`category_id = ${input.edits.categoryId ?? null}::uuid,`
            : sql``;
        const noteClause =
          input.edits.note !== undefined
            ? sql`note = ${input.edits.note ?? null},`
            : sql``;

        await drizzleTx.execute(sql`
        UPDATE budgeting.expense_ledger
           SET ${amountClause}
               ${currencyClause}
               ${categoryClause}
               ${noteClause}
               confirmed_at = now(),
               updated_at = now()
         WHERE id = ${input.draftId}::uuid
      `);

        await writeAudit(tx, {
          tenantId: TenantId(input.tenantId),
          actorUserId: UserId(input.actorUserId),
          entityType: "expense_ledger",
          entityId: input.draftId,
          action: "update" as const,
          before: {
            confirmed_at: null,
            amount_original_cents: draft.amount_original_cents,
          },
          after: { confirmed_at: "now()", edits: input.edits },
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
