import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type { FxRateCacheRepo } from "../../ports/fx-rate-cache-repo";

/**
 * DrizzleFxRateCacheRepo — persistence adapter for budgeting.fx_rates.
 * Reference data: no RLS, no GUC. Runs as infraTx or direct pool queries.
 */
export class DrizzleFxRateCacheRepo implements FxRateCacheRepo {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async lookup(
    base: string,
    quote: string,
    date: string,
  ): Promise<{ rate: string; date: string } | null> {
    const rows = await this.db.execute<{ rate: string; date: string }>(
      sql`SELECT rate::text, date::text
          FROM budgeting.fx_rates
          WHERE base = ${base} AND quote = ${quote} AND date = ${date}::date`,
    );
    if (rows.rows.length === 0) return null;
    return { rate: rows.rows[0].rate, date: rows.rows[0].date };
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
