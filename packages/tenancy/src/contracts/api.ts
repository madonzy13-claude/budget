export type BudgetKind = "PRIVATE" | "SHARED";

export interface BudgetDTO {
  id: string;
  slug: string; // nanoid(12)
  name: string;
  kind: BudgetKind;
  default_currency: string; // ISO-4217 immutable post-create (D-04)
  ownerUserId: string;
  memberCount: number;
  createdAt: Date;
  cushionModeEnabled?: boolean;
  // D-PH5-R11: global reserves toggle; default true preserves existing UX.
  reservesEnabled?: boolean;
}

export interface MemberDTO {
  budgetId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: Date;
}

export interface MemberShareDTO {
  budgetId: string;
  userId: string;
  percentage: string; // string for big.js precision (5,2)
  updatedAt: Date;
}

// Backward-compat aliases — Plan 01-03 removes these
/** @deprecated use BudgetKind */
export type WorkspaceKind = BudgetKind;
/** @deprecated use BudgetDTO */
export type WorkspaceDTO = BudgetDTO;
