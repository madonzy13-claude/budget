/**
 * expense-ledger-draft-repo.ts — RecurringDraftRepo adapter backed by expense_ledger.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   recurring_drafts table is DROPPED. Drafts are expense_ledger rows with confirmed_at IS NULL.
 *   UNIQUE index: (recurring_rule_id, transaction_date) WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringDraftRepo, RecurringDraftRow, DraftEdits } from "../../ports/recurring-draft-repo";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

function rowToDraftRow(row: Record<string, unknown>): RecurringDraftRow {
  const dateVal = (row.transaction_date ?? row.date) as string | Date;
  const dueDate = dateVal instanceof Date ? dateVal.toISOString().slice(0, 10) : String(dateVal).slice(0, 10);
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    ruleId: row.recurring_rule_id as string,
    dueDate,
    amountOriginalCents: String(row.amount_original_cents),
    currency: row.currency_original as string,
    categoryId: (row.category_id as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    kind: (row.kind as "SPENDING" | "INCOME") ?? "SPENDING",
    createdAt: new Date(row.created_at as string),
  };
}

export class ExpenseLedgerDraftRepo implements RecurringDraftRepo {
  async findById(tenantId: string, draftId: string): Promise<RecurringDraftRow | null> {
    const r = await withTenantTx(TenantId(tenantId), UserId(SYSTEM_USER_ID), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.expense_ledger
         WHERE id = ${draftId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND recurring_rule_id IS NOT NULL
           AND confirmed_at IS NULL
           AND deleted_at IS NULL
      `);
      return result.rows[0] ? rowToDraftRow(result.rows[0]) : null;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listPending(tenantId: string): Promise<RecurringDraftRow[]> {
    const r = await withTenantTx(TenantId(tenantId), UserId(SYSTEM_USER_ID), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.expense_ledger
         WHERE tenant_id = ${tenantId}::uuid
           AND recurring_rule_id IS NOT NULL
           AND confirmed_at IS NULL
           AND deleted_at IS NULL
         ORDER BY transaction_date ASC
      `);
      return result.rows.map(rowToDraftRow);
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async markConfirmed(tx: unknown, draftId: string, actorUserId: string): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    await drizzleTx.execute(sql`
      UPDATE budgeting.expense_ledger
         SET confirmed_at = now(),
             updated_at = now()
       WHERE id = ${draftId}::uuid
         AND confirmed_at IS NULL
    `);
  }

  async markSkipped(tx: unknown, draftId: string, actorUserId: string): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    // "Skip" = soft-delete for drafts
    await drizzleTx.execute(sql`
      UPDATE budgeting.expense_ledger
         SET deleted_at = now(),
             updated_at = now()
       WHERE id = ${draftId}::uuid
         AND confirmed_at IS NULL
    `);
  }

  async regenerateFuturePending(
    tx: unknown,
    ruleId: string,
    edits: DraftEdits,
  ): Promise<string[]> {
    const drizzleTx = tx as DrizzleTx;

    const amountClause = edits.amountOriginalCents !== undefined
      ? sql`amount_original_cents = ${edits.amountOriginalCents}::bigint, amount_converted_cents = ${edits.amountOriginalCents}::bigint,`
      : sql``;
    const currencyClause = edits.currency !== undefined
      ? sql`currency_original = ${edits.currency},`
      : sql``;
    const categoryClause = edits.categoryId !== undefined
      ? sql`category_id = ${edits.categoryId ?? null}::uuid,`
      : sql``;
    const noteClause = edits.note !== undefined
      ? sql`note = ${edits.note ?? null},`
      : sql``;

    const result = await drizzleTx.execute(sql`
      UPDATE budgeting.expense_ledger
         SET ${amountClause}
             ${currencyClause}
             ${categoryClause}
             ${noteClause}
             updated_at = now()
       WHERE recurring_rule_id = ${ruleId}::uuid
         AND confirmed_at IS NULL
         AND deleted_at IS NULL
         AND transaction_date >= CURRENT_DATE
      RETURNING id
    `);
    return result.rows.map((r) => (r as Record<string, unknown>).id as string);
  }
}
