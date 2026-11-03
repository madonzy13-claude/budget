/**
 * reserves-summary-repo.ts — Port for reading total reserve wallet amounts.
 * Plan 05-02, D-PH5-R11.
 */

export interface ReservesSummaryRepo {
  /**
   * Phase 14 (D-14): balances (cents) of non-archived RESERVE wallets per wallet
   * currency — never summed across currencies. `currencies` lists every
   * currency that HAS a RESERVE wallet, even one at 0.
   */
  reserveWalletsByCurrency(
    tenantId: string,
  ): Promise<{ byCurrency: Map<string, bigint>; currencies: Set<string> }>;
}
