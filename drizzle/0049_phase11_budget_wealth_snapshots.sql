-- Phase 11: Budget Overview — wealth snapshot foundation.
-- Hand-authored (drizzle-kit BigInt serialization bug forbids `generate`; 0038/0024
-- precedent). This is the SINGLE phase-11 migration (D-02: no compute-on-read metric
-- gets a table). It carries the per-budget wealth aggregate (D-04, consumed by the 3h
-- cron 11-07 + the wealth series 11-06) and the confirmed-only ledger index that backs
-- the multi-month budget-side rollups (D-02/D-12, consumed by 11-04/11-05). No 0050.
--
-- Idempotent throughout (IF NOT EXISTS / DROP IF EXISTS) — the dev DB may be re-run.
-- ENABLE RLS + the tenant-isolation policy live here; FORCE ROW LEVEL SECURITY + the
-- role GRANTs are in apps/migrator/post-migration.sql.

--> statement-breakpoint
-- D-04: per-budget wealth aggregate, one row per ≤3h tick. Aggregate totals ONLY —
-- no per-asset price/FX/quantity/cost-basis history (D-17). Cents are bigint.
CREATE TABLE IF NOT EXISTS budgeting.budget_wealth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  capitalization_cents bigint NOT NULL,
  investment_value_cents bigint NOT NULL,
  currency char(3) NOT NULL
);

--> statement-breakpoint
-- Idempotency for the 3h cron (11-07 ON CONFLICT target): at most one snapshot per
-- budget per UTC hour-bucket. NOTE: date_trunc(text, timestamptz) is STABLE, so it
-- must be evaluated against a timestamp-without-tz (AT TIME ZONE 'UTC') to be
-- IMMUTABLE — a bare date_trunc('hour', captured_at) is rejected by the index builder.
-- The 11-07 ON CONFLICT inference MUST reproduce this exact expression.
CREATE UNIQUE INDEX IF NOT EXISTS budget_wealth_snapshots_bucket_uidx
  ON budgeting.budget_wealth_snapshots (budget_id, (date_trunc('hour', captured_at AT TIME ZONE 'UTC')));

--> statement-breakpoint
-- Fast range reads for the wealth series (11-06).
CREATE INDEX IF NOT EXISTS budget_wealth_snapshots_series_idx
  ON budgeting.budget_wealth_snapshots (budget_id, captured_at);

--> statement-breakpoint
ALTER TABLE budgeting.budget_wealth_snapshots ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS budget_wealth_snapshots_tenant_isolation ON budgeting.budget_wealth_snapshots;
CREATE POLICY budget_wealth_snapshots_tenant_isolation ON budgeting.budget_wealth_snapshots
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
-- D-02/D-12: monthly-bucket confirmed-spend rollup over the append-only ledger.
-- Real ledger table is budgeting.expense_ledger (the plan's "transactions" name was a
-- mislabel — read_first verified the table + columns). Index name kept as the
-- downstream key_link pattern (cosmetic; planner picks indexes regardless).
CREATE INDEX IF NOT EXISTS transactions_budget_cat_confirmed_idx
  ON budgeting.expense_ledger (budget_id, category_id, confirmed_at)
  WHERE confirmed_at IS NOT NULL;
