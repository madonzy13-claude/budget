-- r36: budgeting.investment_group_flows — the deposit/withdrawal ledger that lets
-- a group's P/L survive a sell.
--
-- WHY: a group's P/L was Σvalue − Σcost over its CURRENT holdings. Selling part of
-- a holding (e.g. 0.3 BTC → USDT) removed the sold quantity's cost AND its gain, so
-- the group's P/L silently shrank even though no money left the family. A group is
-- really a mini-portfolio: adding/growing a holding is a DEPOSIT (its cost), and
-- selling/removing one is a WITHDRAWAL at the current value. Each withdrawal books
-- one row here (cost of the quantity that left + the proceeds it realized). On read,
-- Σ(proceeds − cost) per group = the group's realized gains; P/L then =
-- (Σvalue − Σcost) + realized, which is stable across a sell-and-reinvest.
--
-- Legs are stored RAW (native currency, not pre-converted) so the write path needs
-- no FX; list-holdings converts each leg to the budget currency with the same rate
-- map it already uses for holdings. Groups that never had a withdrawal have zero
-- rows → realized = 0 → identical to the old behavior (no backfill needed).
--
-- Self-contained (table + RLS + policy + grants), idempotent. Follows 0051_incomes.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting.investment_group_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL,
  group_name text NOT NULL,
  -- Cost basis of the quantity that left the group (leaving_qty × buy_price).
  cost_cents bigint NOT NULL,
  cost_currency char(3),
  -- Value the quantity realized on the way out (leaving_qty × current_price).
  proceeds_cents bigint NOT NULL,
  proceeds_currency char(3),
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_group_flows_lookup_idx
  ON budgeting.investment_group_flows (budget_id, tenant_id, group_name);

--> statement-breakpoint
ALTER TABLE budgeting.investment_group_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.investment_group_flows FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS investment_group_flows_tenant_isolation ON budgeting.investment_group_flows;
CREATE POLICY investment_group_flows_tenant_isolation ON budgeting.investment_group_flows
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.investment_group_flows TO app_role, worker_role;
