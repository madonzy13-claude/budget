-- 260804: budgeting.reserve_fit_exclusions — the one-off spend a budget has told
-- the reserve-fit chart to ignore.
--
-- WHY: sizing a category's reserve from its history runs aground on rare spend,
-- and no statistic can sort it out. A 5,000 zł insurance charge every September
-- is rare AND certain — reserve for it. A 5,000 zł parachute jump is rare and
-- (probably) never again — reserving for it parks the money forever. "Rare" and
-- "will repeat" are different facts, and only the household knows the second.
--
-- So the chart lists a category's large transactions with every one COUNTED by
-- default, and un-ticking one records a row here. Default-counted matters: an
-- untouched chart can only ever ask you to hold too much, never too little.
--
-- Scoped to the BUDGET, not the member (user decision): "that jump was a one-off"
-- is a fact about the household's history, not a personal way of looking at it.
--
-- Kept off expense_ledger deliberately — the ledger is append-only, and this is
-- an analysis annotation that must never touch real reserve balances, used, or
-- overspent. Deleting the transaction takes its annotation with it.
--
-- Self-contained (table + RLS + policy + grants), idempotent. Follows 0054.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting.reserve_fit_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ledger_id uuid NOT NULL REFERENCES budgeting.expense_ledger(id) ON DELETE CASCADE,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reserve_fit_exclusions_once UNIQUE (tenant_id, ledger_id)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reserve_fit_exclusions_lookup_idx
  ON budgeting.reserve_fit_exclusions (tenant_id, ledger_id);

--> statement-breakpoint
ALTER TABLE budgeting.reserve_fit_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.reserve_fit_exclusions FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS reserve_fit_exclusions_tenant_isolation ON budgeting.reserve_fit_exclusions;
CREATE POLICY reserve_fit_exclusions_tenant_isolation ON budgeting.reserve_fit_exclusions
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.reserve_fit_exclusions TO app_role, worker_role;
