/**
 * recurring-rule-repo.ts — Drizzle adapter for RecurringRuleRepo port.
 *
 * v1.1 (Phase 2, Plan 02-02):
 *   - wallet_id (accountId) DROPPED: categorical-only per TXN-02 / D-PH2-09
 *   - kind DROPPED: all rules produce SPENDING drafts per D-PH2-09
 *   - yearly_month ADDED for YEARLY cadence
 *   - Cadence extended to DAILY|WEEKLY|MONTHLY|YEARLY
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
    categoryId: (row.category_id as string | null) ?? null,
    amount: String(row.amount),
    currency: row.currency as string,
    cadence: row.cadence as "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
    cadenceAnchor: row.cadence_anchor as number | null,
    weeklyDow: row.weekly_dow as number | null,
    yearlyMonth: row.yearly_month as number | null,
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
    categoryId: string | null;
    amount: string;
    currency: string;
    cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    cadenceAnchor: number | null;
    weeklyDow: number | null;
    yearlyMonth: number | null;
    note: string | null;
    nextDueDate: string;
    actorUserId: string;
  }): Promise<{ id: string }> {
    const r = await withTenantTx(TenantId(rule.tenantId), UserId(rule.actorUserId), async (tx) => {
      const drizzleTx = tx as DrizzleTx;
      const result = await drizzleTx.execute(sql`
        INSERT INTO budgeting.recurring_rules
          (tenant_id, category_id, amount, currency, cadence,
           cadence_anchor, weekly_dow, yearly_month,
           note, active, next_due_date, actor_user_id)
        VALUES
          (${rule.tenantId}::uuid, ${rule.categoryId}::uuid,
           ${rule.amount}::numeric, ${rule.currency}, ${rule.cadence},
           ${rule.cadenceAnchor}, ${rule.weeklyDow}, ${rule.yearlyMonth},
           ${rule.note}, true,
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
    const { sql: sqlTag } = await import("drizzle-orm");

    const amountClause = edits.amount !== undefined
      ? sqlTag`amount = ${edits.amount}::numeric,`
      : sqlTag``;
    const currencyClause = edits.currency !== undefined
      ? sqlTag`currency = ${edits.currency},`
      : sqlTag``;
    const categoryClause = edits.categoryId !== undefined
      ? sqlTag`category_id = ${edits.categoryId ?? null}::uuid,`
      : sqlTag``;
    const noteClause = edits.note !== undefined
      ? sqlTag`note = ${edits.note ?? null},`
      : sqlTag``;
    const activeClause = edits.active !== undefined
      ? sqlTag`active = ${edits.active},`
      : sqlTag``;
    // Cadence-field clauses. next_due_date is recomputed separately by the
    // update-recurring-rule use case (it holds the merged spec + today).
    const cadenceClause = edits.cadence !== undefined
      ? sqlTag`cadence = ${edits.cadence},`
      : sqlTag``;
    const cadenceAnchorClause = edits.cadenceAnchor !== undefined
      ? sqlTag`cadence_anchor = ${edits.cadenceAnchor},`
      : sqlTag``;
    const weeklyDowClause = edits.weeklyDow !== undefined
      ? sqlTag`weekly_dow = ${edits.weeklyDow},`
      : sqlTag``;
    const yearlyMonthClause = edits.yearlyMonth !== undefined
      ? sqlTag`yearly_month = ${edits.yearlyMonth},`
      : sqlTag``;

    await drizzleTx.execute(sqlTag`
      UPDATE budgeting.recurring_rules
         SET ${amountClause}
             ${currencyClause}
             ${categoryClause}
             ${noteClause}
             ${activeClause}
             ${cadenceClause}
             ${cadenceAnchorClause}
             ${weeklyDowClause}
             ${yearlyMonthClause}
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
