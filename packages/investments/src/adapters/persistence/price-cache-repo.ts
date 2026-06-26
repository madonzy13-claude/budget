/**
 * price-cache-repo.ts — DrizzlePriceCacheRepo (Phase 9).
 * budgeting.instrument_price_cache: latest price per instrument. Reference data,
 * no RLS — runs on the injected Pool (worker_role writes from the price jobs).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { PriceCacheRepo, CachedPrice } from "../../ports/price-cache-repo";

export class DrizzlePriceCacheRepo implements PriceCacheRepo {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async lookup(instrumentId: string): Promise<CachedPrice | null> {
    const rows = await this.db.execute<{
      price: string;
      currency: string;
      fetched_at: string;
    }>(sql`
      SELECT price::text AS price, currency, fetched_at::text AS fetched_at
        FROM budgeting.instrument_price_cache
       WHERE instrument_id = ${instrumentId}::uuid
       LIMIT 1
    `);
    if (!rows.rows.length) return null;
    const r = rows.rows[0];
    return {
      price: r.price,
      currency: r.currency,
      fetchedAt: new Date(r.fetched_at),
    };
  }

  async upsert(
    instrumentId: string,
    price: string,
    currency: string,
  ): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
      VALUES (${instrumentId}::uuid, ${price}::numeric, ${currency}, now())
      ON CONFLICT (instrument_id) DO UPDATE SET
        price      = EXCLUDED.price,
        currency   = EXCLUDED.currency,
        fetched_at = now()
    `);
  }
}
