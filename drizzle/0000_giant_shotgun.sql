CREATE TABLE "budgeting"."expense_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"amount_orig" numeric(19, 4) NOT NULL,
	"currency_orig" text NOT NULL,
	"amount_default" numeric(19, 4) NOT NULL,
	"currency_default" text NOT NULL,
	"fx_rate" numeric(19, 8) NOT NULL,
	"fx_rate_date" date NOT NULL,
	"fx_provider" text NOT NULL,
	"corrects_id" uuid,
	"corrected_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgeting"."expense_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "expense_ledger_tenant_isolation" ON "budgeting"."expense_ledger" AS PERMISSIVE FOR ALL TO "app_role", "worker_role" USING ("budgeting"."expense_ledger"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])) WITH CHECK ("budgeting"."expense_ledger"."tenant_id" = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));