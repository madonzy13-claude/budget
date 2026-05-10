-- Plan 02-06: expense_ledger Phase-2 extensions + spending_by_category_month projection table
-- Generated manually (drizzle-kit cannot handle DROP COLUMN + GENERATED column interactively)

--> statement-breakpoint
ALTER TABLE "budgeting"."expense_ledger" DROP COLUMN IF EXISTS "corrected_by_id";
--> statement-breakpoint
ALTER TABLE "budgeting"."expense_ledger"
  ADD COLUMN IF NOT EXISTS "transaction_date" date NOT NULL DEFAULT now()::date,
  ADD COLUMN IF NOT EXISTS "note" text,
  ADD COLUMN IF NOT EXISTS "account_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  ADD COLUMN IF NOT EXISTS "category_id" uuid,
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'EXPENSE',
  ADD COLUMN IF NOT EXISTS "transfer_group_id" uuid,
  ADD COLUMN IF NOT EXISTS "note_tsv" text;
--> statement-breakpoint
CREATE TABLE "budgeting"."spending_by_category_month" (
  "tenant_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "month_start_date" date NOT NULL,
  "normal_amount" numeric(19, 4) NOT NULL DEFAULT '0',
  "cushion_amount" numeric(19, 4) NOT NULL DEFAULT '0',
  "currency" char(3) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "spending_by_category_month_pkey" PRIMARY KEY ("tenant_id", "category_id", "month_start_date")
);
--> statement-breakpoint
ALTER TABLE "budgeting"."spending_by_category_month" ENABLE ROW LEVEL SECURITY;
