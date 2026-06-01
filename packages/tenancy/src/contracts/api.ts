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
  // Phase 6 onboarding rewrite: pure cushion feature flag. When false the
  // cushion column is hidden entirely. Default true so legacy budgets keep
  // existing UX.
  cushionEnabled?: boolean;
  // Phase 7-09 / UAT round 6: desired cushion runway in months (1..60).
  // Settable via PATCH /budgets/:id { cushion_target_months }; default 6.
  // Surfaced on findById so the Settings page can read the current value.
  cushionTargetMonths?: number;
  // Tasks redesign P2: count of PENDING tasks scoped to this budget's tenant.
  // Populated by listForUser via LEFT JOIN against budgeting.tasks; 0 when none.
  pendingTasksCount: number;
}

export interface MemberDTO {
  budgetId: string;
  userId: string;
  role: "owner" | "member";
  joinedAt: Date;
  /** Display name from identity.users — undefined if row missing */
  name?: string;
  /** Email from identity.users — undefined if row missing */
  email?: string;
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
