/**
 * category-reserve-adjustments-repo.ts — Port for append-only reserve adjustment ledger.
 * D-PH5-R8: table is append-only. No update/delete methods.
 * Plan 05-02.
 */

export interface CategoryReserveAdjustmentRow {
  id: string;
  tenantId: string;
  categoryId: string;
  deltaCents: bigint;
  note: string | null;
  createdBy: string | null;
  occurredAt: Date;
}

export interface CategoryReserveAdjustmentsRepo {
  /**
   * Append a new adjustment row. Returns the generated id and occurredAt timestamp.
   * Writes audit + outbox inside a single transaction (T-05-04, T-05-07).
   */
  create(input: {
    tenantId: string;
    categoryId: string;
    deltaCents: bigint;
    note?: string | null;
    actorUserId: string;
  }): Promise<{ id: string; occurredAt: Date }>;

  /**
   * Paginated read of adjustments for a category, newest-first.
   * Cross-tenant reads return empty array (RLS guard).
   */
  listForCategory(
    tenantId: string,
    categoryId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<CategoryReserveAdjustmentRow[]>;
}
