/**
 * reserve-fit-repo.ts — Drizzle adapter for the reserve-fit chart's one-off list
 * (260804).
 *
 * Two jobs:
 *   1. the candidates — the biggest confirmed spends per category in range, each
 *      carrying whether the budget has already un-ticked it and whether it came
 *      from a recurring rule (a yearly insurance charge is rare AND certain, so
 *      the member should see that before deciding);
 *   2. the toggle — insert/delete a row in budgeting.reserve_fit_exclusions.
 *
 * Only the SHORTLIST is decided here (top 5 per category). Whether a candidate is
 * big enough to bother a human with is policy, and lives in get-reserve-fit.ts
 * where it is unit-testable.
 *
 * Same conventions as overview-repo: own withTenantTx per call (RLS GUC), the
 * ledger's amount_converted_cents is already the budget currency, spend is
 * bucketed by transaction_date, confirmed_at IS NOT NULL is the confirmed filter.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  ReserveFitExclusionsRepo,
  LargeTransactionRow,
} from "../../application/get-reserve-fit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function tx<T>(
  budgetId: string,
  actorUserId: string,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  const r = await withTenantTx(
    TenantId(budgetId),
    UserId(actorUserId),
    async (t) => fn(t as DrizzleTx),
  );
  if (r.isErr()) throw r.error;
  return r.value;
}

/** How many candidates per category the member is offered. */
const SHORTLIST_PER_CATEGORY = 5;

export interface ReserveFitRepo extends ReserveFitExclusionsRepo {
  setExclusion(input: {
    budgetId: string;
    ledgerId: string;
    excluded: boolean;
    actorUserId: string;
  }): Promise<void>;
}

export function createReserveFitRepo(): ReserveFitRepo {
  return {
    async largeTransactions({ budgetId, from, to }) {
      return tx(budgetId, SYSTEM_USER_ID, async (t) => {
        const res = await t.execute(sql`
          WITH ranked AS (
            SELECT l.id,
                   l.category_id,
                   l.transaction_date,
                   l.note,
                   l.amount_converted_cents,
                   r.cadence AS recurring_cadence,
                   ROW_NUMBER() OVER (
                     PARTITION BY l.category_id
                     ORDER BY l.amount_converted_cents DESC
                   ) AS rn
              FROM budgeting.expense_ledger l
              LEFT JOIN budgeting.recurring_rules r ON r.id = l.recurring_rule_id
             WHERE l.tenant_id = ${budgetId}::uuid
               AND l.budget_id = ${budgetId}::uuid
               AND l.kind = 'SPENDING'
               AND l.category_id IS NOT NULL
               AND l.confirmed_at IS NOT NULL
               AND l.deleted_at IS NULL
               AND l.transaction_date >= ${from}::date
               AND l.transaction_date <= ${to}::date
          )
          SELECT ranked.id::text AS ledger_id,
                 ranked.category_id::text AS category_id,
                 to_char(ranked.transaction_date, 'YYYY-MM-DD') AS transaction_date,
                 ranked.note,
                 ranked.amount_converted_cents::text AS amount_cents,
                 ranked.recurring_cadence,
                 (x.ledger_id IS NOT NULL) AS excluded
            FROM ranked
            LEFT JOIN budgeting.reserve_fit_exclusions x
                   ON x.ledger_id = ranked.id
                  AND x.tenant_id = ${budgetId}::uuid
           WHERE ranked.rn <= ${SHORTLIST_PER_CATEGORY}
           ORDER BY ranked.amount_converted_cents DESC
        `);
        return res.rows.map((r): LargeTransactionRow => ({
          ledger_id: r.ledger_id as string,
          category_id: r.category_id as string,
          transaction_date: r.transaction_date as string,
          note: (r.note as string | null) ?? null,
          amount_cents: BigInt(r.amount_cents as string),
          recurring_cadence: (r.recurring_cadence as string | null) ?? null,
          excluded: Boolean(r.excluded),
        }));
      });
    },

    async setExclusion({ budgetId, ledgerId, excluded, actorUserId }) {
      return tx(budgetId, actorUserId, async (t) => {
        if (excluded) {
          // Idempotent: ticking the same row twice is not an error, and the
          // unique (tenant_id, ledger_id) keeps one row per transaction.
          await t.execute(sql`
            INSERT INTO budgeting.reserve_fit_exclusions
              (tenant_id, ledger_id, actor_user_id)
            SELECT ${budgetId}::uuid, l.id, ${actorUserId}::uuid
              FROM budgeting.expense_ledger l
             WHERE l.id = ${ledgerId}::uuid
               AND l.tenant_id = ${budgetId}::uuid
            ON CONFLICT (tenant_id, ledger_id) DO NOTHING
          `);
          return;
        }
        await t.execute(sql`
          DELETE FROM budgeting.reserve_fit_exclusions
           WHERE tenant_id = ${budgetId}::uuid
             AND ledger_id = ${ledgerId}::uuid
        `);
      });
    },
  };
}
