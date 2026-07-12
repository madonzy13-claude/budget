/**
 * categories-repo.ts — Port interface for Categories persistence.
 * Domain layer: no Drizzle imports.
 *
 * Plan 05-02 adds setReserveExcluded (D-PH5-R10).
 * Plan 05-03 adds findById + list for use-case guard lookups.
 * Plan 05-13: dropped the bulk reserve-actual writer + the stored-actual field
 *   — reserve is engine-derived now (replay-on-read), no stored per-category
 *   actual (migration 0030 dropped the stored-actual column).
 */

/** Lightweight row shape returned by findById/list — avoids importing Category domain class. */
export interface CategoryRow {
  id: string;
  name: string;
  reserveExcluded: boolean;
  archivedAt: Date | null;
  /** Present on list(); 0 when never touched. Drives drag-reorder ordering. */
  sortIndex?: number;
  /** 260613-v1p: per-category color key (null = no color → no reserves-row bar). */
  colorKey: string | null;
  /** r33: THE Investments category — excluded entirely from the reserves tab. */
  isInvestment?: boolean;
  /** Persisted cushion configuration (mig 0059); null = inferred. */
  cushionMode?: string | null;
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
   * Returns sortIndex on each row.
   */
  list(tenantId: string): Promise<CategoryRow[]>;
}
