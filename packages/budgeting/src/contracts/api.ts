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
