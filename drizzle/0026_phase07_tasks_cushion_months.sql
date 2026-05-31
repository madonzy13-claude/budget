-- Phase 7: Tasks queue — kind constraint update + cushion_target_months + dedup indexes
-- Per CONTEXT.md D-PH7-01, D-PH7-02, D-PH7-15.
-- Drops the prior 4-kind tasks_kind_chk (two legacy kinds dropped from v1.1 scope).
-- Adds 3-kind constraint (RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET).
-- Adds tenancy.budgets.cushion_target_months (NOT NULL DEFAULT 6, CHECK 1..60).
-- Adds three partial unique indexes for emit-time dedup (ON CONFLICT DO NOTHING contracts).
-- Safe: zero rows of the dropped kinds exist in any environment
--       (no code ever inserted them — Phase 1 just defined the enum).

--> statement-breakpoint

ALTER TABLE "budgeting"."tasks" DROP CONSTRAINT IF EXISTS "tasks_kind_chk";

--> statement-breakpoint

ALTER TABLE "budgeting"."tasks"
  ADD CONSTRAINT "tasks_kind_chk"
  CHECK ("kind" IN ('RESERVE_TOPUP','CONFIRM_DRAFT','CUSHION_BELOW_TARGET'));

--> statement-breakpoint

ALTER TABLE "tenancy"."budgets"
  ADD COLUMN IF NOT EXISTS "cushion_target_months" INTEGER NOT NULL DEFAULT 6
  CHECK ("cushion_target_months" > 0 AND "cushion_target_months" <= 60);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_reserve_topup_pending_uq"
  ON "budgeting"."tasks"("budget_id")
  WHERE "kind" = 'RESERVE_TOPUP' AND "status" = 'PENDING';

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_cushion_below_target_pending_uq"
  ON "budgeting"."tasks"("budget_id")
  WHERE "kind" = 'CUSHION_BELOW_TARGET' AND "status" = 'PENDING';

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "tasks_confirm_draft_pending_uq"
  ON "budgeting"."tasks"(((payload_json->>'draft_id')))
  WHERE "kind" = 'CONFIRM_DRAFT' AND "status" = 'PENDING';
