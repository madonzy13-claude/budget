-- Phase 04 - Plan 04-01/04-02: Schema additions for spendings grid
-- Applied manually (drizzle-kit push not used for these additive-only changes
-- due to legacy expense_ledger schema divergence from initial Drizzle definition)

-- expense_ledger.dismissed_at: per-occurrence dismiss for recurring drafts (RECR-06)
-- NULL = not dismissed; non-NULL = dismissed_at timestamp for this occurrence only
ALTER TABLE budgeting.expense_ledger ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- Grant column-level UPDATE permission (expense_ledger has REVOKE UPDATE except specific columns)
GRANT UPDATE (dismissed_at) ON budgeting.expense_ledger TO app_role;

-- tenancy.budgets.timezone: IANA timezone string for budget-level date math (D-PH4-Q5)
-- Defaults 'UTC' so existing budgets get correct fallback
ALTER TABLE tenancy.budgets ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
