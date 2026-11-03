/**
 * reserves-summary-repo.ts — Drizzle adapter for ReservesSummaryRepo.
 * Single SQL aggregate: current_balance of non-archived RESERVE wallets, summed
 * PER CURRENCY (Phase 14, D-14 — the old single SUM mixed currencies).
 * archived_at IS NULL predicate verbatim from Pitfall 7 (wallet-repo.ts:150).
 * Plan 05-02, D-PH5-R11.
 */
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { ReservesSummaryRepo } from "../../ports/reserves-summary-repo";

export class DrizzleReservesSummaryRepo implements ReservesSummaryRepo {
  async reserveWalletsByCurrency(tenantId: string) {
    const r = await withTenantTx(TenantId(tenantId), UserId(tenantId), async (tx) => {
      const result = await tx.execute<{ currency: string; total: string }>(
        // A negative balance is a credit card, not reserve money: it counts 0
        // but its currency still has a RESERVE wallet.
        sql`SELECT currency::text AS currency,
                   COALESCE(SUM((current_balance * 100)::bigint)
                              FILTER (WHERE current_balance >= 0), 0)::text AS total
            FROM budgeting.wallets
            WHERE tenant_id = ${tenantId}::uuid
              AND wallet_type = 'RESERVE'
              AND archived_at IS NULL
            GROUP BY currency`,
      );
      return ((result as any).rows ?? result) as { currency: string; total: string }[];
    });
    if (r.isErr()) throw r.error;
    const byCurrency = new Map<string, bigint>();
    for (const row of r.value) byCurrency.set(row.currency.trim(), BigInt(row.total));
    return { byCurrency, currencies: new Set(byCurrency.keys()) };
  }
}
