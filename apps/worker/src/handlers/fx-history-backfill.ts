/**
 * fx-history-backfill.ts — daily FX history for every pair among the
 * currency picker's currencies (13.1 round 6, user).
 *
 * The API is cache-only (CacheOnlyFxProvider), and the cache only began in
 * 2026 — so a sale dated 2024 failed with "No exchange rate for EUR on
 * 2024-05-03". This fills the past once: one Frankfurter range call per base
 * currency and calendar year, bulk-inserted. A past year already stored is
 * skipped, so a worker restart costs a few COUNT queries; the current year is
 * always topped up. Stored rates are never overwritten.
 *
 * Imports nothing but pg (see fx-pairs-sql.ts on the platform barrel).
 */
import type { Pool } from "pg";

/** Same list as the picker / FX_PAIRS_SQL. */
export const FX_HISTORY_CURRENCIES = [
  "USD",
  "EUR",
  "PLN",
  "GBP",
  "UAH",
  "CHF",
  "NOK",
  "SEK",
];

/** ECB reference rates (Frankfurter's base series) start in 1999. */
export const FX_HISTORY_FROM = "2000-01-01";

// ponytail: 90% of the days counts as "already stored" — a source with a gap
// would otherwise be refetched on every restart.
const COMPLETE = 0.9;

const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  ) + 1;

export async function backfillFxHistory(opts: {
  pool: Pool;
  fetchFn?: typeof fetch;
  currencies?: string[];
  from?: string;
  today?: string;
}): Promise<{ inserted: number; failed: number }> {
  const {
    pool,
    fetchFn = fetch,
    currencies = FX_HISTORY_CURRENCIES,
    from = FX_HISTORY_FROM,
    today = new Date().toISOString().slice(0, 10),
  } = opts;
  let inserted = 0;
  let failed = 0;
  const lastYear = Number(today.slice(0, 4));
  for (const base of currencies) {
    const quotes = currencies.filter((c) => c !== base);
    for (let y = Number(from.slice(0, 4)); y <= lastYear; y++) {
      const start = y === Number(from.slice(0, 4)) ? from : `${y}-01-01`;
      const end = y === lastYear ? today : `${y}-12-31`;
      if (y < lastYear) {
        const { rows } = await pool.query<{ n: string }>(
          `SELECT count(*)::text n FROM budgeting.fx_rates
            WHERE base = $1 AND quote = ANY($2) AND date BETWEEN $3 AND $4`,
          [base, quotes, start, end],
        );
        if (
          Number(rows[0]!.n) >=
          daysBetween(start, end) * quotes.length * COMPLETE
        )
          continue;
      }
      try {
        const url =
          `https://api.frankfurter.dev/v2/rates?base=${base}` +
          `&quotes=${quotes.join(",")}&from=${start}&to=${end}`;
        const r = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(`frankfurter http ${r.status}`);
        const body = (await r.json()) as Array<{
          date: string;
          quote: string;
          rate: number;
        }>;
        // Never let garbage into money math (same rule as the live adapter).
        const ok = body.filter(
          (x) =>
            quotes.includes(x.quote) &&
            Number.isFinite(x.rate) &&
            x.rate > 0 &&
            /^\d{4}-\d{2}-\d{2}$/.test(x.date),
        );
        if (ok.length === 0) continue;
        const res = await pool.query(
          `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider)
           SELECT $1, q, d::date, r::numeric, 'frankfurter'
             FROM unnest($2::text[], $3::text[], $4::text[]) AS t(q, d, r)
           ON CONFLICT (base, quote, date) DO NOTHING`,
          [
            base,
            ok.map((x) => x.quote),
            ok.map((x) => x.date),
            ok.map((x) => String(x.rate)),
          ],
        );
        inserted += res.rowCount ?? 0;
      } catch (e) {
        failed++;
        console.error(
          `[fx-history-backfill] ${base} ${y}: ${(e as Error).message}`,
        );
      }
    }
  }
  return { inserted, failed };
}
