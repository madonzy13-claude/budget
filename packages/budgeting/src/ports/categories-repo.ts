/**
 * categories-repo.ts — Port interface for Categories persistence.
 * Domain layer: no Drizzle imports.
 *
 * Plan 05-02 adds setReserveExcluded (D-PH5-R10).
 * Plan 05-03 adds findById + list for use-case guard lookups.
 */

/** Lightweight row shape returned by findById/list — avoids importing Category domain class. */
export interface CategoryRow {
  id: string;
  name: string;
  reserveExcluded: boolean;
  archivedAt: Date | null;
}

export interface CategoriesRepo {
  /**
   * Toggle the reserve_excluded flag on a category.
   * Writes an audit row (before/after reserveExcluded) + outbox event.
   * Throws if categoryId not found for tenant.
   */
  setReserveExcluded(
    tenantId: string,
    categoryId: string,
    excluded: boolean,
    actorUserId: string,
  ): Promise<void>;

  /**
   * Find a category by id for the given tenant.
   * Returns null when not found (RLS filters cross-tenant rows → null).
   * Used for guard checks in use cases.
   */
  findById(tenantId: string, categoryId: string): Promise<CategoryRow | null>;

  /**
   * List all non-archived categories for the given tenant.
   * Used by getReservesSummary to partition into Active / Excluded.
   */
  list(tenantId: string): Promise<CategoryRow[]>;
}
