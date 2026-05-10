-- Plan 02-08: recurring_rules + recurring_drafts tables
-- Generated manually (drizzle-kit requires TTY; created by plan executor)

CREATE TABLE IF NOT EXISTS "budgeting"."recurring_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "category_id" uuid,
  "amount" numeric(19,4) NOT NULL,
  "currency" char(3) NOT NULL,
  "kind" text NOT NULL,
  "cadence" text NOT NULL,
  "cadence_anchor" integer,
  "weekly_dow" integer,
  "note" text,
  "active" boolean NOT NULL DEFAULT true,
  "next_due_date" date NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "actor_user_id" uuid NOT NULL,
  CONSTRAINT "recurring_rules_kind_chk" CHECK (kind IN ('EXPENSE','INCOME','TRANSFER')),
  CONSTRAINT "recurring_rules_cadence_chk" CHECK (cadence IN ('MONTHLY','WEEKLY')),
  CONSTRAINT "recurring_rules_weekly_dow_chk" CHECK (weekly_dow IS NULL OR (weekly_dow BETWEEN 0 AND 6))
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budgeting"."recurring_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "rule_id" uuid NOT NULL,
  "due_date" date NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "currency" char(3) NOT NULL,
  "account_id" uuid NOT NULL,
  "category_id" uuid,
  "kind" text NOT NULL,
  "note" text,
  "status" text NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "confirmed_at" timestamptz,
  "actor_user_id" uuid,
  CONSTRAINT "recurring_drafts_rule_due_uq" UNIQUE ("rule_id", "due_date"),
  CONSTRAINT "recurring_drafts_status_chk" CHECK (status IN ('PENDING','CONFIRMED','SKIPPED'))
);

--> statement-breakpoint
ALTER TABLE "budgeting"."recurring_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budgeting"."recurring_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "recurring_rules_tenant_isolation" ON "budgeting"."recurring_rules" AS PERMISSIVE FOR ALL TO "app_role","worker_role" USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
--> statement-breakpoint
CREATE POLICY "recurring_drafts_tenant_isolation" ON "budgeting"."recurring_drafts" AS PERMISSIVE FOR ALL TO "app_role","worker_role" USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));
