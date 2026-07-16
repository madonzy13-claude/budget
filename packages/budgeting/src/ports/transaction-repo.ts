/**
 * transaction-repo.ts — Port interface for Transaction persistence v1.1.
 * Domain layer: no Drizzle imports.
 *
 * v1.1 (Phase 2): categorical-only transactions, FX-on-PATCH, confirmed_at draft flag.
 * Removed: insertCorrection, insertCorrectionInTx, getCorrectionChain (correction surface removed TXN-08).
 * Added: updateInPlace, confirm, softDelete, listForMonth.
 */

export interface TransactionRow {
  id: string;
  tenantId: string;
  budgetId: string;
  categoryId: string;
  date: string; // 'YYYY-MM-DD'
  amountOriginalCents: string; // bigint-as-string per CLAUDE.md "Money at adapter boundary"
  currencyOriginal: string; // CHAR(3) ISO
  amountConvertedCents: string;
  fxRate: string; // decimal string
  fxAsOf: string; // 'YYYY-MM-DD'
  note: string | null;
  recurringRuleId: string | null;
  confirmedAt: Date | null; // NULL = draft per D-PH2-08
  kind: "SPENDING" | "INCOME";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TransactionRepo {
  create(row: TransactionRow, userId: string, tenantId: string): Promise<void>;

  findById(tenantId: string, id: string): Promise<TransactionRow | null>;

  /**
   * In-place UPDATE of editable fields (PATCH /transactions/:id).
   * Caller is responsible for FX re-computation before calling this method.
   * Emits budgeting.transaction.updated outbox event inside the same tx.
   */
  updateInPlace(
    id: string,
    fields: Partial<
      Pick<
        TransactionRow,
        | "date"
        | "categoryId"
        | "amountOriginalCents"
        | "currencyOriginal"
        | "amountConvertedCents"
        | "fxRate"
        | "fxAsOf"
        | "note"
        | "kind"
        | "recurringRuleId"
        | "confirmedAt"
      >
    >,
    userId: string,
    tenantId: string,
  ): Promise<void>;

  /** Flip confirmed_at from NULL to now() (draft → confirmed). */
  confirm(id: string, userId: string, tenantId: string): Promise<void>;

  /** Soft-delete: set deleted_at = now(). */
  softDelete(id: string, userId: string, tenantId: string): Promise<void>;

  /**
   * List transactions for a given budget + calendar month.
   * @param confirmed 'any' = all, true = confirmed only, false = drafts only
   */
  listForMonth(
    tenantId: string,
    budgetId: string,
    month: string, // 'YYYY-MM'
    confirmed: boolean | "any",
  ): Promise<TransactionRow[]>;

  /**
   * r40: newest created_at over confirmed, NON-deleted spendings — powers the
   * "last spending added" footer. created_at never changes on edit, and a
   * soft-deleted newest row falls back to the previous one. ISO string or
   * null for a budget with no confirmed spendings.
   */
  latestSpendingCreatedAt(
    tenantId: string,
    budgetId: string,
  ): Promise<string | null>;

  /**
   * Returns confirmed SPENDING totals per category for a given month range.
   * Keys: categoryId → bigint cents (amount_converted_cents sum).
   * Categories with no spend are absent from the map (treat as 0n at call site).
   */
  spendByCategoryForMonth(
    tenantId: string,
    budgetId: string,
    monthStart: string, // YYYY-MM-01
    monthEnd: string, // YYYY-MM-01 of next month (exclusive upper bound)
  ): Promise<Map<string, bigint>>;

  /**
   * Confirmed SPENDING totals grouped by category AND calendar month, for every
   * month strictly before `beforeMonthEnd`. Powers the cumulative reserve pool:
   * overspend in ANY month draws the reserve, so editing a past month must
   * re-derive it. Returns categoryId → (month 'YYYY-MM' → cents). Absent = 0n.
   */
  spendByCategoryByMonth(
    tenantId: string,
    budgetId: string,
    beforeMonthEnd: string, // YYYY-MM-01 exclusive upper bound (covers the open month)
  ): Promise<Map<string, Map<string, bigint>>>;
}
