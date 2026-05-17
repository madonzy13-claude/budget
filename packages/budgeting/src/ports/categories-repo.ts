/**
 * categories-repo.ts — Port interface for Categories persistence.
 * Domain layer: no Drizzle imports.
 *
 * Plan 05-02 adds setReserveExcluded (D-PH5-R10).
 * Future plans may extend this interface with create/list/rename.
 */

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
}
