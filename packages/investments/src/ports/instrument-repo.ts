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
  /** Prominence weight (higher = surfaced first); 0 when unranked. */
  rank: number;
}

export interface InstrumentUpsert {
  symbol: string;
  displayName: string;
  provider: string;
  assetClass: string;
  quoteCurrency?: string | null;
  refreshCadence?: "hourly" | "daily";
  active?: boolean;
  /** Prominence weight used to ORDER search suggestions; defaults to 0. */
  rank?: number;
}

/** Providers whose instruments are auto-priced (cron + on-add fetch). Anything
 *  else (notably `manual`) is user-priced — never sent to a PriceProvider. */
export const AUTO_PRICE_PROVIDERS: readonly string[] = [
  "finnhub",
  "coingecko",
  "twelve_data",
  "gold_api",
];

/** Sentinel provider for instruments with no free server-side price source
 *  (non-US equities/ETF). They are searchable + selectable, but the user enters
 *  and maintains the price manually. To keep the same ticker on different exchanges
 *  from colliding on the (symbol, provider) unique key (e.g. CDR on Warsaw AND
 *  Toronto), the exchange MIC is appended: `manual:XWAR`. Bare `manual` is the
 *  fallback when no MIC is known. */
export const MANUAL_PROVIDER = "manual";

/** True for the manual sentinel and any exchange-qualified variant (`manual:XWAR`). */
export function isManualProvider(provider: string | null | undefined): boolean {
  return (
    !!provider &&
    (provider === MANUAL_PROVIDER || provider.startsWith("manual:"))
  );
}

export function isAutoPriced(provider: string): boolean {
  return AUTO_PRICE_PROVIDERS.includes(provider);
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
  /** Bulk idempotent seed (one multi-row INSERT per call); returns rows sent. */
  upsertMany(inputs: InstrumentUpsert[]): Promise<number>;
  findById(id: string): Promise<InstrumentSearchResult | null>;
}
