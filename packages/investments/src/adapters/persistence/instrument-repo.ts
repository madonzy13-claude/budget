/**
 * instrument-repo.ts — DrizzleInstrumentRepo (Phase 9, INV-07 / D-04 / T-9-08).
 * Local trigram search over budgeting.instruments — NEVER a price provider.
 * The query value is a BOUND sql parameter (no string interpolation into SQL).
 * Reference data (no RLS): runs on the injected Pool (app_role search / worker_role seed).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import type {
  InstrumentRepo,
  InstrumentSearchResult,
  InstrumentUpsert,
} from "../../ports/instrument-repo";

// `type` (not `interface`) so it satisfies drizzle execute<T>'s Record<string,unknown>
// constraint — a named interface does not get an implicit index signature.
type InstrumentRow = {
  id: string;
  symbol: string;
  display_name: string;
  asset_class: string;
  quote_currency: string | null;
  provider: string;
  refresh_cadence: string;
  rank: number;
};

function mapRow(r: InstrumentRow): InstrumentSearchResult {
  return {
    id: r.id,
    symbol: r.symbol,
    displayName: r.display_name,
    assetClass: r.asset_class,
    quoteCurrency: r.quote_currency,
    provider: r.provider,
    refreshCadence: r.refresh_cadence === "daily" ? "daily" : "hourly",
    rank: Number(r.rank ?? 0),
  };
}

export class DrizzleInstrumentRepo implements InstrumentRepo {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async search(
    query: string,
    limit = 20,
    assetClass?: string | null,
  ): Promise<InstrumentSearchResult[]> {
    const q = query.trim();
    // D-07: >=2 char minimum so a single keystroke does not scan the table.
    if (q.length < 2) return [];
    const ac = assetClass ?? null;

    // q + ac are BOUND parameters; the `|| '%'` concatenation is SQL-side, so the
    // query value can only ever be a filter, never alter the statement (T-9-08).
    const rows = await this.db.execute<InstrumentRow>(sql`
      SELECT id::text AS id, symbol, display_name, asset_class,
             quote_currency, provider, refresh_cadence, rank
        FROM budgeting.instruments
       WHERE active = true
         -- Only suggest instruments we can actually PRICE. Non-US equities/ETFs are
         -- stored as 'manual:<MIC>' (no live price feed), so surfacing them just
         -- offers assets that will never get a quote. Auto-priced providers
         -- (finnhub US, coingecko, metals) do NOT start with 'manual'.
         AND provider NOT LIKE 'manual%'
         AND (${ac}::text IS NULL OR asset_class = ${ac})
         AND (symbol ILIKE ${q} || '%' OR display_name ILIKE '%' || ${q} || '%')
       ORDER BY CASE
                  WHEN symbol ILIKE ${q} THEN 0
                  WHEN symbol ILIKE ${q} || '%' THEN 1
                  ELSE 2
                END,
                rank DESC,
                display_name ASC
       LIMIT ${limit}
    `);
    return rows.rows.map(mapRow);
  }

  async upsert(input: InstrumentUpsert): Promise<string> {
    const rows = await this.db.execute<{ id: string }>(sql`
      INSERT INTO budgeting.instruments
        (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, rank, fetched_at)
      VALUES
        (${input.symbol}, ${input.displayName}, ${input.provider}, ${input.assetClass},
         ${input.quoteCurrency ?? null}, ${input.refreshCadence ?? "hourly"}, ${input.active ?? true},
         ${input.rank ?? 0}, now())
      ON CONFLICT (symbol, provider) DO UPDATE SET
        display_name   = EXCLUDED.display_name,
        asset_class    = EXCLUDED.asset_class,
        quote_currency = EXCLUDED.quote_currency,
        refresh_cadence = EXCLUDED.refresh_cadence,
        active         = EXCLUDED.active,
        rank           = EXCLUDED.rank,
        fetched_at     = now()
      RETURNING id::text AS id
    `);
    return rows.rows[0].id;
  }

  /**
   * Bulk upsert for the daily universe seed: one multi-row INSERT per batch
   * (not N round-trips). Same ON CONFLICT (symbol, provider) merge as upsert().
   * Returns the number of rows sent. Caller batches (~1–5k per call).
   */
  async upsertMany(inputs: InstrumentUpsert[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const values = inputs.map(
      (i) =>
        sql`(${i.symbol}, ${i.displayName}, ${i.provider}, ${i.assetClass},
             ${i.quoteCurrency ?? null}, ${i.refreshCadence ?? "hourly"},
             ${i.active ?? true}, ${i.rank ?? 0}, now())`,
    );
    await this.db.execute(sql`
      INSERT INTO budgeting.instruments
        (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, rank, fetched_at)
      VALUES ${sql.join(values, sql`, `)}
      ON CONFLICT (symbol, provider) DO UPDATE SET
        display_name    = EXCLUDED.display_name,
        asset_class     = EXCLUDED.asset_class,
        quote_currency  = EXCLUDED.quote_currency,
        refresh_cadence = EXCLUDED.refresh_cadence,
        active          = EXCLUDED.active,
        rank            = EXCLUDED.rank,
        fetched_at      = now()
    `);
    return inputs.length;
  }

  async findById(id: string): Promise<InstrumentSearchResult | null> {
    const rows = await this.db.execute<InstrumentRow>(sql`
      SELECT id::text AS id, symbol, display_name, asset_class,
             quote_currency, provider, refresh_cadence, rank
        FROM budgeting.instruments
       WHERE id = ${id}::uuid
       LIMIT 1
    `);
    return rows.rows.length ? mapRow(rows.rows[0]) : null;
  }
}
