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

/** Phase 9.1 — user-facing type the add/edit form was filled with (11 values). */
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
};

export const metalSchema = z.enum(["gold", "silver", "platinum"]);
export const metalKindSchema = z.enum(["coin", "bar", "other"]);
export const uomSchema = z.enum(["g", "oz", "kg"]);

/** Spot instrument symbol per metal (seeded in the worker universe). */
export const METAL_TO_SYMBOL: Record<z.infer<typeof metalSchema>, string> = {
  gold: "XAU/USD",
  silver: "XAG/USD",
  platinum: "XPT/USD",
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
  buyPriceCents: centsInput.nullish(),
  buyCurrency: currencyCode.nullish(),
  quantity: numericString.default("1"),
  currentPriceCents: centsInput.nullish(),
  currentPriceCurrency: currencyCode.nullish(),
  // Precious-metals attributes (nullish for every other type).
  metal: metalSchema.nullish(),
  metalKind: metalKindSchema.nullish(),
  unitOfMeasure: uomSchema.nullish(),
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
  /** Tracked-instrument ticker (e.g. AAPL); null for custom/cash/metals. */
  symbol: string | null;
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
  /** weight % within group (grouped) or whole portfolio (ungrouped). */
  weightPct: number;
  sortOrder: number;
  createdAt: string;
}
