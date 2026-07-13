/**
 * wealth-snapshot-repo.ts — Drizzle adapter for the Overview Wealth series (11-06).
 *
 * Reads budgeting.budget_wealth_snapshots rows for a budget in a date range,
 * ordered by captured_at (uses budget_wealth_snapshots_series_idx). Opens its own
 * withTenantTx scoped to budgetId (v1.1: budget_id === tenant_id) so the RLS GUC
 * app.tenant_ids is set. Returns raw aggregate cents (bigint) — bucket aggregation
 * + the live point live in the service.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { WealthSnapshotRow } from "../../application/get-overview-wealth";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export interface WealthSnapshotRepo {
  seriesForRange(
    budgetId: string,
    from: string,
    to: string,
  ): Promise<WealthSnapshotRow[]>;
  /** The most recent snapshot STRICTLY BEFORE `from` — the "opening value" the
   *  chart carries forward across the leading gap so a range that starts before
   *  the first in-range tick shows last month's value, not 0 (round 24 item 2). */
  openingBefore(
    budgetId: string,
    from: string,
  ): Promise<WealthSnapshotRow | null>;
}

export function createWealthSnapshotRepo(): WealthSnapshotRepo {
  return {
    async seriesForRange(budgetId, from, to): Promise<WealthSnapshotRow[]> {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const res = await (tx as DrizzleTx).execute(sql`
            SELECT captured_at,
                   capitalization_cents::text AS capitalization_cents,
                   investment_value_cents::text AS investment_value_cents,
                   investment_cost_basis_cents::text AS investment_cost_basis_cents
              FROM budgeting.budget_wealth_snapshots
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${budgetId}::uuid
               AND captured_at >= ${from}::date
               AND captured_at < (${to}::date + interval '1 day')
             ORDER BY captured_at
          `);
          return res.rows.map((row) => ({
            captured_at: new Date(row.captured_at as string),
            capitalization_cents: BigInt(row.capitalization_cents as string),
            investment_value_cents: BigInt(
              row.investment_value_cents as string,
            ),
            investment_cost_basis_cents:
              row.investment_cost_basis_cents == null
                ? null
                : BigInt(row.investment_cost_basis_cents as string),
          }));
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },

    async openingBefore(budgetId, from): Promise<WealthSnapshotRow | null> {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const res = await (tx as DrizzleTx).execute(sql`
            SELECT captured_at,
                   capitalization_cents::text AS capitalization_cents,
                   investment_value_cents::text AS investment_value_cents,
                   investment_cost_basis_cents::text AS investment_cost_basis_cents
              FROM budgeting.budget_wealth_snapshots
             WHERE budget_id = ${budgetId}::uuid
               AND tenant_id = ${budgetId}::uuid
               AND captured_at < ${from}::date
             ORDER BY captured_at DESC
             LIMIT 1
          `);
          const row = res.rows[0];
          if (!row) return null;
          return {
            captured_at: new Date(row.captured_at as string),
            capitalization_cents: BigInt(row.capitalization_cents as string),
            investment_value_cents: BigInt(
              row.investment_value_cents as string,
            ),
            investment_cost_basis_cents:
              row.investment_cost_basis_cents == null
                ? null
                : BigInt(row.investment_cost_basis_cents as string),
          } satisfies WealthSnapshotRow;
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },
  };
}
