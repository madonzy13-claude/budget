/**
 * list-supported-currencies.ts — Application use case: return supported currencies allowlist.
 * Reads from budgeting.supported_currencies (seeded by plan 02-02 post-migration.sql).
 * Used by UI currency picker — ensures picker only shows codes in the allowlist.
 */
import { listSupportedCurrenciesFromDb, type SupportedCurrencyRow } from "../adapters/persistence/supported-currencies-repo";

export type { SupportedCurrencyRow };

export async function listSupportedCurrencies(): Promise<SupportedCurrencyRow[]> {
  return listSupportedCurrenciesFromDb();
}
