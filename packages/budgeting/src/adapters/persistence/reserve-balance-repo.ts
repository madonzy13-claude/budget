/**
 * reserve-balance-repo.ts — Drizzle adapter for ReserveBalanceRepo port.
 * SELECTs from budgeting.category_reserve_balance VIEW (created by migration 0013/0014).
 * Money at adapter boundary: balance_cents (bigint) → Money.of(decimal, currency).
 * RLS inherited from VIEW's base tables (expense_ledger, category_limits, budget_mode_history).
 * RSCM-01 + RSCM-02 per D-PH2-02.
 *
 * Plan 05-03 W-3: adds getExcludedForBudget — same CTE body as the VIEW but with
 * reserve_excluded = TRUE filter. Implementation choice: option (i) inline SQL
 * (mirrors VIEW body for reserve_excluded=true categories) rather than a sibling
 * VIEW (option ii) to avoid additional migration + RLS policy boilerplate.
 * If the VIEW body diverges in a future migration, update _queryExcluded accordingly.
 */
import { sql } from "drizzle-orm";
import { withTenantTx, withInfraTx } from "@budget/platform";
import { TenantId, UserId, Money } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { ReserveBalanceRepo } from "../../ports/reserve-balance-repo";

/** Convert balance_cents (bigint or numeric string from Postgres) to Money decimal. */
function centsToMoney(balanceCents: unknown, currency: string): Money {
  const cents =
    typeof balanceCents === "bigint"
      ? balanceCents
      : BigInt(String(balanceCents ?? "0"));
  // Convert cents to decimal: 10000 cents → "100.00"
  const whole = cents / 100n;
  const fraction = cents % 100n;
  const decimalStr = `${whole}.${String(fraction < 0n ? -fraction : fraction).padStart(2, "0")}`;
  return Money.of(decimalStr, currency as Currency);
}

/** Fetch budget default_currency (tenant_id = budget_id in this schema). */
async function getBudgetCurrency(budgetId: string): Promise<string> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as {
      execute: (
        q: unknown,
      ) => Promise<{ rows: Array<{ default_currency: string }> }>;
    };
    const rs = await drizzleTx.execute(
      sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid LIMIT 1`,
    );
    return rs.rows[0]?.default_currency ?? "EUR";
  });
  return r.isOk() ? r.value : "EUR";
}

export function createReserveBalanceRepo(): ReserveBalanceRepo {
  return {
    async getForBudget(budgetId, tenantId, _asOf) {
      const currency = await getBudgetCurrency(budgetId);
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId("system"),
        async (tx) => {
          const drizzleTx = tx as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          // UAT-PH5-T3-49: the category_reserve_balance VIEW recursion
          // is bootstrapped from category_limits — categories without
          // any limit produce no row in the VIEW, so adjustments
          // recorded against them are silently dropped. Merge the
          // VIEW with a fallback SUM(delta_cents) from
          // category_reserve_adjustments for non-excluded categories
          // that aren't in the VIEW. Categories that ARE in the VIEW
          // already include adjustments via the VIEW's own JOIN, so
          // the fallback intentionally excludes them to avoid
          // double-counting.
          const result = await drizzleTx.execute(
            sql`
              WITH v AS (
                SELECT category_id, balance_cents
                FROM budgeting.category_reserve_balance
                WHERE budget_id = ${budgetId}::uuid
              ),
              adj AS (
                SELECT a.category_id,
                       SUM(a.delta_cents)::numeric AS balance_cents
                FROM budgeting.category_reserve_adjustments a
                JOIN budgeting.categories c ON c.id = a.category_id
                WHERE a.tenant_id = ${tenantId}::uuid
                  AND c.reserve_excluded = false
                  AND a.category_id NOT IN (SELECT category_id FROM v)
                GROUP BY a.category_id
              )
              SELECT category_id, balance_cents FROM v
              UNION ALL
              SELECT category_id, balance_cents FROM adj
            `,
          );
          return result.rows;
        },
      );
      if (r.isErr()) throw r.error;
      const map = new Map<string, Money>();
      for (const row of r.value) {
        map.set(
          row.category_id as string,
          centsToMoney(row.balance_cents, currency),
        );
      }
      return map;
    },

    /**
     * getExcludedForBudget — inline SQL mirroring the VIEW body but filtering
     * to reserve_excluded = TRUE categories (option (i) from Plan 03 action (e)).
     *
     * The CTE replicates the same accumulation math as the VIEW (0020 migration):
     *   months → monthly_spent → mode_per_month → budget_per_month → min_months →
     *   reserve_accum → adjustments → DISTINCT ON (budget_id, category_id)
     *
     * Only difference: INNER JOIN categories c WHERE c.reserve_excluded = TRUE
     * (vs the VIEW's WHERE c.reserve_excluded = FALSE).
     */
    async getExcludedForBudget(budgetId, tenantId, _asOf) {
      const currency = await getBudgetCurrency(budgetId);
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId("system"),
        async (tx) => {
          const drizzleTx = tx as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          const result = await drizzleTx.execute(sql`
          WITH RECURSIVE months AS (
            SELECT
              cl.tenant_id AS budget_id,
              cl.category_id,
              cl.tenant_id,
              LEAST(
                COALESCE(date_trunc('month', MIN(cl.effective_from))::date, date_trunc('month', CURRENT_DATE)::date),
                COALESCE(date_trunc('month', MIN(e.transaction_date))::date, date_trunc('month', CURRENT_DATE)::date)
              ) AS month_start
            FROM budgeting.category_limits cl
            LEFT JOIN budgeting.expense_ledger e
              ON e.category_id = cl.category_id
             AND COALESCE(e.budget_id, e.tenant_id) = cl.tenant_id
             AND e.deleted_at IS NULL
            WHERE cl.tenant_id = ${tenantId}::uuid
            GROUP BY cl.tenant_id, cl.category_id

            UNION ALL

            SELECT budget_id, category_id, tenant_id,
                   (month_start + INTERVAL '1 month')::date
            FROM months
            WHERE month_start < date_trunc('month', CURRENT_DATE)::date
          ),
          monthly_spent AS (
            SELECT
              COALESCE(e.budget_id, e.tenant_id) AS budget_id,
              e.category_id,
              date_trunc('month', e.transaction_date)::date AS month_start,
              SUM(
                CASE
                  WHEN e.kind = 'SPENDING' THEN  e.amount_converted_cents
                  WHEN e.kind = 'INCOME'   THEN -e.amount_converted_cents
                  ELSE 0
                END
              ) AS spent_cents
            FROM budgeting.expense_ledger e
            WHERE e.confirmed_at IS NOT NULL AND e.deleted_at IS NULL
              AND COALESCE(e.budget_id, e.tenant_id) = ${budgetId}::uuid
            GROUP BY COALESCE(e.budget_id, e.tenant_id), e.category_id,
                     date_trunc('month', e.transaction_date)
          ),
          mode_per_month AS (
            SELECT DISTINCT
              m.budget_id, m.month_start,
              COALESCE(
                (SELECT bmh.mode
                 FROM budgeting.budget_mode_history bmh
                 WHERE bmh.budget_id = m.budget_id
                   AND bmh.effective_from <= m.month_start
                   AND (bmh.effective_to IS NULL OR bmh.effective_to > m.month_start)
                 ORDER BY bmh.effective_from DESC LIMIT 1),
                'NORMAL'
              ) AS mode
            FROM months m
          ),
          budget_per_month AS (
            SELECT
              cl.tenant_id AS budget_id,
              cl.category_id,
              cl.tenant_id,
              m.month_start,
              CASE
                WHEN mpm.mode = 'CUSHION' THEN COALESCE(cl.cushion_amount_cents, 0)
                ELSE                           COALESCE(cl.normal_amount, 0)
              END AS active_budget_cents
            FROM months m
            JOIN budgeting.category_limits cl
              ON cl.category_id   = m.category_id
             AND cl.tenant_id     = m.budget_id
             AND cl.effective_from <= m.month_start
             AND (cl.effective_to IS NULL OR cl.effective_to > m.month_start)
            LEFT JOIN mode_per_month mpm
              ON mpm.budget_id = m.budget_id AND mpm.month_start = m.month_start
          ),
          min_months AS (
            SELECT budget_id, category_id, MIN(month_start) AS first_month
            FROM budget_per_month
            GROUP BY budget_id, category_id
          ),
          reserve_accum AS (
            SELECT
              bpm.budget_id,
              bpm.category_id,
              bpm.tenant_id,
              bpm.month_start,
              GREATEST(0, bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)) AS reserve_cents
            FROM budget_per_month bpm
            JOIN min_months mm
              ON mm.budget_id   = bpm.budget_id
             AND mm.category_id = bpm.category_id
             AND bpm.month_start = mm.first_month
            LEFT JOIN monthly_spent ms
              ON ms.budget_id   = bpm.budget_id
             AND ms.category_id = bpm.category_id
             AND ms.month_start = bpm.month_start

            UNION ALL

            SELECT
              bpm.budget_id,
              bpm.category_id,
              bpm.tenant_id,
              bpm.month_start,
              GREATEST(0,
                ra.reserve_cents + bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)
              ) AS reserve_cents
            FROM reserve_accum ra
            JOIN budget_per_month bpm
              ON bpm.budget_id   = ra.budget_id
             AND bpm.category_id = ra.category_id
             AND bpm.month_start = (ra.month_start + INTERVAL '1 month')::date
            LEFT JOIN monthly_spent ms
              ON ms.budget_id   = bpm.budget_id
             AND ms.category_id = bpm.category_id
             AND ms.month_start = bpm.month_start
          ),
          latest_past AS (
            SELECT DISTINCT ON (budget_id, category_id)
              budget_id, category_id, tenant_id, reserve_cents
            FROM reserve_accum
            WHERE month_start < date_trunc('month', CURRENT_DATE)::date
            ORDER BY budget_id, category_id, month_start DESC
          ),
          adjustments AS (
            SELECT category_id, SUM(delta_cents) AS adj_total
            FROM budgeting.category_reserve_adjustments
            WHERE tenant_id = ${tenantId}::uuid
            GROUP BY category_id
          )
          SELECT
            c.tenant_id AS budget_id,
            c.id        AS category_id,
            c.tenant_id,
            (COALESCE(lp.reserve_cents, 0) + COALESCE(adj.adj_total, 0)) AS balance_cents
          FROM budgeting.categories c
          LEFT JOIN latest_past lp
            ON lp.category_id = c.id AND lp.budget_id = c.tenant_id
          LEFT JOIN adjustments adj
            ON adj.category_id = c.id
          WHERE c.tenant_id = ${budgetId}::uuid
            AND c.reserve_excluded = TRUE
            AND (lp.reserve_cents IS NOT NULL OR adj.adj_total IS NOT NULL)
        `);
          return result.rows;
        },
      );
      if (r.isErr()) throw r.error;
      const map = new Map<string, Money>();
      for (const row of r.value) {
        map.set(
          row.category_id as string,
          centsToMoney(row.balance_cents, currency),
        );
      }
      return map;
    },

    async getForCategory(budgetId, categoryId, tenantId, _asOf) {
      const currency = await getBudgetCurrency(budgetId);
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId("system"),
        async (tx) => {
          const drizzleTx = tx as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          };
          const result = await drizzleTx.execute(
            sql`SELECT balance_cents
                FROM budgeting.category_reserve_balance
                WHERE budget_id = ${budgetId}::uuid
                  AND category_id = ${categoryId}::uuid`,
          );
          return result.rows[0] ?? null;
        },
      );
      if (r.isErr()) throw r.error;
      if (!r.value) {
        // No history for this category — return zero balance
        return Money.of("0", currency as Currency);
      }
      return centsToMoney(r.value.balance_cents, currency);
    },
  };
}
