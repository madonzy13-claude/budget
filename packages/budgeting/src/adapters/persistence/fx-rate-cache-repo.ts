import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";

type Rate = { rate: string; date: string } | null;

export interface FxRateCacheOptions {
  /** How long a looked-up rate stays readable without re-querying. */
  cacheTtlMs?: number;
  /** Hard ceiling on cached entries; the oldest is evicted past it. */
  maxEntries?: number;
  now?: () => number;
}

/**
 * DrizzleFxRateCacheRepo — persistence adapter for budgeting.fx_rates.
 * Reference data: no RLS, no GUC. Runs as infraTx or direct pool queries.
 *
 * Memoises lookup(). A single request re-reads the same (base, quote, date)
 * repeatedly — measured 2026-08-17 on live traces, GET /budgets/aggregate did
 * 15 identical lookups and GET .../overview/cards did 13, ~651ms of a 1173ms
 * request. Postgres executes that query in 0.082ms against a 497-row table with
 * a PK on exactly those columns, so the time was never query cost: it was 200+
 * round-trips queueing on a 25-connection pool during the page-load burst. The
 * fix is to stop asking.
 *
 * TTL rather than permanent: for any past date the rate is immutable, but
 * today's is refreshed by the daily worker, and upsert() writes through so a
 * fresh rate is never shadowed by a cached one.
 */
export class DrizzleFxRateCacheRepo implements FxRateCacheRepo {
  private readonly db: ReturnType<typeof drizzle>;
  private readonly cache = new Map<string, { value: Rate; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly pool: Pool,
    opts: FxRateCacheOptions = {},
  ) {
    this.db = drizzle(pool);
    this.ttlMs = opts.cacheTtlMs ?? 60_000;
    this.maxEntries = opts.maxEntries ?? 512;
    this.now = opts.now ?? Date.now;
  }

  private static key(base: string, quote: string, date: string): string {
    return `${base}|${quote}|${date}`;
  }

  private remember(key: string, value: Rate): void {
    // Map keeps insertion order, so the first key is the oldest entry.
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  async lookup(
    base: string,
    quote: string,
    date: string,
  ): Promise<{ rate: string; date: string } | null> {
    const key = DrizzleFxRateCacheRepo.key(base, quote, date);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.value;

    const rows = await this.db.execute<{ rate: string; date: string }>(
      sql`SELECT rate::text, date::text
          FROM budgeting.fx_rates
          WHERE base = ${base} AND quote = ${quote} AND date = ${date}::date`,
    );
    // A miss is cached too: without it, a currency pair with no stored rate
    // re-queries on every one of the 13-15 calls, which is the worst case.
    const value: Rate =
      rows.rows.length === 0
        ? null
        : { rate: rows.rows[0].rate, date: rows.rows[0].date };
    this.remember(key, value);
    return value;
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
    this.remember(DrizzleFxRateCacheRepo.key(base, quote, date), { rate, date });
  }

  async mostRecentPrior(
    base: string,
    quote: string,
    beforeDate: string,
  ): Promise<{ rate: string; date: string } | null> {
    const rows = await this.db.execute<{ rate: string; date: string }>(
      sql`SELECT rate::text, date::text
          FROM budgeting.fx_rates
          WHERE base = ${base} AND quote = ${quote} AND date < ${beforeDate}::date
          ORDER BY date DESC
          LIMIT 1`,
    );
    if (rows.rows.length === 0) return null;
    return { rate: rows.rows[0].rate, date: rows.rows[0].date };
  }
}
