-- Phase 04 Plan 01: Add dismissed_at to expense_ledger
-- Allows a recurring draft to be dismissed (hidden) without deleting it.
-- Idempotent: IF NOT EXISTS guards make it safe to run on a DB that already has the column.
-- Note: DB spike on 2026-05-13 confirmed column already exists in live dev DB.

ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS expense_ledger_dismissed_at_null_idx
  ON budgeting.expense_ledger (tenant_id, confirmed_at)
  WHERE dismissed_at IS NULL AND confirmed_at IS NULL;
