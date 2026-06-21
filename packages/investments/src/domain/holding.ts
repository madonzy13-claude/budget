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
  ) {}

  /** cash_fx holdings are valued by amount (no quantity x price) and have no P/L. */
  isCash(): boolean {
    return this.holdingType === "cash_fx";
  }

  /** Custom holdings (real_estate / other / cash) have no tracked instrument. */
  isCustom(): boolean {
    return this.instrumentId === null;
  }

  isArchived(): boolean {
    return this.archivedAt !== null;
  }
}
