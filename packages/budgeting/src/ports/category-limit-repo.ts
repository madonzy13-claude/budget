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
  actorUserId: string;
  /**
   * true  → carry forward from this month (current/latest-month edit): the value
   *         applies to this month and every later month until the next change.
   * false → bound the change to JUST this month (past-month edit): split the
   *         covering SCD-2 segment so earlier and later months keep their values.
   */
  carryForward: boolean;
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
   * Keys: categoryId → { planned: bigint, cushion: bigint } in cents.
   */
  effectiveForMonth(
    tenantId: string,
    budgetId: string,
    monthStart: string, // YYYY-MM-DD
  ): Promise<
    Map<
      string,
      {
        planned: bigint;
        cushion: bigint;
        needs: bigint | null;
        wants: bigint | null;
      }
    >
  >;
}
