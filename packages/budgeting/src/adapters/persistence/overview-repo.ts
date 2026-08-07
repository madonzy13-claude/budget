/**
 * overview-repo.ts — Drizzle adapter for the Overview Planned section (11-04).
 *
 * Implements OverviewPlannedRepo. Every method opens its own withTenantTx scoped
 * to budgetId (v1.1: budget_id === tenant_id) so RLS GUC app.tenant_ids is set.
 *
 * Money convention (matches get-spendings-summary): the ledger stores
 * amount_converted_cents already in the budget currency, and category_limits are
 * in the budget currency — so spend + planned are default_ccy with NO FX here.
 * Spend is bucketed by transaction_date (NOT confirmed_at) so the monthly real
 * figures match the spendings grid (D-12); confirmed_at IS NOT NULL is the
 * confirmed filter. Per-month planned uses the SCD-2 category_limits row active at
 * month-start and the mode from budget_mode_history that month.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  OverviewPlannedRepo,
  MonthlyPlannedRow,
  MonthlySpendRow,
  CategoryWindow,
  DailySpendRow,
  ActiveRecurringRule,
} from "../../application/get-overview-planned";
import type { Cadence } from "../../application/recurring-monthly-normalize";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

async function read<T>(
  budgetId: string,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  const r = await withTenantTx(
    TenantId(budgetId),
    UserId(SYSTEM_USER_ID),
    async (tx) => fn(tx as DrizzleTx),
  );
  if (r.isErr()) throw r.error;
  return r.value;
}

export function createOverviewRepo(): OverviewPlannedRepo {
  return {
    async monthlySpendByCategory(
      budgetId,
      from,
      to,
    ): Promise<MonthlySpendRow[]> {
      return read(budgetId, async (tx) => {
        const res = await tx.execute(sql`
          SELECT category_id::text AS category_id,
                 to_char(transaction_date, 'YYYY-MM') AS month,
                 COALESCE(SUM(amount_converted_cents), 0)::text AS spent_cents
            FROM budgeting.expense_ledger
           WHERE budget_id = ${budgetId}::uuid
             AND tenant_id = ${budgetId}::uuid
             AND kind = 'SPENDING'
             AND category_id IS NOT NULL
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
             AND transaction_date >= ${from}::date
             AND transaction_date <= ${to}::date
           GROUP BY category_id, to_char(transaction_date, 'YYYY-MM')
        `);
        return res.rows.map((r) => ({
          category_id: r.category_id as string,
          month: r.month as string,
          spent_cents: BigInt(r.spent_cents as string),
        }));
      });
    },

    async monthlyPlannedByCategory(
      budgetId,
      from,
      to,
    ): Promise<MonthlyPlannedRow[]> {
      return read(budgetId, async (tx) => {
        const res = await tx.execute(sql`
          WITH months AS (
            -- 260801: month_end is what the LIMIT + MODE lookups resolve at, so a
            -- month tick carries the LATEST value in force during that month. The
            -- old month_start lookup ignored a limit raised mid-month and drew the
            -- superseded figure for the whole month (user report, 6M+).
            SELECT date_trunc('month', gs)::date AS month_start,
                   (date_trunc('month', gs) + interval '1 month'
                      - interval '1 day')::date AS month_end,
                   to_char(date_trunc('month', gs), 'YYYY-MM') AS month
              FROM generate_series(
                     date_trunc('month', ${from}::date),
                     date_trunc('month', ${to}::date),
                     interval '1 month'
                   ) gs
          ),
          mode_at AS (
            SELECT m.month_start,
                   COALESCE((
                     SELECT bmh.mode
                       FROM budgeting.budget_mode_history bmh
                      WHERE bmh.tenant_id = ${budgetId}::uuid
                        AND bmh.effective_from <= m.month_end
                        AND (bmh.effective_to IS NULL OR bmh.effective_to >= m.month_start)
                      ORDER BY bmh.effective_from DESC
                      LIMIT 1
                   ), 'NORMAL') AS mode
              FROM months m
          ),
          -- NB: do NOT gate on created_at — a limit can be BACKDATED to a month
          -- before the category row's created_at (UAT round 13). The LATERAL join
          -- on category_limits.effective_from is the real gate: a month only yields
          -- a planned row when a limit was actually effective then. Archived gate
          -- stays (drop the category for months at/after it's archived).
          cat_month AS (
            SELECT c.id AS category_id, c.cushion_mode, m.month, m.month_start, m.month_end
              FROM budgeting.categories c
              CROSS JOIN months m
             WHERE c.tenant_id = ${budgetId}::uuid
               AND (c.archived_from IS NULL OR to_char(c.archived_from, 'YYYY-MM') >= m.month)
          )
          SELECT cm.category_id::text AS category_id,
                 cm.month AS month,
                 (CASE WHEN ma.mode = 'CUSHION' THEN cl.cushion_amount
                       ELSE cl.normal_amount END)::text AS planned_cents,
                 -- needs = the essential portion; wants = planned − needs.
                 -- The slider writes the split the user typed onto the limit row
                 -- (needs_amount), so PREFER it — inferring needs from the cushion
                 -- ignored the edit entirely and the charts kept the old split
                 -- (user report, 260803). Capped at planned, because a cushion
                 -- month can be smaller than the normal-month needs figure.
                 -- Rows written before the split columns existed have NULL there:
                 -- fall back to the cushion, except for a NON-cushioned category
                 -- (mode 'none') whose whole plan is needs, not wants.
                 (CASE WHEN cl.needs_amount IS NOT NULL
                       THEN LEAST(cl.needs_amount,
                                  CASE WHEN ma.mode = 'CUSHION' THEN cl.cushion_amount
                                       ELSE cl.normal_amount END)
                       WHEN cm.cushion_mode = 'none'
                       THEN CASE WHEN ma.mode = 'CUSHION' THEN cl.cushion_amount
                                 ELSE cl.normal_amount END
                       ELSE LEAST(cl.cushion_amount,
                                  CASE WHEN ma.mode = 'CUSHION' THEN cl.cushion_amount
                                       ELSE cl.normal_amount END)
                  END)::text AS needs_cents
            FROM cat_month cm
            JOIN mode_at ma ON ma.month_start = cm.month_start
            JOIN LATERAL (
              SELECT cl.normal_amount, cl.cushion_amount, cl.needs_amount
                FROM budgeting.category_limits cl
               WHERE cl.tenant_id = ${budgetId}::uuid
                 AND cl.category_id = cm.category_id
                 -- Overlap, not a point-in-time probe: SCD-2 rows written by the
                 -- app close a period on the NEXT period's first day, while
                 -- reconstructed rows (the House backfill) close it on this
                 -- month's LAST day. A strict > month_end dropped every
                 -- inclusive row and the category vanished from the plan (260801).
                 -- ORDER BY effective_from DESC then yields the month's LATEST
                 -- limit either way.
                 AND cl.effective_from <= cm.month_end
                 AND (cl.effective_to IS NULL OR cl.effective_to >= cm.month_start)
               ORDER BY cl.effective_from DESC
               LIMIT 1
            ) cl ON true
        `);
        return res.rows.map((r) => ({
          category_id: r.category_id as string,
          month: r.month as string,
          planned_cents: BigInt(r.planned_cents as string),
          needs_cents: BigInt(r.needs_cents as string),
        }));
      });
    },

    async categoryWindows(budgetId): Promise<CategoryWindow[]> {
      return read(budgetId, async (tx) => {
        const res = await tx.execute(sql`
          SELECT id::text AS category_id,
                 name,
                 to_char(created_at, 'YYYY-MM') AS created_month,
                 CASE WHEN archived_from IS NOT NULL
                      THEN to_char(archived_from, 'YYYY-MM') ELSE NULL END AS archived_month,
                 COALESCE(is_investment, false) AS is_investment,
                 investment_limit_mode
            FROM budgeting.categories
           WHERE tenant_id = ${budgetId}::uuid
        `);
        return res.rows.map((r) => ({
          category_id: r.category_id as string,
          name: r.name as string,
          created_month: r.created_month as string,
          archived_month: (r.archived_month as string | null) ?? null,
          is_investment: (r.is_investment as boolean | null) ?? false,
          investment_limit_mode:
            (r.investment_limit_mode as string | null) ?? null,
        }));
      });
    },

    async dailySpend(
      budgetId,
      from,
      to,
      categoryIds,
    ): Promise<DailySpendRow[]> {
      return read(budgetId, async (tx) => {
        // Every category counts, investments included (260803 user request):
        // the line is the household's whole outgoing, and the Investments plan
        // is resolved alongside it so the two stay comparable. Narrow it only
        // when the picker names categories.
        // sql`= ANY(${array})` sends the ids as separate parameters and Postgres
        // sees a malformed array literal — build the IN list explicitly.
        const catFilter = categoryIds?.length
          ? sql`AND category_id IN (${sql.join(
              categoryIds.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`
          : sql``;
        const res = await tx.execute(sql`
          SELECT to_char(transaction_date, 'YYYY-MM-DD') AS day,
                 COALESCE(SUM(amount_converted_cents), 0)::text AS spent_cents
            FROM budgeting.expense_ledger
           WHERE budget_id = ${budgetId}::uuid
             AND tenant_id = ${budgetId}::uuid
             AND kind = 'SPENDING'
             AND confirmed_at IS NOT NULL
             AND deleted_at IS NULL
             AND transaction_date >= ${from}::date
             AND transaction_date <= ${to}::date
             ${catFilter}
           GROUP BY transaction_date
           ORDER BY transaction_date
        `);
        return res.rows.map((r) => ({
          day: r.day as string,
          spent_cents: BigInt(r.spent_cents as string),
        }));
      });
    },

    async activeRecurringRules(budgetId): Promise<ActiveRecurringRule[]> {
      return read(budgetId, async (tx) => {
        const res = await tx.execute(sql`
          SELECT rr.category_id::text AS category_id,
                 c.name AS name,
                 rr.note AS rule_name,
                 (rr.amount * 100)::bigint::text AS amount_cents,
                 rr.currency,
                 rr.cadence,
                 rr.yearly_month
            FROM budgeting.recurring_rules rr
            LEFT JOIN budgeting.categories c
              ON c.id = rr.category_id AND c.tenant_id = rr.tenant_id
           WHERE rr.tenant_id = ${budgetId}::uuid
             AND rr.active = true
        `);
        return res.rows.map((r) => ({
          category_id: (r.category_id as string | null) ?? null,
          name: (r.name as string | null) ?? null,
          rule_name: (r.rule_name as string | null) ?? null,
          amount_cents: BigInt(r.amount_cents as string),
          currency: r.currency as string,
          cadence: r.cadence as Cadence,
          yearly_month: (r.yearly_month as number | null) ?? null,
        }));
      });
    },
  };
}
