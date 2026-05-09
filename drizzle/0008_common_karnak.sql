CREATE TABLE "budgeting"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"currency" char(3) NOT NULL,
	"current_balance" numeric(19, 4) DEFAULT '0' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	CONSTRAINT "accounts_kind_chk" CHECK ("budgeting"."accounts"."kind" IN ('CASH','CHECKING','SAVINGS','CREDIT_CARD','LOAN','INVESTMENT')),
	CONSTRAINT "accounts_scope_chk" CHECK ("budgeting"."accounts"."scope" IN ('PERSONAL','SHARED'))
);
--> statement-breakpoint
ALTER TABLE "budgeting"."accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."account_balance_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"delta_amount" numeric(19, 4) NOT NULL,
	"delta_currency" char(3) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgeting"."account_balance_adjustments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_tenant_isolation" ON "budgeting"."accounts" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."accounts"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."accounts"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "account_balance_adjustments_tenant_isolation" ON "budgeting"."account_balance_adjustments" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."account_balance_adjustments"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."account_balance_adjustments"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));