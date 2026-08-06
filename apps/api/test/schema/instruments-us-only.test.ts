/**
 * instruments-us-only.test.ts — the universe holds no un-priceable equities (260806).
 *
 * We can only fetch a live quote for a US listing (Finnhub), so `classifyTdRow`
 * DROPS every non-US stock/ETF rather than storing it as `manual:<MIC>`. An older
 * ingest did store the global list, and those rows outlived the rule that now
 * forbids them.
 *
 * They are not merely dead weight. `budgeting.instruments` is keyed by symbol, so
 * the Warsaw `UBER` occupies the ticker NASDAQ's `UBER` needs — and because the
 * ingest drops non-US rows, it can never overwrite the squatter. The US listing
 * simply never lands. A user searching "Uber" finds `UBERDOC Health Technologies`
 * and `Kuber Resources`, because the search (correctly) hides `manual:*`.
 *
 * The migration purges the fossils; the CHECK constraint is what stops them coming
 * back, since a future edit to classifyTdRow could otherwise reintroduce them
 * silently — the failure mode is invisible until someone can't add a stock.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

// worker_role, not app_role: the universe is a global catalog the worker owns and
// app_role cannot even read. Under app_role every query here returns zero rows and
// the whole file passes while proving nothing.
//
// Skips rather than throws when the URL is absent: apps/api/test/schema is swept by
// the DB-free unit job, where a throw at import fails the whole job. The tenant-leak
// job runs this file again with a migrated database and the env set.
const DB_URL_RAW = process.env.DATABASE_URL_WORKER;
const DB_URL = DB_URL_RAW?.replace("@db:", "@localhost:");

let pool: Pool;
beforeAll(() => {
  if (DB_URL) pool = new Pool({ connectionString: DB_URL });
});

describe.skipIf(!DB_URL)("Instrument universe — US-listed only", () => {
  it("stores no manual-priced equities or ETFs", async () => {
    const { rows } = await pool.query(
      `SELECT symbol, display_name, provider
         FROM budgeting.instruments
        WHERE asset_class IN ('equities','etf')
          AND provider LIKE 'manual%'`,
    );
    expect(rows).toEqual([]);
  });

  it("refuses to accept one", async () => {
    // The constraint is the durable guard — purging alone would let the next
    // loosened ingest refill the table.
    const insert = pool.query(
      `INSERT INTO budgeting.instruments
         (symbol, display_name, provider, asset_class, quote_currency,
          refresh_cadence, rank, active)
       VALUES ('ZZTEST', 'Not US Listed', 'manual:XWAR', 'equities', 'PLN',
               'daily', 10, true)`,
    );
    await expect(insert).rejects.toThrow();
  });

  it("still accepts a manual instrument outside equities and ETFs", async () => {
    // Scoped deliberately: other asset classes may legitimately be manual, and
    // a blanket ban would take them out with the fossils.
    await pool.query(
      `INSERT INTO budgeting.instruments
         (symbol, display_name, provider, asset_class, quote_currency,
          refresh_cadence, rank, active)
       VALUES ('ZZREAL', 'A Bar of Something', 'manual:NONE', 'commodity', 'PLN',
               'daily', 10, true)`,
    );
    await pool.query(
      `DELETE FROM budgeting.instruments WHERE symbol = 'ZZREAL'`,
    );
  });
});
