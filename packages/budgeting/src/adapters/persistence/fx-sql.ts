/**
 * fx-sql.ts — SQL fragments for Phase 14 read-time currency conversion.
 *
 * Every query that sums money from rows in mixed currencies converts EACH row
 * at its own date through budgeting.fx_convert (migration 0104) — one rounding
 * rule (half away from zero), one fallback (most recent prior rate), NULL for a
 * pair with no history. Callers wrap sums in COALESCE so a NULL row is skipped,
 * never booked at par.
 *
 * D-08 limit rate date: a limit in a currency other than the target converts
 * at LEAST(month_end, today) — the current month at the latest rate, a past
 * month at the last rate within it (frozen), a future month at today's rate.
 * `today` is ALWAYS a bound value from serverNow() in the budget timezone,
 * never the database clock — the gated test clock lives in serverNow().
 */
import { sql, type SQL } from "drizzle-orm";

/** budgeting.fx_convert(cents, src, dst, onDate) → bigint cents (NULL: no pair). */
export const fxConvert = (
  cents: SQL | string,
  src: SQL | string,
  dst: SQL | string,
  onDate: SQL | string,
): SQL =>
  sql`budgeting.fx_convert((${cents})::bigint, (${src})::text, (${dst})::text, (${onDate})::date)`;

/** D-08: the date a month's limit converts at. `today` is an ISO date string or a budgetToday() fragment. */
export const limitRateDate = (monthEnd: SQL | string, today: SQL | string): SQL =>
  sql`LEAST((${monthEnd})::date, ${today}::date)`;

/** The budget's CURRENT currency — the target every read re-expresses into. */
export const budgetCurrency = (budgetId: string): SQL =>
  sql`(SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid)`;

/** A ledger row's amount in `target`, at the row's own date (D-02). */
export const ledgerAmountIn = (target: SQL, alias?: string): SQL => {
  const col = (c: string) => (alias ? sql`${sql.identifier(alias)}.${sql.identifier(c)}` : sql`${sql.identifier(c)}`);
  return fxConvert(col("amount_original_cents"), col("currency_original"), target, col("transaction_date"));
};

/** Today in the budget's timezone, from serverNow() (bound) — never the DB clock. */
export const budgetToday = (budgetId: string, now: Date): SQL =>
  sql`(${now.toISOString()}::timestamptz AT TIME ZONE
       COALESCE((SELECT timezone FROM tenancy.budgets WHERE id = ${budgetId}::uuid), 'UTC'))::date`;
