-- 0053_income_under_planned_task.sql (r33)
-- Adds the INCOME_UNDER_PLANNED task kind ("review your spendings" — income < total
-- planned) plus its per-budget dedup index. Hand-authored, idempotent.

-- Postgres cannot ALTER a CHECK in place — DROP then ADD. Adds the 5th kind
-- INCOME_UNDER_PLANNED; nothing removed.
ALTER TABLE budgeting.tasks DROP CONSTRAINT IF EXISTS tasks_kind_chk;

--> statement-breakpoint
ALTER TABLE budgeting.tasks
  ADD CONSTRAINT tasks_kind_chk
  CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET','INVESTMENT_INSTRUMENT_DELISTED','INCOME_UNDER_PLANNED'));

--> statement-breakpoint
-- At most one OPEN income-under-planned task per budget. The generator re-runs on
-- every income/limit change; ON CONFLICT (budget_id) DO UPDATE refreshes the live
-- shortfall against this index. Mirrors tasks_cushion_below_target_dedup_idx (0026).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_income_under_planned_dedup_idx
  ON budgeting.tasks (budget_id)
  WHERE kind = 'INCOME_UNDER_PLANNED' AND status = 'PENDING';
