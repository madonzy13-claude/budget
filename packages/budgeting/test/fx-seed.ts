/**
 * fx-seed.ts — seed / clean budgeting.fx_rates for DB-backed tests.
 *
 * Uses the REAL columns (base, quote, date, rate, provider). The older
 * seedFxRate in helpers.ts names columns that do not exist — do not copy it.
 *
 * worker_role has INSERT/UPDATE on fx_rates; only the migrator may DELETE, so
 * cleanup goes through DATABASE_URL_MIGRATOR, scoped by the provider tag.
 */
import { Pool } from "pg";

export interface FxSeedRow {
  base: string;
  quote: string;
  date: string;
  rate: string;
}

const url = (k: "DATABASE_URL_WORKER" | "DATABASE_URL_MIGRATOR") => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} not set`);
  return v.replace("@db:", "@localhost:");
};

export async function seedFxRates(
  rows: FxSeedRow[],
  provider: string,
): Promise<void> {
  const pool = new Pool({ connectionString: url("DATABASE_URL_WORKER") });
  try {
    for (const r of rows) {
      await pool.query(
        `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider)
         VALUES ($1, $2, $3::date, $4::numeric, $5)
         ON CONFLICT (base, quote, date)
         DO UPDATE SET rate = EXCLUDED.rate, provider = EXCLUDED.provider`,
        [r.base, r.quote, r.date, r.rate, provider],
      );
    }
  } finally {
    await pool.end();
  }
}

export async function deleteFxRates(provider: string): Promise<void> {
  const pool = new Pool({ connectionString: url("DATABASE_URL_MIGRATOR") });
  try {
    await pool.query(`DELETE FROM budgeting.fx_rates WHERE provider = $1`, [
      provider,
    ]);
  } finally {
    await pool.end();
  }
}
