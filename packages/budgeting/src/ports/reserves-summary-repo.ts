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

  /**
   * UAT-PH5-T3-53: Last adjustment timestamp per category, used to order
   * sticky-allocation walks. Categories adjusted most recently are walked
   * LAST so the deficit when wallet pool < Σ balances falls on the row
   * the user just modified — not on previously-allocated rows.
   *
   * Returns Map<categoryId, Date>. Missing entries mean "never adjusted"
   * and should sort first (treated as -Infinity).
   */
  getLastAdjustedAtPerCategory(tenantId: string): Promise<Map<string, Date>>;
}
