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
  /** Phase 14 (D-02): re-expressed at read time in the budget's CURRENT currency at this row's date. */
  amountConvertedCents: string;
  /** Currency of amountConvertedCents (the budget's current one; the original's when no FX pair exists). */
  currencyConverted?: string;
  /** No FX history for this row's pair — amountConvertedCents is the original amount. */
  fxUnavailable?: boolean;
  fxRate: string; // decimal string
  fxAsOf: string; // 'YYYY-MM-DD'
  note: string | null;
  scheduledPaymentId: string | null;
  confirmedAt: Date | null; // NULL = draft per D-PH2-08
  kind: "SPENDING" | "INCOME";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TransactionRepo {
  create(row: TransactionRow, userId: string, tenantId: string): Promise<void>;

  findById(tenantId: string, id: string): Promise<TransactionRow | null>;

  /** Phase 14: confirmed spending per category in EACH CATEGORY's own currency,
   *  every row at its own date — what a foreign category's column reads in. */
  spendByCategoryForMonthInCategoryCurrency?(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<Map<string, bigint>>;

  /** Phase 14 (D-05): a category's own currency (null when not in the tenant). */
  categoryCurrency?(tenantId: string, categoryId: string, date?: string): Promise<string | null>;

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
        | "scheduledPaymentId"
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
   * Undo a soft-delete (15-15, MCP undo). Throws TransactionNotFoundError for
   * an unknown id, Error("not_deleted") for a row that is not deleted.
   */
  restore(id: string, userId: string, tenantId: string): Promise<void>;

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
   * 15-03: full-history search, newest first (transaction_date DESC, id DESC),
   * keyset-paged on (date, id). Returns up to `limit` + 1 rows so the caller
   * can tell whether another page exists.
   */
  searchPage(
    tenantId: string,
    budgetId: string,
    f: {
      from?: string;
      to?: string;
      categoryId?: string;
      kind?: "SPENDING" | "INCOME";
      q?: string;
    },
    cursor: { date: string; id: string } | null,
    limit: number,
  ): Promise<TransactionRow[]>;

  /**
   * r40: newest created_at over confirmed, NON-deleted spendings WHOSE
   * transaction_date falls in [monthStart, monthEnd) — powers the per-month
   * "last spending added" footer (viewing May keeps May's date even after a
   * June spending is added). created_at never changes on edit, and a
   * soft-deleted newest row falls back to the previous one. ISO string or
   * null when the viewed month has no confirmed spendings.
   */
  latestSpendingCreatedAt(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<string | null>;

  /**
   * Returns confirmed SPENDING totals per category for a given month range.
   * Keys: categoryId → bigint cents (sum in the budget's current currency, each row at its own date).
   * Categories with no spend are absent from the map (treat as 0n at call site).
   */
  /** R6 (user): confirmed spending per day (budget currency) in the range. */
  spendByDayForMonth?(
    tenantId: string,
    budgetId: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<{ date: string; cents: bigint }[]>;

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
