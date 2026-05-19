/**
 * api.ts — Budgeting context DTOs and Zod schemas
 * Used by both the API route layer and application use cases.
 */
import { z } from "zod";

// Wallet schemas (renamed from Account in Plan 01-02, v1.1 schema)
export const walletTypeSchema = z.enum(["SPENDINGS", "CUSHION", "RESERVE"]);

// UAT-PH5-T3-1x: per-wallet color + icon. Optional on create; can be patched
// later via updateWalletSchema. Color is a hex string ("#RRGGBB") or a known
// token (we accept anything 1..32 chars and let the frontend canonicalize the
// palette). Icon is a lucide-react icon name (slug form, e.g. "piggy-bank").
const walletColorSchema = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[#A-Za-z0-9_-]+$/);
const walletIconSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export const createWalletSchema = z.object({
  name: z.string().min(1).max(120),
  walletType: walletTypeSchema,
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/), // 3-char fiat or 3-5-char crypto
  color: walletColorSchema.nullish(),
  icon: walletIconSchema.nullish(),
});

// UAT-PH5-T3-1x: reorder a section's wallets by sending the new ordered list
// of wallet ids. Server applies positions 1..N within that section.
export const reorderWalletsSchema = z.object({
  walletType: walletTypeSchema,
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderWalletsInput = z.infer<typeof reorderWalletsSchema>;

export type CreateWalletInput = z.infer<typeof createWalletSchema>;

export interface WalletDto {
  id: string;
  name: string;
  walletType: string;
  currency: string;
  /** Balance expressed as integer cents string (e.g. "25000" = 250.00). */
  currentBalanceCents: string;
  /**
   * UAT-PH5-T3-46: balance converted to the budget's default currency
   * via the FxProvider. Populated by the route layer when budget
   * currency is known; the use case itself does not perform FX. Reflects
   * the latest cached FX rate (Frankfurter, daily refresh). Same units
   * as `currentBalanceCents` (integer cents string). Optional because
   * tests/standalone callers that bypass the route layer may not
   * supply it; UI must fall back to `currentBalanceCents` when missing.
   */
  currentBalanceInBudgetCurrencyCents?: string;
  archivedAt: string | null;
  createdAt: string;
  // UAT-PH5-T3-1x: presentation-only customization + intra-section position.
  color: string | null;
  icon: string | null;
  sortOrder: number;
}

// Backward-compat aliases — Plan 01-03 (route layer) removes these
/** @deprecated use createWalletSchema */
export const createAccountSchema = createWalletSchema;
/** @deprecated use CreateWalletInput */
export type CreateAccountInput = CreateWalletInput;
/** @deprecated use WalletDto */
export type AccountDto = WalletDto;

/**
 * setBalanceSchema — used by PUT /wallets/:id/balance (D-PH2-09 amended).
 * Overwrites current_balance to an absolute value. No `reason` field —
 * wallet balance edits are not separately audited via a dedicated table
 * (the old account_balance_adjustments table was dropped by migration 0013).
 */
export const setBalanceSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d+)?$/), // signed decimal (negative allowed for overdraft)
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
});

export type SetBalanceInput = z.infer<typeof setBalanceSchema>;

// ---------------------------------------------------------------------------
// Category schemas (BDGT-01..06) — scope dropped in Plan 01-02 (D-13)
// ---------------------------------------------------------------------------

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// CategoryLimit schemas (BDGT-03..05, D-04-b,c)
// ---------------------------------------------------------------------------

export const setLimitSchema = z.object({
  normalAmount: z.string().regex(/^\d+$/), // bigint cents as string
  // Currencies optional — when omitted the API derives both from the active
  // workspace's default_currency. The form does not ask the user to pick.
  normalCurrency: z
    .string()
    .regex(/^[A-Z0-9]{3,5}$/)
    .optional(),
  cushionAmount: z.string().regex(/^\d+$/),
  cushionCurrency: z
    .string()
    .regex(/^[A-Z0-9]{3,5}$/)
    .optional(),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type SetCategoryLimitInput = z.infer<typeof setLimitSchema>;

export interface CategoryLimitDto {
  id: string;
  categoryId: string;
  normalAmount: string;
  normalCurrency: string;
  cushionAmount: string;
  cushionCurrency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// BudgetTemplate schemas (BDGT-07, D-04-d)
// ---------------------------------------------------------------------------

export const templateItemSchema = z.object({
  categoryId: z.string().uuid(),
  normalAmount: z.string().regex(/^\d+$/),
  normalCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  cushionAmount: z.string().regex(/^\d+$/),
  cushionCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(templateItemSchema).min(1),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const applyTemplateSchema = z.object({
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
});

export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;

// ---------------------------------------------------------------------------
// ShareOverride schemas (BDGT-08)
// ---------------------------------------------------------------------------

export const shareOverrideEntrySchema = z.object({
  userId: z.string().uuid(),
  percentage: z.string().regex(/^\d+(\.\d{1,4})?$/),
});

export const setShareOverridesSchema = z.object({
  entries: z.array(shareOverrideEntrySchema).min(1),
});

export type SetShareOverridesInput = z.infer<typeof setShareOverridesSchema>;

export interface ShareOverrideDto {
  categoryId: string;
  userId: string;
  percentage: string;
}

// ---------------------------------------------------------------------------
// BudgetMode schemas (D-04-e)
// ---------------------------------------------------------------------------

export const setBudgetModeSchema = z.object({
  mode: z.enum(["NORMAL", "CUSHION"]),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type SetBudgetModeInput = z.infer<typeof setBudgetModeSchema>;

export interface BudgetModeDto {
  id: string;
  workspaceId: string;
  mode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Transaction schemas (EXPN-01, -02, -03, -11, -13)
// ---------------------------------------------------------------------------

const fxPreviewSchema = z
  .object({
    rate: z.string().regex(/^\d+(\.\d+)?$/),
    fxRateDate: z.string(), // ISO date string 'YYYY-MM-DD' or ISO timestamp
  })
  .optional()
  .nullable();

export const createTransactionSchema = z.discriminatedUnion("kind", [
  // SPENDING (renamed from EXPENSE in v1.1, TXN-07)
  z.object({
    kind: z.literal("SPENDING"),
    amountOrig: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .refine((v) => parseFloat(v) > 0, "amount must be positive"),
    currencyOrig: z.string().regex(/^[A-Z0-9]{3,5}$/),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().uuid(),
    categoryId: z.string().uuid().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    fxPreview: fxPreviewSchema,
  }),
  // INCOME
  z.object({
    kind: z.literal("INCOME"),
    amountOrig: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .refine((v) => parseFloat(v) > 0, "amount must be positive"),
    currencyOrig: z.string().regex(/^[A-Z0-9]{3,5}$/),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().uuid(),
    categoryId: z.string().uuid().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    fxPreview: fxPreviewSchema,
  }),
]);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// ---------------------------------------------------------------------------
// Recurring rules schemas (EXPN-08, plan 02-08)
// ---------------------------------------------------------------------------

export const cadenceSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

/**
 * Discriminated union for cadence + required selectors (RECR-01 / D-PH2-03).
 * Enforces per-cadence required fields at Zod level; DB CHECK mirrors this.
 */
export const cadenceSpecSchema = z.discriminatedUnion("cadence", [
  z.object({ cadence: z.literal("DAILY") }),
  z.object({
    cadence: z.literal("WEEKLY"),
    weekly_dow: z.number().int().min(0).max(6),
  }),
  z.object({
    cadence: z.literal("MONTHLY"),
    cadence_anchor: z.number().int().min(1).max(31),
  }),
  z.object({
    cadence: z.literal("YEARLY"),
    yearly_month: z.number().int().min(1).max(12),
    cadence_anchor: z.number().int().min(1).max(31),
  }),
]);

/** Base fields common to all cadences */
const createRecurringRuleBaseSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((v) => parseFloat(v) > 0, "amount must be positive"),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  note: z.string().max(500).nullable().optional(),
  first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const createRecurringRuleSchema = z.intersection(
  createRecurringRuleBaseSchema,
  cadenceSpecSchema,
);

export type CreateRecurringRuleInput = z.infer<
  typeof createRecurringRuleSchema
>;

const ruleEditsSchema = z
  .object({
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .refine((v) => parseFloat(v) > 0, "amount must be positive")
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z0-9]{3,5}$/)
      .optional(),
    categoryId: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const updateRecurringRuleSchema = z.object({
  edits: ruleEditsSchema,
  /**
   * REQUIRED — no .default(). Caller MUST pass explicitly.
   * D-01-d: missing field → 422. UI pre-checks "Also apply to future occurrences".
   */
  applyToFuture: z.boolean(),
});

export type UpdateRecurringRuleInput = z.infer<
  typeof updateRecurringRuleSchema
>;

// Draft action schemas
export const confirmDraftSchema = z.object({});

const draftEditsSchema = z
  .object({
    amountOriginalCents: z.string().regex(/^\d+$/).optional(),
    currency: z
      .string()
      .regex(/^[A-Z0-9]{3,5}$/)
      .optional(),
    categoryId: z.string().uuid().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

export const editConfirmDraftSchema = z.object({
  edits: draftEditsSchema,
  fxPreview: z
    .object({
      rate: z.string().regex(/^\d+(\.\d+)?$/),
      fxRateDate: z.string(),
    })
    .nullable()
    .optional(),
});

export type EditConfirmDraftInput = z.infer<typeof editConfirmDraftSchema>;

export const skipDraftSchema = z.object({});

export interface RecurringRuleDto {
  id: string;
  tenantId: string;
  accountId: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  kind: string;
  cadence: string;
  cadenceAnchor: number | null;
  weeklyDow: number | null;
  note: string | null;
  active: boolean;
  nextDueDate: string;
  createdAt: string;
}

export interface RecurringDraftDto {
  id: string;
  tenantId: string;
  ruleId: string;
  dueDate: string;
  amount: string;
  currency: string;
  accountId: string;
  categoryId: string | null;
  kind: string;
  note: string | null;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
}

// ---------------------------------------------------------------------------
// Search + Bulk recategorize schemas (EXPN-09, EXPN-10, plan 02-09)
// ---------------------------------------------------------------------------

/**
 * Helper to coerce comma-separated query strings into string arrays.
 * Used for `categoryIds` and `accountIds` in GET /transactions?categoryIds=a,b,c
 */
const csvUuidArray = z
  .union([z.string(), z.array(z.string().uuid())])
  .optional()
  .transform((v): string[] | undefined => {
    if (v === undefined) return undefined;
    if (Array.isArray(v)) return v;
    if (v.length === 0) return undefined;
    return v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  });

export const searchTransactionsSchema = z.object({
  q: z.string().max(500).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  categoryIds: csvUuidArray,
  accountIds: csvUuidArray,
  kind: z.enum(["SPENDING", "INCOME"]).optional(),
  cursorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cursorId: z.string().uuid().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined) return 50;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      return Number.isFinite(n) ? Math.min(Math.max(n, 1), 200) : 50;
    }),
});

export type SearchTransactionsQuery = z.infer<typeof searchTransactionsSchema>;

export const bulkRecategorizeSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
  newCategoryId: z.string().uuid(),
});

export type BulkRecategorizeBody = z.infer<typeof bulkRecategorizeSchema>;

// ─── Phase 5 Wallets PATCH ─────────────────────────────────────────────────
/**
 * updateWalletSchema — partial PATCH body for /wallets/:id.
 * Whitelist of fields (mass-assignment defense, T-05-13).
 * `.strict()` rejects unknown keys. `.refine` rejects empty body.
 * Reserve-currency invariant enforced in the application use case (Plan 03).
 * UAT-PH5-T3-1x: `color` and `icon` are presentation-only and nullable —
 * sending null clears the customization back to "no color / no icon".
 */
export const updateWalletSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amount: z
      .string()
      .regex(/^-?\d+(\.\d{1,4})?$/, "amount must be numeric")
      .optional(),
    walletType: walletTypeSchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z0-9]{3,5}$/, "currency must be 3-5 uppercase chars")
      .optional(),
    color: walletColorSchema.nullable().optional(),
    icon: walletIconSchema.nullable().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "empty_body" });

export type UpdateWalletBody = z.infer<typeof updateWalletSchema>;

// ─── Phase 5 Reserves Adjustment ───────────────────────────────────────────
/**
 * reserveAdjustmentSchema — body for POST /budgets/:id/reserves/:catId/adjust.
 * deltaCents is signed (negative = withdraw).
 */
export const reserveAdjustmentSchema = z
  .object({
    deltaCents: z
      .number()
      .int()
      .refine((n) => n !== 0, { message: "delta_zero" }),
    note: z.string().trim().max(280).optional(),
  })
  .strict();

export type ReserveAdjustmentBody = z.infer<typeof reserveAdjustmentSchema>;

// ─── Phase 5 Category Reserve Exclude ──────────────────────────────────────
/**
 * categoryReserveExcludeSchema — body for PATCH /budgets/:id/categories/:catId/reserve-excluded.
 */
export const categoryReserveExcludeSchema = z
  .object({
    excluded: z.boolean(),
  })
  .strict();

export type CategoryReserveExcludeBody = z.infer<
  typeof categoryReserveExcludeSchema
>;

// ---------------------------------------------------------------------------

/** @deprecated v1.0 DTO shape — use TransactionRow from ports/transaction-repo instead */
export interface TransactionDto {
  id: string;
  tenantId: string;
  kind: string;
  amountOrig: string;
  currencyOrig: string;
  amountDefault: string;
  currencyDefault: string;
  fxRate: string;
  fxRateDate: string;
  fxProvider: string;
  transactionDate: string;
  note: string | null;
  accountId: string;
  categoryId: string | null;
  transferGroupId: string | null;
  createdAt: string;
  isStale: boolean;
}
