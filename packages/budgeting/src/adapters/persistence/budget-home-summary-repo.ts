/**
 * budget-home-summary-repo.ts — Drizzle adapter for BudgetHomeSummaryRepo port.
 *
 * Every method opens a withTenantTx scoped to budgetId (v1.1 invariant:
 * budget_id === tenant_id), so RLS GUC `app.tenant_ids` is set BEFORE any
 * SELECT runs against tenant-scoped tables.
 *
 * Schema invariants honored (per 03-02-PLAN.md <schema_canon>):
 *   - tenancy.budgets   keyed by id (no tenant_id col, no deleted_at col)
 *   - budgeting.expense_ledger (NOT transactions); date col transaction_date;
 *     sum amount_converted_cents where kind='SPENDING' AND confirmed_at IS
 *     NOT NULL AND deleted_at IS NULL
 *   - budgeting.wallets keyed by tenant_id; balance is current_balance
 *     numeric(19,4) — converted to cents at the boundary via (current_balance *
 *     100)::bigint
 *   - budgeting.category_limits uses cushion_amount (canonical bigint cents
 *     NOT NULL), NOT the v1.1 parallel nullable column added in MIG-05
 *   - budgeting.categories keyed by tenant_id (no budget_id col)
 *   - identity reads do NOT live here — boot.ts adapts identity.UserRepo into
 *     UserDisplayCurrencyReader (uses withUserContext, not withTenantTx)
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  BudgetHomeSummaryRepo,
  BudgetHomeSummaryMeta,
  BudgetKind,
  BudgetWalletRow,
  TopOverspentRow,
} from "../../ports/budget-home-summary-repo";

/**
 * System UUID used as the actor for read-only RLS GUC `app.current_user_id`.
 * Matches the precedent set by reserve-balance-repo.ts. The audit trail is
 * unaffected — reads do not write history rows.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

/** YYYY-MM-DD slice (UTC) for ::date binds. */
function toDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createBudgetHomeSummaryRepo(): BudgetHomeSummaryRepo {
  return {
    async getBudgetMeta(budgetId): Promise<BudgetHomeSummaryMeta | null> {
      // tenancy.budgets has NO tenant_id column; the budget id IS the tenant.
      // tenancy.budgets has NO deleted_at column.
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            SELECT name, kind::text AS kind, default_currency, cushion_mode_enabled
              FROM tenancy.budgets
             WHERE id = ${budgetId}::uuid
             LIMIT 1
          `);
          return res.rows[0] ?? null;
        },
      );
      if (r.isErr()) throw r.error;
      const row = r.value;
      if (!row) return null;
      return {
        name: row.name as string,
        kind: row.kind as BudgetKind,
        default_currency: row.default_currency as string,
        cushion_mode_enabled: Boolean(row.cushion_mode_enabled),
      };
    },

    async sumCurrentMonthSpend(
      budgetId,
      monthStart,
      monthEnd,
    ): Promise<bigint> {
      // Reads budgeting.expense_ledger directly (the v1.1 ledger table). Both
      // tenant_id and budget_id are present and equal per the v1.1 invariant
      // — filtering on both is defense in depth.
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            SELECT COALESCE(SUM(amount_converted_cents), 0)::text AS total
              FROM budgeting.expense_ledger
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${budgetId}::uuid
               AND kind = 'SPENDING'
               AND transaction_date >= ${toDate(monthStart)}::date
               AND transaction_date <  ${toDate(monthEnd)}::date
               AND confirmed_at IS NOT NULL
               AND deleted_at IS NULL
          `);
          return BigInt((res.rows[0]?.total as string) ?? "0");
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async listWalletsForBudget(budgetId): Promise<BudgetWalletRow[]> {
      // budgeting.wallets is TENANT-scoped (no budget_id column).
      // current_balance is numeric(19,4); we round-half-even to integer cents
      // at the boundary via (current_balance * 100)::bigint.
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            SELECT (current_balance * 100)::bigint::text AS amount_cents, currency
              FROM budgeting.wallets
             WHERE tenant_id = ${budgetId}::uuid
               AND archived_at IS NULL
          `);
          return res.rows.map((row) => ({
            amount_cents: BigInt(row.amount_cents as string),
            currency: row.currency as string,
          }));
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async topOverspentCategories(
      budgetId,
      monthStart,
      monthEnd,
      useCushion,
      limit,
    ): Promise<TopOverspentRow[]> {
      // category_limits is TENANT-scoped. Uses cushion_amount (canonical bigint
      // cents NOT NULL), NOT the v1.1 parallel nullable column (MIG-05).
      // SCD-2 row is active when
      //   effective_from <= monthStart < (effective_to OR +infinity).
      const startDate = toDate(monthStart);
      const endDate = toDate(monthEnd);
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            WITH spent AS (
              SELECT category_id,
                     COALESCE(SUM(amount_converted_cents), 0)::bigint AS spent_cents
                FROM budgeting.expense_ledger
               WHERE budget_id = ${budgetId}::uuid
                 AND tenant_id = ${budgetId}::uuid
                 AND kind = 'SPENDING'
                 AND transaction_date >= ${startDate}::date
                 AND transaction_date <  ${endDate}::date
                 AND confirmed_at IS NOT NULL
                 AND deleted_at IS NULL
               GROUP BY category_id
            ),
            limits AS (
              SELECT cl.category_id,
                     CASE WHEN ${useCushion}::boolean
                          THEN cl.cushion_amount
                          ELSE cl.normal_amount
                     END AS active_budget_cents
                FROM budgeting.category_limits cl
               WHERE cl.tenant_id = ${budgetId}::uuid
                 AND cl.effective_from <= ${startDate}::date
                 AND (cl.effective_to IS NULL OR cl.effective_to > ${startDate}::date)
            )
            SELECT s.category_id,
                   c.name AS category_name,
                   GREATEST(0::bigint, s.spent_cents - COALESCE(l.active_budget_cents, 0::bigint))::text AS over_amount_cents
              FROM spent s
              LEFT JOIN limits l ON l.category_id = s.category_id
              JOIN budgeting.categories c
                ON c.id = s.category_id
               AND c.tenant_id = ${budgetId}::uuid
             WHERE GREATEST(0::bigint, s.spent_cents - COALESCE(l.active_budget_cents, 0::bigint)) > 0
             ORDER BY (s.spent_cents - COALESCE(l.active_budget_cents, 0::bigint)) DESC
             LIMIT ${limit}
          `);
          return res.rows.map((row) => ({
            category_id: row.category_id as string,
            category_name: row.category_name as string,
            over_amount_cents: BigInt(row.over_amount_cents as string),
          }));
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },
  };
}
