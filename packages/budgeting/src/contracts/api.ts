/**
 * api.ts — Budgeting context DTOs and Zod schemas
 * Used by both the API route layer and application use cases.
 */
import { z } from "zod";

// Account schemas
export const accountKindSchema = z.enum([
  "CASH",
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "LOAN",
  "INVESTMENT",
]);

export const accountScopeSchema = z.enum(["PERSONAL", "SHARED"]);

export const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  kind: accountKindSchema,
  // scope is optional — when omitted the API derives it from the active
  // workspace's kind (PRIVATE → PERSONAL, SHARED → SHARED).
  scope: accountScopeSchema.optional(),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/), // 3-char fiat or 3-5-char crypto
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;

export interface AccountDto {
  id: string;
  name: string;
  kind: string;
  scope: string;
  currency: string;
  currentBalance: string;
  archivedAt: string | null;
  createdAt: string;
}

export const adjustBalanceSchema = z.object({
  amount: z.string().regex(/^-?\d+(\.\d+)?$/), // signed decimal
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  reason: z.string().min(1).max(500),
});

export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

// ---------------------------------------------------------------------------
// Category schemas (BDGT-01..06)
// ---------------------------------------------------------------------------

export const categoryScopeSchema = z.enum(["PERSONAL", "SHARED"]);

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  // scope is optional — when omitted, the API derives it from the active
  // workspace's kind (PRIVATE → PERSONAL, SHARED → SHARED).
  scope: categoryScopeSchema.optional(),
  parentId: z.string().uuid().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  scope: string;
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
  normalCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
  cushionAmount: z.string().regex(/^\d+$/),
  cushionCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

const fxPreviewSchema = z.object({
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  fxRateDate: z.string(), // ISO date string 'YYYY-MM-DD' or ISO timestamp
}).optional().nullable();

export const createTransactionSchema = z.discriminatedUnion("kind", [
  // EXPENSE
  z.object({
    kind: z.literal("EXPENSE"),
    amountOrig: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive"),
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
    amountOrig: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive"),
    currencyOrig: z.string().regex(/^[A-Z0-9]{3,5}$/),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().uuid(),
    categoryId: z.string().uuid().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    fxPreview: fxPreviewSchema,
  }),
  // TRANSFER
  z.object({
    kind: z.literal("TRANSFER"),
    amountOrig: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive"),
    currencyOrig: z.string().regex(/^[A-Z0-9]{3,5}$/),
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accountId: z.string().uuid(), // from-account
    toAccountId: z.string().uuid().optional(),
    note: z.string().max(500).optional().nullable(),
    fxPreview: fxPreviewSchema,
  }),
]);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// ---------------------------------------------------------------------------
// Correction schemas (EXPN-06, plan 02-07)
// ---------------------------------------------------------------------------

/** Edits that can be applied via the correction-row path. */
const correctionEditsSchema = z.object({
  amountOrig: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive").optional(),
  currencyOrig: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().optional(),
  note: z.string().max(500).nullable().optional(),
  // FX result (computed server-side if amount/currency/date changed):
  amountDefault: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  fxRate: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  fxRateDate: z.string().optional(),
  fxProvider: z.string().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  "At least one field must be provided for correction",
);

const fxPreviewCorrectionSchema = z.object({
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  fxRateDate: z.string(),
}).optional().nullable();

export const correctTransactionSchema = z.object({
  edits: correctionEditsSchema,
  fxPreview: fxPreviewCorrectionSchema,
});

export type CorrectTransactionInput = z.infer<typeof correctTransactionSchema>;

// ---------------------------------------------------------------------------
// Recurring rules schemas (EXPN-08, plan 02-08)
// ---------------------------------------------------------------------------

export const cadenceSchema = z.enum(["MONTHLY", "WEEKLY"]);

export const createRecurringRuleSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive"),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  cadence: cadenceSchema,
  cadenceAnchor: z.number().int().min(1).max(31).nullable().optional(),
  weeklyDow: z.number().int().min(0).max(6).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;

const ruleEditsSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((v) => parseFloat(v) > 0, "amount must be positive").optional(),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().optional(),
  note: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
}).strict();

export const updateRecurringRuleSchema = z.object({
  edits: ruleEditsSchema,
  /**
   * REQUIRED — no .default(). Caller MUST pass explicitly.
   * D-01-d: missing field → 422. UI pre-checks "Also apply to future occurrences".
   */
  applyToFuture: z.boolean(),
});

export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;

// Draft action schemas
export const confirmDraftSchema = z.object({});

const draftEditsSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  currency: z.string().regex(/^[A-Z0-9]{3,5}$/).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
  note: z.string().max(500).nullable().optional(),
}).strict();

export const editConfirmDraftSchema = z.object({
  edits: draftEditsSchema,
  fxPreview: z.object({
    rate: z.string().regex(/^\d+(\.\d+)?$/),
    fxRateDate: z.string(),
  }).nullable().optional(),
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
    return v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  });

export const searchTransactionsSchema = z.object({
  q: z.string().max(500).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryIds: csvUuidArray,
  accountIds: csvUuidArray,
  kind: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
  cursorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  correctsId: string | null;
  createdAt: string;
  isStale: boolean;
}
