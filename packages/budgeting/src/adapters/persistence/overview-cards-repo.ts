/**
 * overview-cards-repo.ts — Drizzle adapter for the Overview cards wallet read (11-03).
 *
 * Implements OverviewWalletReader.listWalletsWithType — the same wallet read as
 * budget-home-summary-repo.listWalletsForBudget, plus the wallet_type column so
 * get-overview-cards can partition Σ SPENDINGS / Σ RESERVE / Σ ALL.
 *
 * Opens its own withTenantTx scoped to budgetId (v1.1: budget_id === tenant_id)
 * so RLS GUC app.tenant_ids is set before the SELECT. current_balance numeric(19,4)
 * → integer cents via (current_balance * 100)::bigint at the boundary.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type {
  OverviewWalletReader,
  WalletWithType,
} from "../../application/compute-budget-wealth-now";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type DrizzleTx = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

export function createOverviewCardsRepo(): OverviewWalletReader {
  return {
    async listWalletsWithType(budgetId): Promise<WalletWithType[]> {
      const r = await withTenantTx(
        TenantId(budgetId),
        UserId(SYSTEM_USER_ID),
        async (tx) => {
          const drizzleTx = tx as DrizzleTx;
          const res = await drizzleTx.execute(sql`
            SELECT (current_balance * 100)::bigint::text AS amount_cents,
                   currency,
                   wallet_type
              FROM budgeting.wallets
             WHERE tenant_id = ${budgetId}::uuid
               AND archived_at IS NULL
          `);
          return res.rows.map((row) => ({
            amount_cents: BigInt(row.amount_cents as string),
            currency: row.currency as string,
            wallet_type: row.wallet_type as WalletWithType["wallet_type"],
          }));
        },
      );
      if (r.isErr()) throw r.error;
      return r.value;
    },
  };
}
