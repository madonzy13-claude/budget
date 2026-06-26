/**
 * holding.ts — Investments domain entity (Phase 9).
 * Plain class, NO drizzle-orm / Hono / adapter imports (dep-cruiser ENGR-02).
 * Money is bigint cents + big.js-precision quantity at the entity boundary; the
 * adapter (09-03 HoldingRepo) maps rows -> Holding. Metric math lives in
 * portfolio-metrics.ts.
 */

/** Locked 9-value union (INV-04) — also the asset_class / holding_type CHECK set. */
export type HoldingType =
  | "equities"
  | "etf"
  | "bond"
  | "crypto"
  | "reit"
  | "commodity"
  | "cash_fx"
  | "real_estate"
  | "other";

export const HOLDING_TYPES: readonly HoldingType[] = [
  "equities",
  "etf",
  "bond",
  "crypto",
  "reit",
  "commodity",
  "cash_fx",
  "real_estate",
  "other",
] as const;

const HOLDING_TYPE_SET: ReadonlySet<string> = new Set(HOLDING_TYPES);

/** Runtime guard for the locked union (route/adapter boundaries). */
export function isHoldingType(value: string): value is HoldingType {
  return HOLDING_TYPE_SET.has(value);
}

export class Holding {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public name: string,
    public holdingType: HoldingType,
    /** User-defined grouping label within the Investments section; null = ungrouped. */
    public group: string | null,
    /** null = custom/cash holding (no tracked instrument). */
    public readonly instrumentId: string | null,
    /** null for cash / no buy basis. */
    public buyPriceCents: bigint | null,
    public buyCurrency: string | null,
    /** big.js-precision string (fractional shares / crypto). */
    public quantity: string,
    public currentPriceCents: bigint | null,
    public currentPriceCurrency: string | null,
    public sortOrder: number,
    public archivedAt: Date | null,
    public readonly createdAt: Date,
    // Phase 9.1 — trailing optional so existing positional constructors keep working.
    /** User-facing form type (11 values); null for pre-9.1 rows. */
    public uiType: string | null = null,
    /** Precious-metals only: gold | silver | platinum. */
    public metal: string | null = null,
    /** Precious-metals only: coin | bar | other (descriptive label). */
    public metalKind: string | null = null,
    /** Precious-metals only: g | oz | kg — the unit `quantity` is expressed in. */
    public unitOfMeasure: string | null = null,
    /** Tracked instruments only: the instrument ticker (e.g. AAPL), joined from
     *  budgeting.instruments on read; null for custom/cash/metals. */
    public readonly symbol: string | null = null,
    /** Tracked instruments only: the price provider, joined from
     *  budgeting.instruments on read. 'manual' = user-priced (no auto refresh);
     *  null for custom/cash holdings. */
    public readonly provider: string | null = null,
    /** User-typed ticker for a manual (no-instrument) tracked holding; null
     *  otherwise. `symbol` already reflects COALESCE(instrument.symbol, this). */
    public readonly manualTicker: string | null = null,
    /** The currency the user chose to value this holding in (the stored
     *  current_price_currency). May differ from `currentPriceCurrency` after a
     *  cache override puts the price in the source currency (metals: USD); the
     *  read use-case FX-converts the price back into this. */
    public readonly displayCurrency: string | null = null,
  ) {}

  /** cash_fx holdings are valued by amount (no quantity x price) and have no P/L. */
  isCash(): boolean {
    return this.holdingType === "cash_fx";
  }

  /**
   * Precious-metals holding: priced off a spot instrument (per troy ounce) but
   * quantity is in `unitOfMeasure`, so value/P-L convert spot to that unit.
   */
  isMetals(): boolean {
    return this.unitOfMeasure !== null && this.holdingType === "commodity";
  }

  /** Custom holdings (real_estate / other / cash) have no tracked instrument. */
  isCustom(): boolean {
    return this.instrumentId === null;
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }
}
