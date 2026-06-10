/**
 * budget-share-link-repo.ts — Port for BudgetShareLink persistence (SHRD-01..05)
 *
 * No Drizzle imports — hexagonal boundary (PC-12, D-PH2-12).
 */

export interface BudgetShareLink {
  id: string;
  budgetId: string;
  tenantId: string;
  token: string;
  createdBy: string;
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface BudgetShareLinkRepo {
  /** Inserts under withTenantTx (RLS-scoped). */
  create(input: {
    budgetId: string;
    tenantId: string;
    createdBy: string;
    token: string;
    expiresAt: Date;
  }): Promise<BudgetShareLink>;
  /** Looks up by id WITHOUT tenant context. Uses withInfraTx (worker_role public resolve policy). */
  findById(id: string): Promise<BudgetShareLink | null>;
  /** Looks up by token WITHOUT tenant context (public resolve). Uses withInfraTx. */
  findByToken(token: string): Promise<BudgetShareLink | null>;
  /** Updates accepted_by + accepted_at under withTenantTx (uses link's own tenant_id + userId as actor). */
  accept(id: string, tenantId: string, acceptingUserId: string): Promise<void>;
  /** Updates revoked_at under withTenantTx (owner-only). */
  revoke(id: string, tenantId: string, userId: string): Promise<void>;
  /** Lists active links for owner UI (Phase 6). */
  listForBudget(budgetId: string, tenantId: string): Promise<BudgetShareLink[]>;
}
