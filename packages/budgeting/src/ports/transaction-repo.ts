/**
 * transaction-repo.ts — Port interface for Transaction persistence.
 * Domain layer: no Drizzle imports.
 *
 * CROSS-PLAN CONTRACT (plan 02-08):
 * Both create() and createInTx() must produce identical side effects:
 *   ledger INSERT + accounts.current_balance delta + spending_by_category_month upsert + writeOutbox.
 * create() opens its own withTenantTx; createInTx() joins the caller's existing tx.
 * Plan 02-08 confirm-recurring-draft calls createInTx() so the ledger INSERT and
 * draft UPDATE share a single withTenantTx (Pitfall 7 / EXPN-11).
 */

export interface TransactionRow {
  id: string;
  tenantId: string;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  amountOrig: string;
  currencyOrig: string;
  amountDefault: string;
  currencyDefault: string;
  fxRate: string;
  fxRateDate: string;
  fxProvider: string;
  transactionDate: string;
  note: string | null;
  accountId: string;
  categoryId: string | null;
  transferGroupId: string | null;
  correctsId: string | null;
  /** Balance delta sign: +1 for INCOME credit, -1 for EXPENSE/TRANSFER debit */
  balanceDeltaSign: 1 | -1;
}

export interface TransactionRepo {
  /**
   * Opens its own withTenantTx and atomically writes:
   * - ledger INSERT(s)
   * - accounts.current_balance delta
   * - spending_by_category_month upsert (EXPENSE/INCOME only)
   * - writeOutbox budgeting.transaction.created
   * Used by createTransaction use case (manual capture).
   */
  create(
    rows: TransactionRow[],
    userId: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Accepts the caller's existing tx and performs the same side effects as create().
   * Used by plan 02-08 confirm-recurring-draft so ledger INSERT + draft UPDATE
   * share one withTenantTx (single source of truth, no diverged effects).
   */
  createInTx(
    tx: unknown,
    rows: TransactionRow[],
    userId: string,
    tenantId: string,
  ): Promise<void>;

  /** Latest-only view: excludes rows that have been corrected (corrected_by_id derivation) */
  listLatest(
    tenantId: string,
    opts: { limit: number; before?: { transactionDate: string; id: string } },
  ): Promise<import("../domain/transaction").Transaction[]>;

  /**
   * Returns the row with the given id (RLS-scoped by tenant).
   * Returns null if not found or not in tenant's scope.
   * Plan 02-07: used by editTransaction use case to load original.
   */
  findById(tenantId: string, id: string): Promise<TransactionRow | null>;

  /**
   * Inserts a correction row atomically:
   * - SELECT FOR UPDATE on original (serializes concurrent edits → AlreadyCorrected if race)
   * - INSERT new row with corrects_id = originalId
   * - Reverse + re-apply accounts.current_balance delta (newAmountDefault - oldAmountDefault)
   * - Reverse + re-apply spending_by_category_month upsert
   * - writeAudit (actor + before/after diff)
   * - writeOutbox budgeting.transaction.corrected
   * Plan 02-07, D-01-a/b, EXPN-06.
   */
  insertCorrection(
    originalId: string,
    newFields: Partial<TransactionRow>,
    userId: string,
    tenantId: string,
    diff: Record<string, { before: unknown; after: unknown }>,
  ): Promise<{ ledgerId: string }>;

  /**
   * Returns the full correction chain for a given row id.
   * Walks backwards from the given id to the original, then includes all corrections forward.
   * Ordered by created_at ASC (original first, latest correction last).
   * Plan 02-07, D-01-a.
   */
  getCorrectionChain(tenantId: string, anchorId: string): Promise<TransactionRow[]>;
}
