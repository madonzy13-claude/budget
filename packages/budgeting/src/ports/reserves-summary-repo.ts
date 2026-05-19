/**
 * reserves-summary-repo.ts — Port for reading total reserve wallet amounts.
 * Plan 05-02, D-PH5-R11.
 */

export interface ReservesSummaryRepo {
  /**
   * Sum of `current_balance` (in cents, as bigint) across non-archived RESERVE-type
   * wallets for the tenant. All RESERVE wallets are guaranteed in budget currency per
   * Plan 03 invariant.
   * Returns 0n when no rows match.
   */
  sumReserveWalletAmounts(tenantId: string): Promise<bigint>;
}
