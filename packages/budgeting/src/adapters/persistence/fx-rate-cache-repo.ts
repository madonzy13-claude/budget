import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";

type Rate = { rate: string; date: string } | null;
/** One pair's stored rates, ascending by date. */
type Series = { dates: string[]; rates: string[] };

export interface FxRateCacheOptions {
  /** How long a loaded pair stays readable without re-querying. */
  cacheTtlMs?: number;
  /** Hard ceiling on cached currency pairs; the oldest is evicted past it. */
  maxEntries?: number;
  now?: () => number;
}

/**
 * DrizzleFxRateCacheRepo — persistence adapter for budgeting.fx_rates.
 * Reference data: no RLS, no GUC. Runs as infraTx or direct pool queries.
 *
 * Memoises reads per currency PAIR. A request asks for many dates of the same
 * pair — measured 2026-08-17, GET /budgets/aggregate did 15 identical lookups,
 * and on 2026-11-02 GET .../overview/wealth did ~1,200 (one per snapshot day ×
 * currency, up to 15s). Postgres answers each in ~0.1ms; the time was
 * round-trips queueing on the pool. So the first read of a pair loads its whole
 * history (≤ ~10k rows) and every exact or nearest-earlier date after that is a
 * binary search in memory.
 *
 * TTL rather than permanent: for any past date the rate is immutable, but
 * today's is refreshed by the daily worker, and upsert() writes through so a
 * fresh rate is never shadowed by a cached one.
 */
export class DrizzleFxRateCacheRepo implements FxRateCacheRepo {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly cache = new Map<
    string,
    { series: Promise<Series>; expiresAt: number }
  >();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly pool: Pool,
    opts: FxRateCacheOptions = {},
  ) {
    this.db = drizzle(pool);
    this.ttlMs = opts.cacheTtlMs ?? 60_000;
    this.maxEntries = opts.maxEntries ?? 64;
    this.now = opts.now ?? Date.now;
  }

  /** The pair's series — one query per pair per TTL, shared by concurrent callers. */
  private series(base: string, quote: string): Promise<Series> {
    const key = `${base}|${quote}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.series;

    const series = this.db
      .execute<{ rate: string; date: string }>(
        sql`SELECT rate::text, date::text
            FROM budgeting.fx_rates
            WHERE base = ${base} AND quote = ${quote}
            ORDER BY date`,
      )
      .then((r) => ({
        dates: r.rows.map((x) => x.date),
        rates: r.rows.map((x) => x.rate),
      }));
    // A failed read must not stay cached as a rejected promise.
    series.catch(() => this.cache.delete(key));
    // Map keeps insertion order, so the first key is the oldest entry.
    this.cache.delete(key);
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { series, expiresAt: this.now() + this.ttlMs });
    return series;
  }

  /** Index of the first date >= `date`. */
  private static lowerBound(dates: string[], date: string): number {
    let lo = 0;
    let hi = dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] < date) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  async lookup(base: string, quote: string, date: string): Promise<Rate> {
    const s = await this.series(base, quote);
    const i = DrizzleFxRateCacheRepo.lowerBound(s.dates, date);
    return s.dates[i] === date ? { rate: s.rates[i], date } : null;
  }

  async upsert(
    base: string,
    quote: string,
    date: string,
    rate: string,
    provider: string,
  ): Promise<void> {
    await this.db.execute(
      sql`INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider, fetched_at)
          VALUES (${base}, ${quote}, ${date}::date, ${rate}::numeric, ${provider}, now())
          ON CONFLICT (base, quote, date)
          DO UPDATE SET
            rate = EXCLUDED.rate,
            provider = EXCLUDED.provider,
            fetched_at = EXCLUDED.fetched_at`,
    );
    // Write through, do not merely invalidate. The daily worker upserts today's
    // rate; leaving a stale entry readable for the rest of the TTL would mean
    // converting money at yesterday's number.
    const hit = this.cache.get(`${base}|${quote}`);
    if (hit) {
      const s = await hit.series.catch(() => null);
      if (s) {
        const i = DrizzleFxRateCacheRepo.lowerBound(s.dates, date);
        if (s.dates[i] === date) s.rates[i] = rate;
        else {
          s.dates.splice(i, 0, date);
          s.rates.splice(i, 0, rate);
        }
      }
    }
  }

  async mostRecentPrior(
    base: string,
    quote: string,
    beforeDate: string,
  ): Promise<Rate> {
    const s = await this.series(base, quote);
    const i = DrizzleFxRateCacheRepo.lowerBound(s.dates, beforeDate) - 1;
    return i < 0 ? null : { rate: s.rates[i], date: s.dates[i] };
  }
}
