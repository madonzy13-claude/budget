/**
 * supported-currencies-repo.ts — reads budgeting.supported_currencies allowlist.
 * Reference data: NO RLS (GRANT-restricted, seeded by plan 02-02 post-migration.sql lines 314-330).
 * Does NOT depend on runtime bootstrapSupportedCurrencies — the seed is the source of truth.
 */
import { sql } from "drizzle-orm";
import { withInfraTx } from "@budget/platform";

export interface SupportedCurrencyRow {
  isoCode: string;
  name: string;
  symbol: string | null;
  kind: "FIAT" | "CRYPTO";
}

export async function listSupportedCurrenciesFromDb(): Promise<SupportedCurrencyRow[]> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Array<{ iso_code: string; name: string; symbol: string | null; kind: string }> }> };
    const rs = await drizzleTx.execute(
      sql`SELECT iso_code AS iso_code, name, symbol, kind
            FROM budgeting.supported_currencies
           ORDER BY kind ASC, iso_code ASC`,
    );
    return rs.rows;
  });

  if (r.isErr()) return [];
  return r.value.map((row) => ({
    isoCode: row.iso_code,
    name: row.name,
    symbol: row.symbol,
    kind: row.kind as "FIAT" | "CRYPTO",
  }));
}

export async function isSupportedCurrency(isoCode: string): Promise<boolean> {
  const r = await withInfraTx(async (tx) => {
    const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Array<{ iso_code: string }> }> };
    const rs = await drizzleTx.execute(
      sql`SELECT iso_code FROM budgeting.supported_currencies WHERE iso_code = ${isoCode} LIMIT 1`,
    );
    return rs.rows.length > 0;
  });
  return r.isOk() ? r.value : false;
}

export const supportedCurrenciesRepo = {
  list: listSupportedCurrenciesFromDb,
  isSupported: isSupportedCurrency,
};
