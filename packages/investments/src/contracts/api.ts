/**
 * api.ts — Investments context Zod schemas + DTOs (Phase 9).
 * Shared by the API route layer and the application use-cases.
 * Numeric inputs accept comma OR dot decimals (D-15) — normalized to dot before big.js.
 */
import { z } from "zod";

/** Locked 9-value holding type (INV-04). */
export const holdingTypeSchema = z.enum([
  "equities",
  "etf",
  "bond",
  "crypto",
  "reit",
  "commodity",
  "cash_fx",
  "real_estate",
  "other",
]);
export type HoldingTypeInput = z.infer<typeof holdingTypeSchema>;

/** Phase 9.1/9.2 — user-facing type the add/edit form was filled with (12 values). */
export const uiTypeSchema = z.enum([
  "equity",
  "etf",
  "etb",
  "reit",
  "crypto",
  "treasury_bond",
  "collectibles",
  "real_estate",
  "other",
  "precious_metals",
  "cash",
  // 9.2 — brokerage/cash account: deposited value vs actual value, no instrument.
  "broker",
]);
export type UiTypeInput = z.infer<typeof uiTypeSchema>;

/** Coarse holding_type each ui_type maps to (price routing / asset_class). */
export const UI_TYPE_TO_HOLDING_TYPE: Record<UiTypeInput, HoldingTypeInput> = {
  equity: "equities",
  etf: "etf",
  etb: "bond",
  reit: "reit",
  crypto: "crypto",
  treasury_bond: "bond",
  collectibles: "other",
  real_estate: "real_estate",
  other: "other",
  precious_metals: "commodity",
  cash: "cash_fx",
  broker: "other",
};

export const metalSchema = z.enum(["gold", "silver", "platinum", "palladium"]);
export const metalKindSchema = z.enum(["coin", "bar", "other"]);
export const uomSchema = z.enum(["g", "oz", "kg"]);

/** Spot instrument symbol per metal (seeded in the worker universe). */
export const METAL_TO_SYMBOL: Record<z.infer<typeof metalSchema>, string> = {
  gold: "XAU/USD",
  silver: "XAG/USD",
  platinum: "XPT/USD",
  palladium: "XPD/USD",
};

const currencyCode = z.string().regex(/^[A-Z0-9]{3,5}$/);

/** Normalize "1.234,56" / "1,5" → dot-decimal string (big.js-safe). */
const numericString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/\s/g, "").replace(/,/g, ".").trim());

/** Cents value as bigint-string or number (DTO boundary rule). */
const centsInput = z.union([z.string(), z.number()]);

export const createHoldingSchema = z.object({
  name: z.string().min(1).max(120),
  holdingType: holdingTypeSchema,
  uiType: uiTypeSchema.nullish(),
  group: z.string().max(120).nullish(),
  instrumentId: z.string().uuid().nullish(),
  /** User-typed ticker for a manual (no-instrument) tracked holding. */
  manualTicker: z.string().max(20).nullish(),
  buyPriceCents: centsInput.nullish(),
  buyCurrency: currencyCode.nullish(),
  quantity: numericString.default("1"),
  currentPriceCents: centsInput.nullish(),
  currentPriceCurrency: currencyCode.nullish(),
  // Precious-metals attributes (nullish for every other type).
  metal: metalSchema.nullish(),
  metalKind: metalKindSchema.nullish(),
  unitOfMeasure: uomSchema.nullish(),
  /** Bullion premium over spot as a percent ("20" = +20%); metals only. Applied to
   *  the current (resale) value; null/"" = melt/spot value. */
  premiumPct: numericString.nullish(),
});
export type CreateHoldingInput = z.infer<typeof createHoldingSchema>;

export const updateHoldingSchema = createHoldingSchema.partial();
export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>;

export const reorderHoldingsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});
export type ReorderHoldingsInput = z.infer<typeof reorderHoldingsSchema>;

export const searchQuerySchema = z.object({ q: z.string().min(2).max(64) });

/** Enriched holding row returned by GET /investments. */
export interface EnrichedHoldingDto {
  id: string;
  name: string;
  holdingType: HoldingTypeInput;
  uiType: string | null;
  group: string | null;
  instrumentId: string | null;
  metal: string | null;
  metalKind: string | null;
  unitOfMeasure: string | null;
  /** Precious-metals bullion premium over spot (percent string); null = none. */
  premiumPct: string | null;
  /** Tracked-instrument ticker (e.g. AAPL); null for custom/cash/metals. */
  symbol: string | null;
  /** Tracked-instrument price provider; 'manual' = user-priced (editable in the
   *  form, no auto refresh); null for custom/cash holdings. */
  instrumentProvider: string | null;
  isCustom: boolean;
  isDelisted: boolean;
  quantity: string;
  buyPriceCents: string | null;
  buyCurrency: string | null;
  currentPriceCents: string | null;
  currentPriceCurrency: string | null;
  /** value in the holding's current-price currency (cents, string). */
  valueCents: string;
  /** value in the budget default currency (cents, string). */
  valueInBudgetCents: string;
  /** signed P/L %, 1 decimal; null for cash / no-basis. */
  profitLossPct: number | null;
  /** signed absolute P/L in cents (buy-currency basis); null for cash / no-basis.
   *  Computed server-side from the real cost basis so a near-total loss stays a
   *  real number (the client must NOT back-derive it from value + rounded pct). */
  profitLossCents: string | null;
  /** weight % within group (grouped) or whole portfolio (ungrouped). */
  weightPct: number;
  sortOrder: number;
  createdAt: string;
}
