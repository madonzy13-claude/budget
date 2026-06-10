/**
 * spending-projection-repo.ts — Port interface for spending_by_category_month projection.
 * ENGR-14: upserted synchronously inside the same withTenantTx as the ledger INSERT.
 */

export interface SpendingProjectionUpsertInput {
  tenantId: string;
  workspaceId: string;
  categoryId: string;
  monthStartDate: string; // ISO 'YYYY-MM-DD'
  deltaNormal: string; // decimal string — added to existing normal_amount
  deltaCushion: string; // decimal string — added to existing cushion_amount
  currency: string; // ISO 3-char currency code
}

export interface SpendingProjectionRepo {
  /**
   * Upsert: ON CONFLICT adds deltas to existing amounts.
   * Runs inside caller's tx (no own transaction opened).
   */
  upsert(tx: unknown, input: SpendingProjectionUpsertInput): Promise<void>;
}
