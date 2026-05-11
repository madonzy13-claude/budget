/**
 * recurring-rule-repo.ts — Drizzle adapter for RecurringRuleRepo port.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, writeAudit } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { RecurringRuleRepo, RecurringRuleRow, RecurringRuleEdits } from "../../ports/recurring-rule-repo";

type DrizzleTx = { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };

function rowToRuleRow(row: Record<string, unknown>): RecurringRuleRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    accountId: row.wallet_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    amount: String(row.amount),
    currency: row.currency as string,
    kind: row.kind as "EXPENSE" | "INCOME" | "TRANSFER",
    cadence: row.cadence as "MONTHLY" | "WEEKLY",
    cadenceAnchor: row.cadence_anchor as number | null,
    weeklyDow: row.weekly_dow as number | null,
    note: (row.note as string | null) ?? null,
    active: Boolean(row.active),
    nextDueDate: row.next_due_date as string,
    createdAt: new Date(row.created_at as string),
    actorUserId: row.actor_user_id as string,
  };
}

export class DrizzleRecurringRuleRepo implements RecurringRuleRepo {
  async insert(rule: {
    tenantId: string;
    accountId: string;
    categoryId: string | null;
    amount: string;
    currency: string;
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
    cadence: "MONTHLY" | "WEEKLY";
    cadenceAnchor: number | null;
    weeklyDow: number | null;
    note: string | null;
    nextDueDate: string;
    actorUserId: string;
  }): Promise<{ id: string }> {
    const r = await withTenantTx(TenantId(rule.tenantId), UserId(rule.actorUserId), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        INSERT INTO budgeting.recurring_rules
          (tenant_id, wallet_id, category_id, amount, currency, kind, cadence,
           cadence_anchor, weekly_dow, note, active, next_due_date, actor_user_id)
        VALUES
          (${rule.tenantId}::uuid, ${rule.accountId}::uuid, ${rule.categoryId}::uuid,
           ${rule.amount}::numeric, ${rule.currency}, ${rule.kind}, ${rule.cadence},
           ${rule.cadenceAnchor}, ${rule.weeklyDow}, ${rule.note}, true,
           ${rule.nextDueDate}::date, ${rule.actorUserId}::uuid)
        RETURNING id
      `);
      return { id: (result.rows[0] as Record<string, unknown>).id as string };
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async findById(tenantId: string, ruleId: string): Promise<RecurringRuleRow | null> {
    const r = await withTenantTx(TenantId(tenantId), UserId("00000000-0000-0000-0000-000000000001"), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_rules
         WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
      return result.rows[0] ? rowToRuleRow(result.rows[0]) : null;
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listActive(tenantId: string): Promise<RecurringRuleRow[]> {
    const r = await withTenantTx(TenantId(tenantId), UserId("00000000-0000-0000-0000-000000000001"), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.recurring_rules
         WHERE tenant_id = ${tenantId}::uuid AND active = true
         ORDER BY created_at ASC
      `);
      return result.rows.map(rowToRuleRow);
    });
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async update(tx: unknown, ruleId: string, tenantId: string, edits: RecurringRuleEdits): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    // Build sql dynamically using Drizzle sql tag (each part is parameterized)
    const { sql: sqlTag } = await import("drizzle-orm");

    // Always update updated_at; only include fields that are actually set
    const amountClause = edits.amount !== undefined
      ? sqlTag`amount = ${edits.amount}::numeric,`
      : sqlTag``;
    const currencyClause = edits.currency !== undefined
      ? sqlTag`currency = ${edits.currency},`
      : sqlTag``;
    const categoryClause = edits.categoryId !== undefined
      ? sqlTag`category_id = ${edits.categoryId ?? null}::uuid,`
      : sqlTag``;
    const accountClause = edits.accountId !== undefined
      ? sqlTag`wallet_id = ${edits.accountId}::uuid,`
      : sqlTag``;
    const noteClause = edits.note !== undefined
      ? sqlTag`note = ${edits.note ?? null},`
      : sqlTag``;
    const activeClause = edits.active !== undefined
      ? sqlTag`active = ${edits.active},`
      : sqlTag``;

    await drizzleTx.execute(sqlTag`
      UPDATE budgeting.recurring_rules
         SET ${amountClause}
             ${currencyClause}
             ${categoryClause}
             ${accountClause}
             ${noteClause}
             ${activeClause}
             updated_at = now()
       WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
    `);
  }

  async advanceNextDueDate(tx: unknown, ruleId: string, nextDueDate: string): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    await drizzleTx.execute(sql`
      UPDATE budgeting.recurring_rules
         SET next_due_date = ${nextDueDate}::date,
             updated_at = now()
       WHERE id = ${ruleId}::uuid
    `);
  }

  async deactivate(tenantId: string, ruleId: string, actorUserId: string): Promise<void> {
    const r = await withTenantTx(TenantId(tenantId), UserId(actorUserId), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const before = await drizzleTx.execute(sql`
        SELECT active FROM budgeting.recurring_rules WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
      await drizzleTx.execute(sql`
        UPDATE budgeting.recurring_rules
           SET active = false, updated_at = now()
         WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
      await writeAudit(tx, {
        tenantId: TenantId(tenantId),
        actorUserId: UserId(actorUserId),
        entityType: "recurring_rule",
        entityId: ruleId,
        action: "update" as const,
        before: before.rows[0] ?? {},
        after: { active: false },
      });
    });
    if (r.isErr()) throw r.error;
  }
}
