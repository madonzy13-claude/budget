/**
 * search-transactions.ts — Plan 02-09 search/filter use case.
 *
 * Cursor-paginated FTS + equality filters over the latest-only view of
 * budgeting.expense_ledger. Cursor tuple = (transaction_date, id). FTS uses
 * plainto_tsquery for safety against arbitrary user input (T-2-09-01).
 *
 * Latest-only derivation per D-05-a: rows whose id is referenced by another
 * row's corrects_id are excluded; the corrects_id chain head IS included.
 *
 * Returns {rows, nextCursor}. Cursor opaque to callers (we surface the last
 * (transaction_date, id) tuple of the page).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { sql, type SQL } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import type { TransactionRow } from "../ports/transaction-repo";

export type TransactionKind = "EXPENSE" | "INCOME" | "TRANSFER";

export interface SearchFilters {
  dateFrom?: string;
  dateTo?: string;
  categoryIds?: string[];
  accountIds?: string[];
  kind?: TransactionKind;
}

export interface SearchCursor {
  transactionDate: string;
  id: string;
}

export interface SearchTransactionsInput {
  tenantId: string;
  query?: string;
  filters: SearchFilters;
  cursor: SearchCursor | null;
  limit: number;
}

export interface SearchTransactionsResult {
  rows: TransactionRow[];
  nextCursor: SearchCursor | null;
}

function dbRowToTransactionRow(row: Record<string, unknown>): TransactionRow {
  const kind = row.kind as TransactionKind;
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    kind,
    amountOrig: String(row.amount_orig),
    currencyOrig: row.currency_orig as string,
    amountDefault: String(row.amount_default),
    currencyDefault: row.currency_default as string,
    fxRate: String(row.fx_rate),
    fxRateDate: row.fx_rate_date as string,
    fxProvider: row.fx_provider as string,
    transactionDate: row.transaction_date as string,
    note: (row.note as string | null) ?? null,
    accountId: row.account_id as string,
    categoryId: (row.category_id as string | null) ?? null,
    transferGroupId: (row.transfer_group_id as string | null) ?? null,
    correctsId: (row.corrects_id as string | null) ?? null,
    balanceDeltaSign: kind === "INCOME" ? 1 : -1,
  };
}

/**
 * Pure function: returns the search use case bound to its (zero) deps.
 * No deps because this hits the DB directly via withTenantTx (RLS enforced).
 */
export function searchTransactions() {
  return async (
    input: SearchTransactionsInput,
  ): Promise<Result<SearchTransactionsResult, Error>> => {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    const tenantId = input.tenantId;
    const tid = TenantId(tenantId);
    const uid = UserId(tenantId); // read-only path; reuse tenantId as user placeholder

    const r = await withTenantTx(tid, uid, async (tx) => {
      const drizzleTx = tx as {
        execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
      };

      const filters = input.filters ?? {};
      const query = input.query?.trim() ? input.query.trim() : null;

      // Build WHERE-clause SQL fragments dynamically.
      // Each fragment uses parameterized SQL via Drizzle's sql template tag — safe.
      const conds: SQL[] = [
        sql`e.tenant_id = ${tenantId}::uuid`,
        // Latest-only: exclude rows that have been corrected
        sql`e.id NOT IN (
              SELECT corrects_id FROM budgeting.expense_ledger
               WHERE tenant_id = ${tenantId}::uuid AND corrects_id IS NOT NULL
            )`,
      ];

      if (filters.dateFrom) {
        conds.push(sql`e.transaction_date >= ${filters.dateFrom}::date`);
      }
      if (filters.dateTo) {
        conds.push(sql`e.transaction_date <= ${filters.dateTo}::date`);
      }
      if (filters.categoryIds && filters.categoryIds.length > 0) {
        // Use jsonb_array → uuid[] coercion to avoid empty-list syntax errors
        conds.push(
          sql`e.category_id = ANY(SELECT (jsonb_array_elements_text(${JSON.stringify(filters.categoryIds)}::jsonb))::uuid)`,
        );
      }
      if (filters.accountIds && filters.accountIds.length > 0) {
        conds.push(
          sql`e.account_id = ANY(SELECT (jsonb_array_elements_text(${JSON.stringify(filters.accountIds)}::jsonb))::uuid)`,
        );
      }
      if (filters.kind) {
        conds.push(sql`e.kind = ${filters.kind}`);
      }
      if (query) {
        // plainto_tsquery handles arbitrary user input safely (T-2-09-01)
        conds.push(sql`e.note_tsv @@ plainto_tsquery('simple', ${query})`);
      }
      if (input.cursor) {
        conds.push(sql`(
          e.transaction_date < ${input.cursor.transactionDate}::date OR
          (e.transaction_date = ${input.cursor.transactionDate}::date AND e.id::text < ${input.cursor.id}::text)
        )`);
      }

      // Compose WHERE
      const whereClause = conds.reduce<SQL | undefined>((acc, c) => {
        return acc === undefined ? c : sql`${acc} AND ${c}`;
      }, undefined);

      const result = await drizzleTx.execute(
        sql`SELECT e.id, e.tenant_id, e.kind, e.amount_orig, e.currency_orig,
                   e.amount_default, e.currency_default, e.fx_rate,
                   e.fx_rate_date::text AS fx_rate_date,
                   e.fx_provider,
                   e.transaction_date::text AS transaction_date,
                   e.note, e.account_id, e.category_id,
                   e.transfer_group_id, e.corrects_id, e.created_at
              FROM budgeting.expense_ledger e
             WHERE ${whereClause}
             ORDER BY e.transaction_date DESC, e.id DESC
             LIMIT ${limit}`,
      );
      return result.rows;
    });

    if (r.isErr()) return err(r.error);
    const rows = r.value.map(dbRowToTransactionRow);
    const nextCursor: SearchCursor | null =
      rows.length === limit
        ? { transactionDate: rows[rows.length - 1].transactionDate, id: rows[rows.length - 1].id }
        : null;
    return ok({ rows, nextCursor });
  };
}
