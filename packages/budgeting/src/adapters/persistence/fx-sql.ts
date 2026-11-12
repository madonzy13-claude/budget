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

/** budgeting.fx_convert(cents, src, dst, onDate) → bigint cents (NULL: no pair).
 *  261111: same currency never reaches the function — Postgres runs a SQL
 *  function per row even when it would short-circuit, and a wealth read made
 *  ~20k such calls (5 per snapshot).
 *  261112: the function's body, written inline — the same lookup as a subquery
 *  costs ~3× less than a call to a function holding it. Keep the two identical
 *  (fx-sql.test.ts compares them). */
export const fxConvert = (
  cents: SQL | string,
  src: SQL | string,
  dst: SQL | string,
  onDate: SQL | string,
): SQL => fxApply(cents, src, dst, fxRate(src, dst, onDate));

/** fx_convert's rate: on the date, else the most recent prior, else the earliest; NULL = no pair. */
export const fxRate = (src: SQL | string, dst: SQL | string, onDate: SQL | string): SQL =>
  sql`COALESCE(
          (SELECT r.rate FROM budgeting.fx_rates r
            WHERE r.base = (${src})::bpchar AND r.quote = (${dst})::bpchar AND r.date <= (${onDate})::date
            ORDER BY r.date DESC LIMIT 1),
          (SELECT r.rate FROM budgeting.fx_rates r
            WHERE r.base = (${src})::bpchar AND r.quote = (${dst})::bpchar
            ORDER BY r.date ASC LIMIT 1))`;

/** `cents` at `rate` (from fxRate), rounded as fx_convert; same currency untouched. A query
 *  with many rows sharing a few (pair, date) keys looks the rate up once per key and applies it. */
export const fxApply = (cents: SQL | string, src: SQL | string, dst: SQL | string, rate: SQL): SQL =>
  sql`CASE WHEN (${src})::text = (${dst})::text THEN (${cents})::bigint
        ELSE round((${cents})::bigint * ${rate})::bigint END`;

/** D-08: the date a month's limit converts at. `today` is an ISO date string or a budgetToday() fragment. */
export const limitRateDate = (monthEnd: SQL | string, today: SQL | string): SQL =>
  sql`LEAST((${monthEnd})::date, ${today}::date)`;

/** The budget's CURRENT currency — the target every read re-expresses into. */
export const budgetCurrency = (budgetId: string): SQL =>
  sql`(SELECT default_currency FROM tenancy.budgets WHERE id = ${budgetId}::uuid)`;

/** A category's OWN currency (14-23: per-category figures read in it). */
export const categoryCurrencyOf = (categoryId: SQL): SQL =>
  sql`(SELECT c.currency FROM budgeting.categories c WHERE c.id = ${categoryId})`;

/** The stored conversion when it is in `target`, else a live one (0110: a
 *  missing or outdated stored figure is slower, never wrong). */
export const storedOr = (ccyCol: SQL, centsCol: SQL, target: SQL | string, live: SQL): SQL =>
  sql`CASE WHEN (${ccyCol})::text = (${target})::text THEN ${centsCol} ELSE ${live} END`;

/** A ledger row's amount in `target`, at the row's own date (D-02). */
export const ledgerAmountIn = (target: SQL, alias?: string): SQL => {
  const col = (c: string) => (alias ? sql`${sql.identifier(alias)}.${sql.identifier(c)}` : sql`${sql.identifier(c)}`);
  return storedOr(
    col("fx_cache_ccy"),
    col("fx_cache_cents"),
    target,
    fxConvert(col("amount_original_cents"), col("currency_original"), target, col("transaction_date")),
  );
};

/** Today in the budget's timezone, from serverNow() (bound) — never the DB clock. */
export const budgetToday = (budgetId: string, now: Date): SQL =>
  sql`(${now.toISOString()}::timestamptz AT TIME ZONE
       COALESCE((SELECT timezone FROM tenancy.budgets WHERE id = ${budgetId}::uuid), 'UTC'))::date`;
