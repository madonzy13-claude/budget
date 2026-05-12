/**
 * reserve-balance-repo.ts — Port interface for ReserveBalanceRepo.
 * No Drizzle imports — hex boundary enforced by dep-cruiser (ENGR-02).
 * RSCM-01 + RSCM-02: auto-computed reserve balances from category_reserve_balance VIEW.
 */
import type { Money } from "@budget/shared-kernel";

export interface ReserveBalanceRepo {
  /**
   * Returns a Map keyed by categoryId → Money.
   * Categories with no limit history are absent from the map (balance implies 0 in budget currency).
   * The asOf parameter is reserved for time-travel queries; current implementation queries the VIEW
   * which always returns the cumulative balance through the current month.
   */
  getForBudget(
    budgetId: string,
    tenantId: string,
    asOf: Date,
  ): Promise<Map<string, Money>>;

  /**
   * Returns Money(0, budgetCurrency) when category has no limit history.
   * The asOf parameter is reserved for time-travel queries.
   */
  getForCategory(
    budgetId: string,
    categoryId: string,
    tenantId: string,
    asOf: Date,
  ): Promise<Money>;
}
