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
  group: z.string().max(120).nullish(),
  instrumentId: z.string().uuid().nullish(),
  buyPriceCents: centsInput.nullish(),
  buyCurrency: currencyCode.nullish(),
  quantity: numericString.default("1"),
  currentPriceCents: centsInput.nullish(),
  currentPriceCurrency: currencyCode.nullish(),
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
  group: string | null;
  instrumentId: string | null;
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
