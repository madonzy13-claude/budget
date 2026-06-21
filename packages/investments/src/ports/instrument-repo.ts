/**
 * instrument-repo.ts — InstrumentRepo port (Phase 9, INV-07).
 * Local trigram search over budgeting.instruments — NEVER a price provider (D-04).
 * Reference data, no tenant scope. NO drizzle here — the adapter implements it.
 */
export interface InstrumentSearchResult {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: string;
  quoteCurrency: string | null;
  provider: string;
  refreshCadence: "hourly" | "daily";
}

export interface InstrumentUpsert {
  symbol: string;
  displayName: string;
  provider: string;
  assetClass: string;
  quoteCurrency?: string | null;
  refreshCadence?: "hourly" | "daily";
  active?: boolean;
}

export interface InstrumentRepo {
  /** >=2 char query; ranks exact symbol > symbol-prefix > name match.
   *  Optional assetClass narrows to one type (the type-filtered Asset autocomplete). */
  search(
    query: string,
    limit?: number,
    assetClass?: string | null,
  ): Promise<InstrumentSearchResult[]>;
  /** Idempotent seed (ON CONFLICT (symbol, provider)); returns the instrument id. */
  upsert(input: InstrumentUpsert): Promise<string>;
  findById(id: string): Promise<InstrumentSearchResult | null>;
}
