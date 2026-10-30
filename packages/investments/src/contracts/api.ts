/**
 * api.ts — Investments context Zod schemas + DTOs (Phase 9).
 * Shared by the API route layer and the application use-cases.
 * Numeric inputs accept comma OR dot decimals (D-15) — normalized to dot before big.js.
 */
import { z } from "zod";

/** Locked holding type (INV-04). */
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
  // Bank savings deposit (accrues interest, compute-on-read).
  "deposit",
  // Manual savings pot: starting + current amount, qty=1, %change only.
  "savings",
  // Physical possession (house/car/…): single current amount + icon, qty=1.
  // In capitalization, excluded from the retirement pot; own wallets section.
  "possession",
]);
export type HoldingTypeInput = z.infer<typeof holdingTypeSchema>;

/** Phase 13 (D-11): a stale client may still send the pre-merge type names. */
export function normalizeLegacyUiType(v: unknown): unknown {
  if (v === "equity" || v === "etf" || v === "reit") return "stocks";
  if (v === "etb") return "treasury_bond";
  return v;
}

const UI_TYPES = [
  // Phase 13 (D-10): equity + ETF are one type; search returns both.
  "stocks",
  "crypto",
  "treasury_bond",
  "collectibles",
  "real_estate",
  "other",
  "precious_metals",
  "cash",
  // 9.2 — brokerage/cash account: deposited value vs actual value, no instrument.
  "broker",
  // Bank savings deposit: principal + annual rate + capitalization cadence.
  "deposit",
  // Manual savings pot: starting + current amount, %change; no rate, no qty.
  "savings",
  // Physical possession: name + single current amount + a per-item icon.
  "possession",
] as const;

/** Phase 9.1/9.2 — user-facing type the add/edit form was filled with. */
export const uiTypeSchema = z.preprocess(
  normalizeLegacyUiType,
  z.enum(UI_TYPES),
);
export type UiTypeInput = (typeof UI_TYPES)[number];

/** The investment type-group keys (possessions are wallets, not a group). */
export const UI_TYPE_KEYS = UI_TYPES.filter(
  (t): t is Exclude<UiTypeInput, "possession"> => t !== "possession",
);

/** Coarse holding_type each ui_type maps to (price routing / asset_class). */
export const UI_TYPE_TO_HOLDING_TYPE: Record<UiTypeInput, HoldingTypeInput> = {
  stocks: "equities",
  crypto: "crypto",
  treasury_bond: "bond",
  collectibles: "other",
  real_estate: "real_estate",
  other: "other",
  precious_metals: "commodity",
  cash: "cash_fx",
  broker: "other",
  deposit: "deposit",
  savings: "savings",
  possession: "possession",
};

/** Deposit interest capitalization cadence. */
export const capFrequencySchema = z.enum([
  "daily",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
]);
export type CapFrequencyInput = z.infer<typeof capFrequencySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A user-picked entry date: past allowed, future refused (D-06). One day of
 *  slack so a user ahead of UTC can still pick their own today. */
export const notFutureIsoDate = isoDate.refine(
  (d) => d <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  "future_date",
);

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

// SEC: reject non-finite / absurd magnitudes at the DTO boundary. These values
// flow into Big()/BigInt() money math and wealth/net-worth aggregates; an
// unbounded string like "9e99" or "1e300" is otherwise accepted and poisons
// every portfolio sum for the tenant. The ceiling is far above any real holding
// yet finite and safely bounded.
const SANE_NUMERIC_MAX = 1e15;
const isSaneMagnitude = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= SANE_NUMERIC_MAX;
};

/** Normalize "1.234,56" / "1,5" → dot-decimal string (big.js-safe). */
const numericString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/\s/g, "").replace(/,/g, ".").trim())
  // Refine AFTER normalization — the input may be a locale string ("1,5") whose
  // raw Number() is NaN; only the dot-decimal result is a valid number to bound.
  .refine(isSaneMagnitude, "number out of range");

/** Cents value as bigint-string or number (DTO boundary rule). */
const centsInput = z
  .union([z.string(), z.number()])
  .refine(isSaneMagnitude, "cents out of range");

export const createHoldingSchema = z.object({
  name: z.string().min(1).max(120),
  holdingType: holdingTypeSchema,
  uiType: uiTypeSchema.nullish(),
  /** Possession-only: curated icon key (e.g. "car", "home"); null otherwise. */
  icon: z.string().max(40).nullish(),
  /** Possession-only: hex color (e.g. "#e63946"); null otherwise. */
  color: z.string().max(40).nullish(),
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
  // Deposit attributes (nullish for every other type). The principal + currency
  // ride buyPriceCents / buyCurrency; these describe how it accrues.
  /** Annual interest rate in basis points (525 = 5.25%). */
  depositRateBps: z.coerce.number().int().min(0).max(1_000_000).nullish(),
  /** First day interest accrues, 'YYYY-MM-DD'. */
  depositStartDate: isoDate.nullish(),
  /** Optional maturity 'YYYY-MM-DD'; value freezes on/after it. */
  depositEndDate: isoDate.nullish(),
  depositCapFrequency: capFrequencySchema.nullish(),
  /** Phase 13: date of the first history entry (default today). */
  openedOn: notFutureIsoDate.optional(),
});
export type CreateHoldingInput = z.infer<typeof createHoldingSchema>;

/** D-12: per-budget type-group order. */
export const typeOrderSchema = z.object({
  order: z
    .array(z.enum(UI_TYPE_KEYS as [string, ...string[]]))
    .max(11)
    .refine((a) => new Set(a).size === a.length, "duplicate_type"),
});

export interface TypeSummaryDto {
  currency: string;
  order: string[];
  types: Record<
    string,
    { realizedBudgetCents: string; soldCostBudgetCents: string }
  >;
  /** R6-6: the same sums per asset (holding id), plus its realized in the
   *  asset's own currency (what the asset row shows). */
  holdings: Record<
    string,
    {
      realizedBudgetCents: string;
      soldCostBudgetCents: string;
      realizedAssetCents: string;
      assetCurrency: string;
    }
  >;
}

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
  /** Possession-only curated icon key (e.g. "car"); null for every other type. */
  icon: string | null;
  /** Possession-only hex color (e.g. "#e63946"); null for every other type. */
  color: string | null;
  instrumentId: string | null;
  metal: string | null;
  metalKind: string | null;
  unitOfMeasure: string | null;
  /** Precious-metals bullion premium over spot (percent string); null = none. */
  premiumPct: string | null;
  /** Tracked-instrument ticker (e.g. AAPL); null for custom/cash/metals. */
  symbol: string | null;
  /** Tracked-instrument display name (e.g. "Bitcoin (BTC)"); lets the UI tell a
   *  user-chosen custom `name` from the auto label. null for custom/cash/metals. */
  instrumentName: string | null;
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
  /** ISO time the auto-fetched price was last refreshed (hourly cron); null for
   *  manual/cash holdings or no cache row. Lets the UI show the real price age. */
  priceFetchedAt: string | null;
  /** value in the holding's current-price currency (cents, string). */
  valueCents: string;
  /** value in the budget default currency (cents, string). */
  valueInBudgetCents: string;
  /** cost basis (buy_price × quantity) in the budget default currency (cents,
   *  string). "0" when there is no buy price (cash). Powers the Overview
   *  cost-basis / P-L math. */
  costInBudgetCents: string;
  /** signed P/L %, 1 decimal; null for cash / no-basis. */
  profitLossPct: number | null;
  /** signed absolute P/L in cents (buy-currency basis); null for cash / no-basis.
   *  Computed server-side from the real cost basis so a near-total loss stays a
   *  real number (the client must NOT back-derive it from value + rounded pct). */
  profitLossCents: string | null;
  /** R6 (user): avg buy price and P/L in the SHOWN currency (the value
   *  currency) — the cost basis converted at today's rate, display only. */
  avgPriceDisplayCents: string | null;
  profitLossDisplayCents: string | null;
  /** weight % within group (grouped) or whole portfolio (ungrouped). */
  weightPct: number;
  sortOrder: number;
  createdAt: string;
  // Deposit-only (null otherwise) — echoed back so the edit form can prefill.
  depositRateBps: number | null;
  depositStartDate: string | null;
  depositEndDate: string | null;
  depositCapFrequency: string | null;
}

// ─── Phase 13.1: assets with a ledger ────────────────────────────────────────
// Every id is a uuid and every cents field is a plain digit string BEFORE it
// reaches BigInt() (13 review WR-01/WR-02: SyntaxError used to surface as 500).

/** Non-negative integer cents, digits only (no sign, decimals, exponent). */
export const centsString = z
  .string()
  .regex(/^\d{1,18}$/, "invalid_cents")
  .refine(isSaneMagnitude, "cents out of range");
/** CR-03: money the user moves must be > 0. */
// Zod v4 still runs refines after a failed regex — guard before BigInt().
export const positiveCents = centsString.refine(
  (v) => /^\d+$/.test(v) && BigInt(v) > 0n,
  "positive",
);
/** Quantity > 0 with at most 8 decimals (IN-02: no rounding up to a full sale). */
const qtyString = numericString.refine(
  (v) => /^\d+(\.\d{1,8})?$/.test(v),
  "qty_precision",
);
export const positiveQty = qtyString.refine((v) => Number(v) > 0, "positive");
export const uuidParam = z.uuid();

const label = (max: number) => z.string().trim().min(1).max(max);

/** D-08 Swap → Buy. Quantity types / cash & savings / broker add. */
export const buyAssetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("quantity"),
    quantity: positiveQty,
    priceCents: positiveCents,
    currency: currencyCode,
    effectiveDate: notFutureIsoDate,
  }),
  z.object({
    kind: z.literal("amount"),
    amountCents: positiveCents,
    currency: currencyCode,
    effectiveDate: notFutureIsoDate,
  }),
  z.object({
    kind: z.literal("broker"),
    amountCents: positiveCents,
    valueAfterCents: centsString,
    effectiveDate: notFutureIsoDate,
  }),
]);
export type BuyAssetInput = z.infer<typeof buyAssetSchema>;

/** D-06 Edit: label, display currency, hand value/price — nothing ledger-owned
 *  (CR-01 root cause). strict: unknown keys are a 400, not silently dropped. */
export const editAssetSchema = z
  .strictObject({
    name: label(120).optional(),
    displayCurrency: currencyCode.optional(),
    currentValueCents: centsString.optional(),
    // A unit price keeps 6 sub-cent places: a total typed for several units
    // only multiplies back exactly from a fractional unit price (261023).
    currentPriceCents: z
      .string()
      .regex(/^\d{1,18}(\.\d{1,6})?$/, "invalid_cents")
      .refine((v) => Number(v) > 0, "positive")
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "empty_edit");
export type EditAssetInput = z.infer<typeof editAssetSchema>;

export const WALLET_TYPES = [
  "SPENDINGS",
  "CUSHION",
  "RESERVE",
  "POSSESSION",
  "OTHER",
] as const;

/** D-20/D-22/D-23 where Out-of-investments money lands. */
export const walletTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), walletId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    name: label(80),
    walletType: z.enum(WALLET_TYPES),
    currency: currencyCode,
  }),
  z.object({ kind: z.literal("nowhere") }),
]);
export type WalletTargetInput = z.infer<typeof walletTargetSchema>;

/** D-09 Swap → Sell. `left` = what stays; destination New names an asset label
 *  (find-or-create), Out may credit a wallet. */
export const sellAssetSchema = z.object({
  effectiveDate: notFutureIsoDate,
  left: z.union([
    z.object({ quantity: qtyString }),
    z.object({ valueCents: centsString }),
  ]),
  destination: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("new"),
      // currentPriceCents = the instrument's live price (tracked) — the buy
      // price is priceCents, never received ÷ quantity (13.1 UAT 10).
      holding: createHoldingSchema
        .omit({ buyPriceCents: true, openedOn: true })
        .extend({ name: label(120), quantity: positiveQty.optional() }),
      priceCents: positiveCents.optional(),
    }),
    z.object({
      kind: z.literal("existing"),
      holdingId: z.uuid(),
      // Priced at the destination's own price unless one is typed (R6, user:
      // never locked) — priceCents is per unit, in the received currency.
      quantityBought: positiveQty.optional(),
      priceCents: positiveCents.optional(),
    }),
    z.object({
      kind: z.literal("out"),
      wallet: walletTargetSchema.default({ kind: "nowhere" }),
    }),
  ]),
  // Out / amount destinations only; a quantity destination's received is
  // quantity × price, computed by the server.
  receivedCents: positiveCents.optional(),
  receivedCurrency: currencyCode,
});
export type SellAssetInput = z.infer<typeof sellAssetSchema>;

/** D-10 Swap → Transfer: same type, existing asset or a new label. */
export const transferAssetSchema = z.object({
  effectiveDate: notFutureIsoDate,
  move: z.union([
    z.object({ quantity: positiveQty }),
    z.object({ valueCents: positiveCents }),
  ]),
  to: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("existing"), holdingId: z.uuid() }),
    z.object({ kind: z.literal("new"), name: label(120) }),
  ]),
});
export type TransferAssetInput = z.infer<typeof transferAssetSchema>;

/** D-02 autocomplete over a type's assets, hidden ones included. */
export const assetNamesQuerySchema = z.object({ type: uiTypeSchema });

export interface AssetNameDto {
  id: string;
  name: string;
  archived: boolean;
  instrumentId: string | null;
  /** Trimmed quantity ("10", "1.5") — the list says what each asset is. */
  quantity: string;
  valueCents: string | null;
  valueCurrency: string | null;
  /** How the UI names the unit ("1 BTC", "3 oz") — see instrumentLabel. */
  symbol: string | null;
  instrumentName: string | null;
  holdingType: string;
  unitOfMeasure: string | null;
}

export type EntryKind =
  | "start"
  | "buy"
  | "add"
  | "value_change"
  | "withdraw"
  | "convert_out"
  | "convert_in"
  | "transfer_out"
  | "transfer_in"
  | "price_change"
  | "interest";

/** One L3 ledger line. `deletable` is computed by the server (D-14/D-16). */
export interface EntryDto {
  /** null for synthesized deposit interest rows (D-19). */
  id: string | null;
  kind: EntryKind;
  effectiveDate: string;
  createdAt: string | null;
  qtyDelta: string | null;
  /** What the ledger shows as "±qty": qtyDelta, or ±1 for a one-unit
   *  quantity asset's value entry (round-2 gap 13). */
  displayQty: string | null;
  priceCents: string | null;
  /** Signed, in amountCurrency. */
  amountCents: string | null;
  amountCurrency: string | null;
  displayAmountCents: string | null;
  displayCurrency: string | null;
  realizedBudgetCents: string | null;
  /** R6: realized in the asset's currency (exact deal figure, else the sale-date rate). */
  realizedCents: string | null;
  realizedCurrency: string | null;
  budgetCurrency: string | null;
  counterpartyName: string | null;
  /** Round 4: the partner asset + shared transfer id, so a linked row can
   *  open its partner entry. null unless linked. */
  counterpartyHoldingId: string | null;
  transferId: string | null;
  linked: boolean;
  walletName: string | null;
  walletDelta: string | null;
  backfilled: boolean;
  deletable: boolean;
  blockedReason: "not_newest" | "linked_not_newest" | "interest" | null;
  /** Deleting it wipes the asset (D-17). */
  isLastEntry: boolean;
}

/** Error codes the 13.1 routes may return, by HTTP status. */
export const INVESTMENT_ERRORS = {
  422: [
    "before_latest_entry",
    "before_deposit_start",
    "wallet_currency_mismatch",
    "fx_unavailable",
    "deposit_not_allowed",
    "shape_mismatch",
    "transfer_type_mismatch",
    "transfer_same_asset",
    "transfer_instrument_mismatch",
    "move_qty_out_of_range",
    "sell_qty_out_of_range",
    "qty_precision",
    "invalid_cents",
  ],
  409: ["not_newest", "linked_not_newest", "stale"],
  404: ["not_found"],
} as const;
