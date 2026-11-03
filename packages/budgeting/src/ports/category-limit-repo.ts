/**
 * category-limit-repo.ts — CategoryLimitRepo port (SCD-2)
 * Implemented by DrizzleCategoryLimitRepo.
 */

export interface SetLimitInput {
  tenantId: string;
  categoryId: string;
  normalAmount: string; // cents as string (bigint-safe)
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  // 0061: the needs/wants split of normalAmount (= needs + wants). Optional —
  // omitted → columns left NULL (legacy: needs = normal, wants = 0).
  needsAmount?: string;
  wantsAmount?: string;
  // 0083: unbounded — cannot be overspent, accrues nothing. Amounts are written
  // as 0 and unused while true. Optional; absent means a normal limited row.
  noLimit?: boolean;
  effectiveFrom: string; // YYYY-MM-DD
  actorUserId: string;
}

export interface CategoryLimitRow {
  id: string;
  tenantId: string;
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  needsAmount: string | null;
  wantsAmount: string | null;
  noLimit: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  actorUserId: string;
  createdAt: Date;
}

export interface SetLimitForMonthInput {
  tenantId: string;
  categoryId: string;
  monthStart: string; // YYYY-MM-01
  normalAmount: string; // cents as string
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  needsAmount?: string;
  wantsAmount?: string;
  noLimit?: boolean;
  actorUserId: string;
  /**
   * true  → carry forward from this month (current/latest-month edit): the value
   *         applies to this month and every later month until the next change.
   * false → bound the change to JUST this month (past-month edit): split the
   *         covering SCD-2 segment so earlier and later months keep their values.
   */
  carryForward: boolean;
}

/**
 * A category's limit in force for one month. Amounts are in the limit row's own
 * currency (Phase 14, D-08): needs/wants/planned in normalCurrency, cushion in
 * cushionCurrency — converting to the budget currency is the reader's job.
 */
export interface EffectiveLimit {
  planned: bigint;
  cushion: bigint;
  needs: bigint | null;
  wants: bigint | null;
  noLimit: boolean;
  /** Always set by the Drizzle repo; absent (in-memory fakes) = the budget currency. */
  normalCurrency?: string;
  cushionCurrency?: string;
}

export interface CategoryLimitRepo {
  setLimit(input: SetLimitInput): Promise<void>;
  /**
   * Set a category's limit for a specific month. Past-month edits (carryForward
   * = false) change ONLY that month via an SCD-2 split; current-month edits
   * (carryForward = true) behave like setLimit (apply from this month onward).
   */
  setLimitForMonth(input: SetLimitForMonthInput): Promise<void>;
  getEffectiveLimit(
    tenantId: string,
    categoryId: string,
    reportDate: string,
  ): Promise<CategoryLimitRow | null>;
  listForCategory(
    tenantId: string,
    categoryId: string,
  ): Promise<CategoryLimitRow[]>;
  /**
   * Returns effective planned + cushion amounts for all categories in a budget
   * for a given month start date (SCD-2 predicate).
   * Keys: categoryId → EffectiveLimit, amounts in cents of the limit's own currency.
   */
  effectiveForMonth(
    tenantId: string,
    budgetId: string,
    monthStart: string, // YYYY-MM-DD
  ): Promise<
    // EffectiveLimit.noLimit (0083): unbounded this month — planned/cushion are 0 and meaningless.
    Map<string, EffectiveLimit>
  >;

  /**
   * The same SCD-2 lookup, for MANY months in one round trip.
   *
   * The reserve replay needs the effective limits for every month the budget
   * has history in — 35 of them on a three-year budget. Asking per month cost
   * 35 queries AND 35 transactions, and each transaction carries two SET LOCAL
   * statements for the RLS GUCs. On the all-budgets aggregate that came to 424
   * limit lookups and ~500 GUC statements for a single request, roughly a
   * second of pure round-trip: the statements themselves are ~0.1ms, the
   * per-call overhead is ~1.9ms.
   *
   * Keys: `YYYY-MM-DD` month start → the same map effectiveForMonth returns.
   * Months with no matching row still get an (empty) entry, so callers can
   * treat a miss and an empty month identically.
   */
  effectiveForMonths(
    tenantId: string,
    budgetId: string,
    monthStarts: string[], // YYYY-MM-DD each
  ): Promise<
    Map<
      string,
      Map<
        string,
        EffectiveLimit
      >
    >
  >;
}
