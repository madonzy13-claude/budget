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
  effectiveFrom: string;
  effectiveTo: string | null;
  actorUserId: string;
  createdAt: Date;
}

export interface CategoryLimitRepo {
  setLimit(input: SetLimitInput): Promise<void>;
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
  ): Promise<Map<string, { planned: bigint; cushion: bigint }>>;
}
