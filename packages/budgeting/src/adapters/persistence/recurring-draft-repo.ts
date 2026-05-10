/**
 * recurring-draft-repo.ts — Drizzle adapter for RecurringDraftRepo port.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringDraftRepo, RecurringDraftRow, DraftEdits } from "../../ports/recurring-draft-repo";

type DrizzleTx = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

function rowToDraftRow(row: Record<string, unknown>): RecurringDraftRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    ruleId: row.rule_id as string,
    dueDate: row.due_date as string,
    amount: String(row.amount),
    currency: row.currency as string,
    accountId: row.account_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    kind: row.kind as "EXPENSE" | "INCOME" | "TRANSFER",
    note: (row.note as string | null) ?? null,
    status: row.status as "PENDING" | "CONFIRMED" | "SKIPPED",
    createdAt: new Date(row.created_at as string),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at as string) : null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
  };
}

export class DrizzleRecurringDraftRepo implements RecurringDraftRepo {
  async insert(
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
  ): Promise<{ id: string } | null> {
    const drizzleTx = tx as DrizzleTx;
    const result = await drizzleTx.execute(sql`
      INSERT INTO budgeting.recurring_drafts
        (tenant_id, rule_id, due_date, amount, currency, account_id, category_id, kind, note, status, actor_user_id)
      VALUES
        (${draft.tenantId}::uuid, ${draft.ruleId}::uuid, ${draft.dueDate}::date,
         ${draft.amount}::numeric, ${draft.currency}, ${draft.accountId}::uuid,
         ${draft.categoryId}::uuid, ${draft.kind}, ${draft.note}, 'PENDING', ${draft.actorUserId}::uuid)
      ON CONFLICT (rule_id, due_date) DO NOTHING
      RETURNING id
    `);
    if (!result.rows[0]) return null;
    return { id: (result.rows[0] as Record<string, unknown>).id as string };
  }

  async findById(tenantId: string, draftId: string): Promise<RecurringDraftRow | null> {
    const r = await withTenantTx(TenantId(tenantId), UserId("00000000-0000-0000-0000-000000000001"), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_drafts
         WHERE id = ${draftId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
      return result.rows[0] ? rowToDraftRow(result.rows[0]) : null;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listPending(tenantId: string): Promise<RecurringDraftRow[]> {
    const r = await withTenantTx(TenantId(tenantId), UserId("00000000-0000-0000-0000-000000000001"), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_drafts
         WHERE tenant_id = ${tenantId}::uuid AND status = 'PENDING'
         ORDER BY due_date ASC
      `);
      return result.rows.map(rowToDraftRow);
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async markConfirmed(tx: unknown, draftId: string, actorUserId: string): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    await drizzleTx.execute(sql`
      UPDATE budgeting.recurring_drafts
         SET status = 'CONFIRMED',
             confirmed_at = now(),
             actor_user_id = ${actorUserId}::uuid
       WHERE id = ${draftId}::uuid
    `);
  }

  async markSkipped(tx: unknown, draftId: string, actorUserId: string): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    await drizzleTx.execute(sql`
      UPDATE budgeting.recurring_drafts
         SET status = 'SKIPPED',
             confirmed_at = now(),
             actor_user_id = ${actorUserId}::uuid
       WHERE id = ${draftId}::uuid
    `);
  }

  /**
   * UPDATE future PENDING drafts in-place (D-01-d applyToFuture=true).
   * WHERE status = 'PENDING' AND due_date >= CURRENT_DATE ensures CONFIRMED rows are never modified.
   * In-place UPDATE (not delete-and-recreate) preserves draft.id and UNIQUE (rule_id, due_date).
   */
  async regenerateFuturePending(
    tx: unknown,
    ruleId: string,
    edits: DraftEdits,
  ): Promise<string[]> {
    const drizzleTx = tx as DrizzleTx;

    // Build dynamic SET clauses — only include fields that are actually set
    const amountClause = edits.amount !== undefined
      ? sql`amount = ${edits.amount}::numeric,`
      : sql``;
    const currencyClause = edits.currency !== undefined
      ? sql`currency = ${edits.currency},`
      : sql``;
    const accountClause = edits.accountId !== undefined
      ? sql`account_id = ${edits.accountId}::uuid,`
      : sql``;
    const categoryClause = edits.categoryId !== undefined
      ? sql`category_id = ${edits.categoryId ?? null}::uuid,`
      : sql``;
    const kindClause = edits.kind !== undefined
      ? sql`kind = ${edits.kind},`
      : sql``;
    const noteClause = edits.note !== undefined
      ? sql`note = ${edits.note ?? null},`
      : sql``;

    // status = 'PENDING' AND due_date >= CURRENT_DATE ensures CONFIRMED/SKIPPED never modified (D-01-d, T-2-08-10)
    const result = await drizzleTx.execute(sql`
      UPDATE budgeting.recurring_drafts
         SET ${amountClause}
             ${currencyClause}
             ${accountClause}
             ${categoryClause}
             ${kindClause}
             ${noteClause}
             status = status
       WHERE rule_id = ${ruleId}::uuid
         AND status = 'PENDING'
         AND due_date >= CURRENT_DATE
      RETURNING id
    `);
    return result.rows.map((r) => (r as Record<string, unknown>).id as string);
  }
}
