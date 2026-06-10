/**
 * spendings-summary-repo.ts — Drizzle adapter for SpendingsSummaryRepo port.
 *
 * Reads budget metadata (currency, cushion_mode_enabled, timezone) from tenancy.budgets.
 * COALESCE(timezone, 'UTC') is defensive — the column has a NOT NULL DEFAULT 'UTC'
 * but this guard ensures correctness for any legacy rows that predate the column.
 *
 * D-PH4-Q5: budgetTz at top level resolves the RSC timezone correctness gap in Plan 04-04.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { SpendingsSummaryRepo } from "../../ports/spendings-summary-repo";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export function createSpendingsSummaryRepo(): SpendingsSummaryRepo {
  return {
    async getBudgetMeta(tenantId, budgetId) {
      // tenancy.budgets: id IS the tenant; no tenant_id column on this table
      const r = await withTenantTx(
        TenantId(tenantId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            SELECT cushion_mode_enabled,
                   default_currency AS currency,
                   COALESCE(timezone, 'UTC') AS timezone
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
        cushionModeEnabled: Boolean(row.cushion_mode_enabled),
        currency: row.currency as string,
        timezone: row.timezone as string,
      };
    },
  };
}
