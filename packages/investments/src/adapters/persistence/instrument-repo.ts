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
  };
}

export class DrizzleInstrumentRepo implements InstrumentRepo {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool);
  }

  async search(query: string, limit = 20): Promise<InstrumentSearchResult[]> {
    const q = query.trim();
    // D-07: >=2 char minimum so a single keystroke does not scan the table.
    if (q.length < 2) return [];

    // q is a BOUND parameter ($1); the `|| '%'` concatenation is SQL-side, so the
    // query value can only ever be a filter, never alter the statement (T-9-08).
    const rows = await this.db.execute<InstrumentRow>(sql`
      SELECT id::text AS id, symbol, display_name, asset_class,
             quote_currency, provider, refresh_cadence
        FROM budgeting.instruments
       WHERE active = true
         AND (symbol ILIKE ${q} || '%' OR display_name ILIKE '%' || ${q} || '%')
       ORDER BY CASE
                  WHEN symbol ILIKE ${q} THEN 0
                  WHEN symbol ILIKE ${q} || '%' THEN 1
                  ELSE 2
                END,
                display_name ASC
       LIMIT ${limit}
    `);
    return rows.rows.map(mapRow);
  }

  async upsert(input: InstrumentUpsert): Promise<string> {
    const rows = await this.db.execute<{ id: string }>(sql`
      INSERT INTO budgeting.instruments
        (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, fetched_at)
      VALUES
        (${input.symbol}, ${input.displayName}, ${input.provider}, ${input.assetClass},
         ${input.quoteCurrency ?? null}, ${input.refreshCadence ?? "hourly"}, ${input.active ?? true}, now())
      ON CONFLICT (symbol, provider) DO UPDATE SET
        display_name   = EXCLUDED.display_name,
        asset_class    = EXCLUDED.asset_class,
        quote_currency = EXCLUDED.quote_currency,
        refresh_cadence = EXCLUDED.refresh_cadence,
        active         = EXCLUDED.active,
        fetched_at     = now()
      RETURNING id::text AS id
    `);
    return rows.rows[0].id;
  }

  async findById(id: string): Promise<InstrumentSearchResult | null> {
    const rows = await this.db.execute<InstrumentRow>(sql`
      SELECT id::text AS id, symbol, display_name, asset_class,
             quote_currency, provider, refresh_cadence
        FROM budgeting.instruments
       WHERE id = ${id}::uuid
       LIMIT 1
    `);
    return rows.rows.length ? mapRow(rows.rows[0]) : null;
  }
}
