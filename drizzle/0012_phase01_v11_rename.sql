-- Plan 01-01 (Phase 1 v1.1): rename workspaces→budgets, accounts→wallets;
-- drop legacy cols; add wallet_type/sort_index/cushion_mode_enabled/cushion_amount_cents;
-- create tasks table; rename budget_mode_history; rename budget_share_dirty.
-- Generated manually (drizzle-kit requires TTY; created by plan executor per RESEARCH §Q3).

-- 1. Create wallet_type enum in budgeting schema
CREATE TYPE "budgeting"."wallet_type" AS ENUM ('SPENDINGS','CUSHION','RESERVE');

--> statement-breakpoint

-- 2a. Rename tenancy.workspaces → tenancy.budgets
ALTER TABLE "tenancy"."workspaces" RENAME TO "budgets";

--> statement-breakpoint

-- 2b. Add cushion_mode_enabled to budgets (MIG-06, D-03)
ALTER TABLE "tenancy"."budgets" ADD COLUMN "cushion_mode_enabled" boolean NOT NULL DEFAULT false;

--> statement-breakpoint

-- 3. Rename FK constraint on budgets (slug unique stays; pkey stays)
-- Rename policies that referenced the old table name (Postgres renames them automatically on RENAME TABLE,
-- but post-migration.sql explicitly drops + recreates them idempotently — no action needed here)

-- 4a. Rename tenancy.workspace_members → tenancy.budget_members
ALTER TABLE "tenancy"."workspace_members" RENAME TO "budget_members";

--> statement-breakpoint

-- 4b. Rename workspace_id → budget_id on budget_members
ALTER TABLE "tenancy"."budget_members" RENAME COLUMN "workspace_id" TO "budget_id";

--> statement-breakpoint

-- 5a. Rename tenancy.shared_workspace_member_shares → tenancy.shared_budget_member_shares
ALTER TABLE "tenancy"."shared_workspace_member_shares" RENAME TO "shared_budget_member_shares";

--> statement-breakpoint

-- 5b. Rename workspace_id → budget_id on shared_budget_member_shares
ALTER TABLE "tenancy"."shared_budget_member_shares" RENAME COLUMN "workspace_id" TO "budget_id";

--> statement-breakpoint

-- 6a. Rename tenancy.workspace_invitations → tenancy.budget_invitations
ALTER TABLE "tenancy"."workspace_invitations" RENAME TO "budget_invitations";

--> statement-breakpoint

-- 6b. Rename workspace_id → budget_id on budget_invitations
ALTER TABLE "tenancy"."budget_invitations" RENAME COLUMN "workspace_id" TO "budget_id";

--> statement-breakpoint

-- 7. Rename budgeting.accounts → budgeting.wallets (MIG-02)
ALTER TABLE "budgeting"."accounts" RENAME TO "wallets";

--> statement-breakpoint

-- 8. Drop scope column + constraint from wallets (was accounts, MIG-03 partial)
ALTER TABLE "budgeting"."wallets" DROP CONSTRAINT IF EXISTS "accounts_scope_chk";

--> statement-breakpoint
ALTER TABLE "budgeting"."wallets" DROP COLUMN IF EXISTS "scope";

--> statement-breakpoint

-- 9. Add wallet_type column to wallets (MIG-04) with default SPENDINGS for existing rows
ALTER TABLE "budgeting"."wallets" ADD COLUMN "wallet_type" "budgeting"."wallet_type" NOT NULL DEFAULT 'SPENDINGS';

--> statement-breakpoint

-- 10. Drop old kind column + constraint from wallets (collapsed into wallet_type)
ALTER TABLE "budgeting"."wallets" DROP CONSTRAINT IF EXISTS "accounts_kind_chk";

--> statement-breakpoint
ALTER TABLE "budgeting"."wallets" DROP COLUMN IF EXISTS "kind";

--> statement-breakpoint

-- 11. Drop legacy columns from budgeting.expense_ledger (MIG-03)
-- Columns kind and account_id currently exist; to_account_id and direction do not.
-- Using conditional DO block per RESEARCH §Q-MIG-03 to be safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='kind') THEN
    EXECUTE 'ALTER TABLE "budgeting"."expense_ledger" DROP COLUMN "kind"';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='account_id') THEN
    EXECUTE 'ALTER TABLE "budgeting"."expense_ledger" DROP COLUMN "account_id"';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='to_account_id') THEN
    EXECUTE 'ALTER TABLE "budgeting"."expense_ledger" DROP COLUMN "to_account_id"';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='direction') THEN
    EXECUTE 'ALTER TABLE "budgeting"."expense_ledger" DROP COLUMN "direction"';
  END IF;
END $$;

--> statement-breakpoint

-- 12a. Drop scope column + constraint from categories (D-13)
ALTER TABLE "budgeting"."categories" DROP CONSTRAINT IF EXISTS "categories_scope_chk";

--> statement-breakpoint
ALTER TABLE "budgeting"."categories" DROP COLUMN IF EXISTS "scope";

--> statement-breakpoint

-- 13. Add sort_index to categories (MIG-07)
ALTER TABLE "budgeting"."categories" ADD COLUMN "sort_index" integer NOT NULL DEFAULT 0;

--> statement-breakpoint

-- 14. Add cushion_amount_cents to category_limits (MIG-05, D-11 — parallel SCD-2 col; nullable)
ALTER TABLE "budgeting"."category_limits" ADD COLUMN "cushion_amount_cents" bigint;

--> statement-breakpoint

-- 15a. Rename budgeting.workspace_budget_mode_history → budgeting.budget_mode_history
ALTER TABLE "budgeting"."workspace_budget_mode_history" RENAME TO "budget_mode_history";

--> statement-breakpoint

-- 15b. Rename workspace_id → budget_id on budget_mode_history
ALTER TABLE "budgeting"."budget_mode_history" RENAME COLUMN "workspace_id" TO "budget_id";

--> statement-breakpoint

-- 15c. Rename CHECK constraint on budget_mode_history (DROP old + ADD new)
ALTER TABLE "budgeting"."budget_mode_history" DROP CONSTRAINT IF EXISTS "workspace_budget_mode_chk";

--> statement-breakpoint
ALTER TABLE "budgeting"."budget_mode_history" ADD CONSTRAINT "budget_mode_chk" CHECK (mode IN ('NORMAL','CUSHION'));

--> statement-breakpoint

-- 15d. Rename the partial unique index (can't rename indexes in Postgres; drop + recreate)
DROP INDEX IF EXISTS "budgeting"."workspace_budget_mode_one_open";

--> statement-breakpoint
CREATE UNIQUE INDEX "budget_mode_one_open" ON "budgeting"."budget_mode_history" ("budget_id") WHERE effective_to IS NULL;

--> statement-breakpoint

-- 16a. Rename account_id → wallet_id on recurring_rules (MIG-02)
ALTER TABLE "budgeting"."recurring_rules" RENAME COLUMN "account_id" TO "wallet_id";

--> statement-breakpoint

-- 16b. Rename account_id → wallet_id on recurring_drafts (MIG-02)
ALTER TABLE "budgeting"."recurring_drafts" RENAME COLUMN "account_id" TO "wallet_id";

--> statement-breakpoint

-- 17. Rename account_id → wallet_id on account_balance_adjustments (D-12)
ALTER TABLE "budgeting"."account_balance_adjustments" RENAME COLUMN "account_id" TO "wallet_id";

--> statement-breakpoint

-- 18a. Rename budgeting.workspace_share_dirty → budgeting.budget_share_dirty
-- (conditional: workspace_share_dirty was created by post-migration.sql in older deploys;
-- fresh DB installs skip this step because post-migration.sql already creates budget_share_dirty)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='budgeting' AND table_name='workspace_share_dirty') THEN
    EXECUTE 'ALTER TABLE "budgeting"."workspace_share_dirty" RENAME TO "budget_share_dirty"';
    EXECUTE 'ALTER TABLE "budgeting"."budget_share_dirty" RENAME COLUMN "workspace_id" TO "budget_id"';
  END IF;
END $$;

--> statement-breakpoint

-- 19. Create budgeting.tasks table (MIG-08)
-- Note: CREATE TABLE is run by migrator role in production via 'make migrate'.
-- In dev the migration may be run as postgres superuser; the ownership reassign
-- below ensures migrator can always see the table via information_schema.
CREATE TABLE IF NOT EXISTS "budgeting"."tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "budget_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "payload_json" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "resolved_at" timestamptz,
  CONSTRAINT "tasks_kind_chk" CHECK (kind IN ('RESERVE_TOPUP','CONFIRM_DRAFT','STALE_WALLET','MONTH_END_REVIEW')),
  CONSTRAINT "tasks_status_chk" CHECK (status IN ('PENDING','RESOLVED')),
  CONSTRAINT "tasks_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "tenancy"."budgets"("id") ON DELETE CASCADE
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_budget_status_idx" ON "budgeting"."tasks" ("budget_id", "status");

--> statement-breakpoint
-- Ensure migrator owns the table (when migration is applied by postgres superuser in dev)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='budgeting' AND tablename='tasks' AND tableowner='postgres') THEN
    EXECUTE 'ALTER TABLE "budgeting"."tasks" OWNER TO migrator';
  END IF;
END $$;

--> statement-breakpoint

-- 20. Enable + Force RLS on tasks
ALTER TABLE "budgeting"."tasks" ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE "budgeting"."tasks" FORCE ROW LEVEL SECURITY;

--> statement-breakpoint

-- 21. RLS policy on tasks
CREATE POLICY "tasks_tenant_isolation" ON "budgeting"."tasks" AS PERMISSIVE FOR ALL TO "app_role","worker_role" USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
