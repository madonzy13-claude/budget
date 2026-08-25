/**
 * scheduled-payment-repo.ts — Drizzle adapter for ScheduledPaymentRepo port.
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
import type {
  ScheduledPaymentRepo,
  ScheduledPaymentRow,
  ScheduledPaymentEdits,
} from "../../ports/scheduled-payment-repo";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

function rowToRuleRow(row: Record<string, unknown>): ScheduledPaymentRow {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    amount: String(row.amount),
    currency: row.currency as string,
    cadence: row.cadence as "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY",
    cadenceAnchor: row.cadence_anchor as number | null,
    weeklyDow: row.weekly_dow as number | null,
    yearlyMonth: row.yearly_month as number | null,
    note: (row.note as string | null) ?? null,
    active: Boolean(row.active),
    nextDueDate: row.next_due_date as string,
    endDate: (row.end_date as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    actorUserId: row.actor_user_id as string,
    deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : null,
    // Only listVisible computes this; findById leaves it undefined rather than
    // claiming false, which would read as "nothing confirmed" and unlock an
    // edit that should not be offered.
    hasConfirmedDraft:
      row.has_confirmed_draft === undefined
        ? undefined
        : Boolean(row.has_confirmed_draft),
  };
}

export class DrizzleScheduledPaymentRepo implements ScheduledPaymentRepo {
  async insert(rule: {
    tenantId: string;
    categoryId: string | null;
    amount: string;
    currency: string;
    cadence: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
    cadenceAnchor: number | null;
    weeklyDow: number | null;
    yearlyMonth: number | null;
    note: string | null;
    nextDueDate: string;
    actorUserId: string;
  }): Promise<{ id: string }> {
    const r = await withTenantTx(
      TenantId(rule.tenantId),
      UserId(rule.actorUserId),
      async (tx) => {
        const drizzleTx = tx as DrizzleTx;
        const result = await drizzleTx.execute(sql`
        INSERT INTO budgeting.scheduled_payments
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
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async findById(
    tenantId: string,
    ruleId: string,
  ): Promise<ScheduledPaymentRow | null> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId("00000000-0000-0000-0000-000000000001"),
      async (tx) => {
        const drizzleTx = tx as DrizzleTx;
        const result = await drizzleTx.execute(sql`
        SELECT * FROM budgeting.scheduled_payments
         WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
        return result.rows[0] ? rowToRuleRow(result.rows[0]) : null;
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async listVisible(tenantId: string): Promise<ScheduledPaymentRow[]> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId("00000000-0000-0000-0000-000000000001"),
      async (tx) => {
        const drizzleTx = tx as DrizzleTx;
        // An inactive ONE-TIME payment is INCLUDED: it has happened, which is
        // over rather than gone, and the household still wants to see it
        // (disabled, at the bottom).
        //
        // An inactive RHYTHM is not. "Inactive" is the only mark every payment
        // deleted before deleted_at existed (mig 0079) carries, so treating it
        // as retirement resurrected years of deletions into the list (user
        // screenshot, 260807). A one-time payment is the only kind that retires
        // itself, so it is the only kind whose inactivity means something else.
        //
        // has_confirmed_draft is likewise a ONE-TIME question: confirming one
        // occurrence of a yearly payment says nothing about the next, and the
        // edit button it hides must stay for every rhythm.
        const result = await drizzleTx.execute(sql`
        SELECT sp.*,
               sp.cadence = 'ONCE' AND EXISTS (
                 SELECT 1 FROM budgeting.expense_ledger el
                  WHERE el.scheduled_payment_id = sp.id
                    AND el.confirmed_at IS NOT NULL
                    AND el.deleted_at IS NULL
               ) AS has_confirmed_draft
          FROM budgeting.scheduled_payments sp
         WHERE sp.tenant_id = ${tenantId}::uuid
           AND sp.deleted_at IS NULL
           AND (sp.active = true OR sp.cadence = 'ONCE')
         ORDER BY sp.created_at ASC
      `);
        return result.rows.map(rowToRuleRow);
      },
    );
    if (r.isErr()) throw r.error;
    return r.value;
  }

  async update(
    tx: unknown,
    ruleId: string,
    tenantId: string,
    edits: ScheduledPaymentEdits,
  ): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    const { sql: sqlTag } = await import("drizzle-orm");

    const amountClause =
      edits.amount !== undefined
        ? sqlTag`amount = ${edits.amount}::numeric,`
        : sqlTag``;
    const currencyClause =
      edits.currency !== undefined
        ? sqlTag`currency = ${edits.currency},`
        : sqlTag``;
    const categoryClause =
      edits.categoryId !== undefined
        ? sqlTag`category_id = ${edits.categoryId ?? null}::uuid,`
        : sqlTag``;
    const noteClause =
      edits.note !== undefined
        ? sqlTag`note = ${edits.note ?? null},`
        : sqlTag``;
    const activeClause =
      edits.active !== undefined ? sqlTag`active = ${edits.active},` : sqlTag``;
    // Cadence-field clauses. next_due_date is recomputed separately by the
    // update-scheduled-payment use case (it holds the merged spec + today).
    const cadenceClause =
      edits.cadence !== undefined
        ? sqlTag`cadence = ${edits.cadence},`
        : sqlTag``;
    const cadenceAnchorClause =
      edits.cadenceAnchor !== undefined
        ? sqlTag`cadence_anchor = ${edits.cadenceAnchor},`
        : sqlTag``;
    const weeklyDowClause =
      edits.weeklyDow !== undefined
        ? sqlTag`weekly_dow = ${edits.weeklyDow},`
        : sqlTag``;
    const yearlyMonthClause =
      edits.yearlyMonth !== undefined
        ? sqlTag`yearly_month = ${edits.yearlyMonth},`
        : sqlTag``;
    const endDateClause =
      edits.endDate !== undefined
        ? sqlTag`end_date = ${edits.endDate ?? null}::date,`
        : sqlTag``;

    await drizzleTx.execute(sqlTag`
      UPDATE budgeting.scheduled_payments
         SET ${amountClause}
             ${currencyClause}
             ${categoryClause}
             ${noteClause}
             ${activeClause}
             ${cadenceClause}
             ${cadenceAnchorClause}
             ${weeklyDowClause}
             ${yearlyMonthClause}
             ${endDateClause}
             updated_at = now()
       WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
    `);
  }

  async advanceNextDueDate(
    tx: unknown,
    ruleId: string,
    nextDueDate: string,
  ): Promise<void> {
    const drizzleTx = tx as DrizzleTx;
    await drizzleTx.execute(sql`
      UPDATE budgeting.scheduled_payments
         SET next_due_date = ${nextDueDate}::date,
             updated_at = now()
       WHERE id = ${ruleId}::uuid
    `);
  }

  async softDelete(
    tenantId: string,
    ruleId: string,
    actorUserId: string,
  ): Promise<void> {
    const r = await withTenantTx(
      TenantId(tenantId),
      UserId(actorUserId),
      async (tx) => {
        const drizzleTx = tx as DrizzleTx;
        const before = await drizzleTx.execute(sql`
        SELECT active FROM budgeting.scheduled_payments WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);
        await drizzleTx.execute(sql`
        UPDATE budgeting.scheduled_payments
           SET active = false, deleted_at = now(), updated_at = now()
         WHERE id = ${ruleId}::uuid AND tenant_id = ${tenantId}::uuid
      `);

        // …and take the rule's UNCONFIRMED drafts with it, in the same
        // transaction. They describe a plan that no longer exists: left behind
        // they keep showing in the spendings grid and keep a CONFIRM_DRAFT task
        // in the queue, asking the household to confirm a payment they just
        // deleted. Mirrors what category archive already does
        // (category-repo.ts) and relies on the same app_role DELETE grant
        // (migration 0033).
        //
        // confirmed_at IS NULL is the whole guard: once confirmed, a draft is
        // money the household actually spent, and deleting the RULE says
        // nothing about it. Deleting the plan must never rewrite the history.
        await drizzleTx.execute(sql`
        DELETE FROM budgeting.expense_ledger
         WHERE scheduled_payment_id = ${ruleId}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND confirmed_at IS NULL
      `);
        await writeAudit(tx, {
          tenantId: TenantId(tenantId),
          actorUserId: UserId(actorUserId),
          entityType: "scheduled_rule",
          entityId: ruleId,
          action: "update" as const,
          before: before.rows[0] ?? {},
          after: { active: false },
        });
      },
    );
    if (r.isErr()) throw r.error;
  }
}
