/**
 * reserve-event-loader-repo.ts — Port for the replay-on-read reserve event loader.
 *
 * Phase 05 reserve rewrite (decision A/B): the reserve-engine (domain) folds an
 * ordered event stream on read. This port returns the RAW, ordered inputs the
 * orchestrator (05-12) maps into ReserveEngineEvent[] — it does NOT return a
 * precomputed balance (the old category_reserve_balance VIEW is gone).
 *
 * Pure interface: NO Drizzle / @budget/platform imports (hex boundary,
 * enforced by dependency-cruiser). The Drizzle adapter lives in
 * adapters/persistence/reserve-event-loader-repo.ts.
 *
 * Amounts are integer cents (bigint). Months are 'YYYY-MM'.
 */

export interface ReserveEventInputs {
  /**
   * categoryId → (month 'YYYY-MM' → spent cents). Confirmed SPENDING net of
   * INCOME, for every month ≤ the open month. Absent month/category = 0n.
   */
  spendByCategoryByMonth: Map<string, Map<string, bigint>>;
  /**
   * month 'YYYY-MM' → (categoryId → { plannedCents, cushionCents }). SCD-2
   * effective limit for that month (resolved per month).
   */
  limitsByMonth: Map<
    string,
    Map<string, { plannedCents: bigint; cushionCents: bigint }>
  >;
  /**
   * Ordered cushion-mode segments ascending by month:
   * [{ fromMonth 'YYYY-MM', on: boolean }].
   */
  cushionHistory: Array<{ fromMonth: string; on: boolean }>;
  /**
   * categoryId → ordered signed adjustment deltas (by occurred_at asc).
   */
  adjustmentsByCategory: Map<string, bigint[]>;
  /**
   * Per-category flags for internal/active filtering (the engine/orchestrator
   * decides archived/excluded handling per decision J — the loader does NOT
   * filter here).
   */
  categoryFlags: Map<
    string,
    {
      reserveExcluded: boolean;
      archivedAt: string | null;
      archivedFrom: string | null;
      sortIndex: number;
      name: string;
    }
  >;
  /** Σ RESERVE-wallet balances (userDefined input only). cents. */
  userDefinedCents: bigint;
  /** budgets.reserves_enabled. */
  reservesEnabled: boolean;
  /** Resolved open month 'YYYY-MM' (TZ-correct accrual boundary). */
  openMonth: string;
  /** Budget default currency (ISO 4217). */
  budgetCurrency: string;
}

export interface ReserveEventLoaderRepo {
  /**
   * Load the ordered raw reserve events for one budget.
   * @param openMonthOverride optional 'YYYY-MM'; defaults to now() in the
   *   budget timezone.
   */
  load(
    tenantId: string,
    budgetId: string,
    openMonthOverride?: string,
  ): Promise<ReserveEventInputs>;
}
