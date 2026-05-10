/**
 * replay-projections.ts — ENGR-14 operator replay use case (Plan 02-09).
 *
 * Rebuilds budgeting.spending_by_category_month from expense_ledger for an operator-
 * supplied date range:
 *   1. DELETE projection rows for tenant where month_start_date IN range
 *   2. INSERT fresh aggregate from ledger (latest-only, kind=EXPENSE)
 * All inside ONE withTenantTx (atomic). Operator-only — no UI exposure (T-2-09-07).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";

export interface ReplayProjectionsInput {
  tenantId: string;
  dateFrom: string;
  dateTo: string;
  actorUserId?: string;
}

export interface ReplayProjectionsOutput {
  monthsReplayed: number;
}

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export function replayProjections() {
  return async (
    input: ReplayProjectionsInput,
  ): Promise<Result<ReplayProjectionsOutput, Error>> => {
    const actorUser = input.actorUserId ?? SYSTEM_USER_ID;
    const tid = TenantId(input.tenantId);
    const uid = UserId(actorUser);

    let monthsReplayed = 0;

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as {
        execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
      };

      // 1. Delete affected month rows
      await drizzleTx.execute(
        sql`DELETE FROM budgeting.spending_by_category_month
             WHERE tenant_id = ${input.tenantId}::uuid
               AND month_start_date BETWEEN
                   date_trunc('month', ${input.dateFrom}::date)::date
               AND date_trunc('month', ${input.dateTo}::date)::date`,
      );

      // 2. Re-insert fresh aggregate from latest-only ledger
      const inserted = await drizzleTx.execute(
        sql`INSERT INTO budgeting.spending_by_category_month
              (tenant_id, workspace_id, category_id, month_start_date,
               normal_amount, cushion_amount, currency, updated_at)
            SELECT ${input.tenantId}::uuid AS tenant_id,
                   ${input.tenantId}::uuid AS workspace_id,
                   e.category_id,
                   date_trunc('month', e.transaction_date)::date AS month_start_date,
                   SUM(e.amount_default)::numeric AS normal_amount,
                   '0'::numeric AS cushion_amount,
                   e.currency_default AS currency,
                   now()
              FROM budgeting.expense_ledger e
             WHERE e.tenant_id = ${input.tenantId}::uuid
               AND e.kind = 'EXPENSE'
               AND e.category_id IS NOT NULL
               AND e.id NOT IN (
                     SELECT corrects_id FROM budgeting.expense_ledger
                      WHERE tenant_id = ${input.tenantId}::uuid AND corrects_id IS NOT NULL
                   )
               AND e.transaction_date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
             GROUP BY e.category_id, date_trunc('month', e.transaction_date), e.currency_default
            RETURNING month_start_date`,
      );

      // De-duplicate months for return count
      const months = new Set(inserted.rows.map((r) => String(r.month_start_date)));
      monthsReplayed = months.size;
    });

    if (r.isErr()) return err(r.error);
    return ok({ monthsReplayed });
  };
}
