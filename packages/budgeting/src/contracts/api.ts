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
  scope: accountScopeSchema,
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
  scope: categoryScopeSchema,
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
  normalCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/),
  cushionAmount: z.string().regex(/^\d+$/),
  cushionCurrency: z.string().regex(/^[A-Z0-9]{3,5}$/),
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
