/**
 * list-pending-drafts.ts — List pending recurring drafts for a tenant.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   Drafts are expense_ledger rows with confirmed_at IS NULL.
 */
import { ok, type Result } from "@budget/shared-kernel";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface PendingDraftRow {
  id: string;
  tenantId: string;
  ruleId: string;
  dueDate: string;
  amountOriginalCents: string;
  currency: string;
  categoryId: string | null;
  note: string | null;
  kind: "SPENDING" | "INCOME";
  createdAt: Date;
}

export interface ListPendingDraftsInput {
  tenantId: string;
  includeOverdue?: boolean;
}

export function listPendingDrafts(_deps: Record<string, unknown> = {}) {
  return async (input: ListPendingDraftsInput): Promise<Result<PendingDraftRow[], Error>> => {
    const r = await withTenantTx(TenantId(input.tenantId), UserId(SYSTEM_USER_ID), async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      const { sql } = await import("drizzle-orm");

      const result = await drizzleTx.execute(sql`
        SELECT id, tenant_id, recurring_rule_id, transaction_date,
               amount_original_cents, currency_original, category_id,
               note, kind, created_at
          FROM budgeting.expense_ledger
         WHERE tenant_id = ${input.tenantId}::uuid
           AND recurring_rule_id IS NOT NULL
           AND confirmed_at IS NULL
           AND deleted_at IS NULL
         ORDER BY transaction_date ASC
      `);

      return result.rows.map((row) => {
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
          kind: (row.kind as "SPENDING" | "INCOME") ?? "SPENDING",
          createdAt: new Date(row.created_at as string),
        } satisfies PendingDraftRow;
      });
    });

    if (r.isErr()) return r as unknown as Result<PendingDraftRow[], Error>;
    return ok(r.value);
  };
}
