-- r32: budgeting.incomes — per-budget expected-income config (name + amount +
-- currency + frequency), mirroring recurring_rules' cadence model. Config only
-- for now (no engine). Self-contained: table + CHECKs + RLS + policy + grants
-- (bundled here because it is applied directly; make migrate is separately
-- blocked by a pre-existing 0049 ownership drift). Idempotent (IF NOT EXISTS /
-- DROP POLICY IF EXISTS).

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  amount numeric(19,4) NOT NULL,
  currency char(3) NOT NULL,
  cadence text NOT NULL,
  cadence_anchor integer,
  weekly_dow integer,
  yearly_month integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL,
  CONSTRAINT incomes_cadence_chk CHECK (cadence IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  CONSTRAINT incomes_weekly_dow_chk CHECK (weekly_dow IS NULL OR (weekly_dow BETWEEN 0 AND 6)),
  CONSTRAINT incomes_yearly_month_chk CHECK ((cadence <> 'YEARLY' AND yearly_month IS NULL) OR (cadence = 'YEARLY' AND yearly_month BETWEEN 1 AND 12)),
  CONSTRAINT incomes_cadence_anchor_chk CHECK ((cadence IN ('MONTHLY','YEARLY') AND cadence_anchor BETWEEN 1 AND 31) OR (cadence IN ('DAILY','WEEKLY') AND cadence_anchor IS NULL) OR cadence_anchor IS NULL)
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS incomes_tenant_active_idx
  ON budgeting.incomes (tenant_id) WHERE active = true;

--> statement-breakpoint
ALTER TABLE budgeting.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.incomes FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS incomes_tenant_isolation ON budgeting.incomes;
CREATE POLICY incomes_tenant_isolation ON budgeting.incomes
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.incomes TO app_role, worker_role;
