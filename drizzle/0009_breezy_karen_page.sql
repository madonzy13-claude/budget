CREATE TABLE "budgeting"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"scope" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	CONSTRAINT "categories_scope_chk" CHECK ("budgeting"."categories"."scope" IN ('PERSONAL','SHARED'))
);
--> statement-breakpoint
ALTER TABLE "budgeting"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."category_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"normal_amount" bigint NOT NULL,
	"normal_currency" char(3) NOT NULL,
	"cushion_amount" bigint NOT NULL,
	"cushion_currency" char(3) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgeting"."category_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."budget_template_items" (
	"template_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"normal_amount" bigint NOT NULL,
	"normal_currency" char(3) NOT NULL,
	"cushion_amount" bigint NOT NULL,
	"cushion_currency" char(3) NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "budget_template_items_template_id_category_id_pk" PRIMARY KEY("template_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "budgeting"."budget_template_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."budget_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgeting"."budget_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."category_share_overrides" (
	"category_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"percentage" numeric(7, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_share_overrides_category_id_user_id_pk" PRIMARY KEY("category_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "budgeting"."category_share_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "budgeting"."workspace_budget_mode_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_budget_mode_chk" CHECK ("budgeting"."workspace_budget_mode_history"."mode" IN ('NORMAL','CUSHION'))
);
--> statement-breakpoint
ALTER TABLE "budgeting"."workspace_budget_mode_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "categories_tenant_isolation" ON "budgeting"."categories" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."categories"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."categories"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "category_limits_tenant_isolation" ON "budgeting"."category_limits" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."category_limits"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."category_limits"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "budget_template_items_tenant_isolation" ON "budgeting"."budget_template_items" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."budget_template_items"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."budget_template_items"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "budget_templates_tenant_isolation" ON "budgeting"."budget_templates" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."budget_templates"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."budget_templates"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "category_share_overrides_tenant_isolation" ON "budgeting"."category_share_overrides" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."category_share_overrides"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."category_share_overrides"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));--> statement-breakpoint
CREATE POLICY "workspace_budget_mode_history_tenant_isolation" ON "budgeting"."workspace_budget_mode_history" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."workspace_budget_mode_history"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."workspace_budget_mode_history"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));