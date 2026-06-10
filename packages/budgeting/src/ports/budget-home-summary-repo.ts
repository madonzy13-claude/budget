/**
 * budget-home-summary-repo.ts — Port for HOME-02 read-model.
 *
 * Type-only — ZERO persistence-library imports (ENGR-02 hex boundary). The
 * adapter lives at packages/budgeting/src/adapters/persistence/.
 *
 * Per the v1.1 schema invariant (`budget_id === tenant_id`), every method
 * takes ONLY `budgetId`: the adapter feeds that UUID as BOTH the tenant
 * context AND the WHERE filter.
 */

export type BudgetKind = "PRIVATE" | "SHARED";

export interface BudgetHomeSummaryMeta {
  name: string;
  kind: BudgetKind;
  default_currency: string;
  cushion_mode_enabled: boolean;
}

export interface BudgetWalletRow {
  /** Adapter pre-converts numeric(19,4) current_balance to bigint cents. */
  amount_cents: bigint;
  currency: string;
}

export interface TopOverspentRow {
  category_id: string;
  category_name: string;
  /** Always positive (adapter applies GREATEST(0, …)). */
  over_amount_cents: bigint;
}

export interface BudgetHomeSummaryRepo {
  /**
   * Returns the budget metadata or null if no row matches.
   * tenancy.budgets has NO tenant_id column and NO deleted_at; the budget's id
   * IS the tenant.
   */
  getBudgetMeta(budgetId: string): Promise<BudgetHomeSummaryMeta | null>;

  /**
   * Sum of amount_converted_cents over confirmed SPENDING rows in the given
   * [monthStart, monthEnd) range, scoped to the budget. Returns 0n when no rows.
   */
  sumCurrentMonthSpend(
    budgetId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<bigint>;

  /**
   * Active (archived_at IS NULL) wallets for the budget, with current_balance
   * pre-converted to bigint cents at the adapter boundary.
   */
  listWalletsForBudget(budgetId: string): Promise<BudgetWalletRow[]>;

  /**
   * Categories whose month-to-date spend exceeds their active limit
   * (cushion_amount when useCushion, else normal_amount). Returns AT MOST
   * `limit` rows, sorted DESC by over_amount_cents. Returns [] when none.
   */
  topOverspentCategories(
    budgetId: string,
    monthStart: Date,
    monthEnd: Date,
    useCushion: boolean,
    limit: number,
  ): Promise<TopOverspentRow[]>;
}
