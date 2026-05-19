/**
 * reserves-summary-repo.ts — Drizzle adapter for ReservesSummaryRepo.
 * Single SQL aggregate: SUM of current_balance for non-archived RESERVE wallets.
 * archived_at IS NULL predicate verbatim from Pitfall 7 (wallet-repo.ts:150).
 * Plan 05-02, D-PH5-R11.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { ReservesSummaryRepo } from "../../ports/reserves-summary-repo";

export class DrizzleReservesSummaryRepo implements ReservesSummaryRepo {
  async sumReserveWalletAmounts(tenantId: string): Promise<bigint> {
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // placeholder for read-only op

    const r = await withTenantTx(tid, uid, async (tx) => {
      const result = await tx.execute<{ total: string }>(
        sql`SELECT COALESCE(SUM((current_balance * 100)::bigint), 0)::text AS total
            FROM budgeting.wallets
            WHERE tenant_id = ${tenantId}::uuid
              AND wallet_type = 'RESERVE'
              AND archived_at IS NULL`,
      );
      const rows = (result as any).rows ?? result;
      return BigInt(rows[0]?.total ?? "0");
    });

    if (r.isErr()) throw r.error;
    return r.value;
  }
}
