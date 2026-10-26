-- 0087: budgeting.investment_history — a dated ledger of every change to a
-- holding (Phase 13), plus the equity/ETF → stocks merge and per-budget
-- type-group order.
--
-- WHY: moving money between investments (sell, convert, withdraw) distorted
-- contributions and erased gains — the 24 Oct broker → Erste move showed as a
-- +275k contribution jump. Every Sell/Add/Withdraw/Convert now writes a row
-- here: cost/value deltas (so deleting an entry is a full undo, D-06), the
-- external flow in its ORIGINAL currency (contributions = Σ flow, D-19) and the
-- realized gain frozen in budget currency at the entry date (D-18).
--
-- The 0054–0058 per-group-NAME gain ledger was reverted (empty groups showed
-- "—", same-name groups inherited stale P/L). This ledger has NO group/type
-- column: an entry's type = JOIN to its holding's CURRENT ui_type, so changing
-- a holding's type carries its realized gain along.
--
-- Idempotent. The backfill reads budgeting.investments, which the migrator can
-- only see with FORCE RLS lifted (no BYPASSRLS) — lifted here, restored at end.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- Dropped BEFORE the remap: the old CHECK has no 'stocks'.
ALTER TABLE budgeting.investments DROP CONSTRAINT IF EXISTS investments_ui_type_chk;

--> statement-breakpoint
-- D-10/D-11: equity + ETF (+ legacy reit) → stocks, etb → treasury_bond, null →
-- derived from holding_type. holding_type is untouched (it routes pricing).
UPDATE budgeting.investments
   SET ui_type = CASE
     WHEN ui_type IN ('equity', 'etf', 'reit') THEN 'stocks'
     WHEN ui_type = 'etb' THEN 'treasury_bond'
     ELSE CASE holding_type
       WHEN 'equities' THEN 'stocks'
       WHEN 'etf' THEN 'stocks'
       WHEN 'reit' THEN 'stocks'
       WHEN 'bond' THEN 'treasury_bond'
       WHEN 'crypto' THEN 'crypto'
       WHEN 'commodity' THEN 'precious_metals'
       WHEN 'cash_fx' THEN 'cash'
       WHEN 'real_estate' THEN 'real_estate'
       WHEN 'deposit' THEN 'deposit'
       WHEN 'savings' THEN 'savings'
       WHEN 'possession' THEN 'possession'
       ELSE 'other'
     END
   END
 WHERE ui_type IS NULL OR ui_type IN ('equity', 'etf', 'reit', 'etb');

--> statement-breakpoint
ALTER TABLE budgeting.investments ADD CONSTRAINT investments_ui_type_chk
  CHECK (ui_type IS NULL OR ui_type IN ('stocks','crypto','treasury_bond','collectibles','real_estate','other','precious_metals','cash','broker','deposit','savings','possession'));

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting.investment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL REFERENCES budgeting.investments(id) ON DELETE CASCADE,
  kind text NOT NULL,
  -- User-picked (D-06); Start = holding created_at::date (D-09).
  effective_date date NOT NULL,
  -- Display amount: cost for start/buy/add, new value for value_change,
  -- RECEIVED for withdraw/convert_* (D-17, original currency).
  amount_cents bigint,
  amount_currency char(3),
  -- Signed; quantity holdings only.
  qty_delta numeric(28, 8),
  -- Signed change of held cost, buy currency.
  cost_delta_cents bigint NOT NULL DEFAULT 0,
  cost_currency char(3),
  -- External contribution, signed, ORIGINAL currency (D-19); 0 on
  -- value_change / convert_*.
  flow_cents bigint NOT NULL DEFAULT 0,
  flow_currency char(3),
  -- Frozen at effective_date (D-18); withdraw / convert_out only.
  sold_cost_budget_cents bigint,
  realized_budget_cents bigint,
  budget_currency char(3),
  -- Signed change of current value (holding currency), amount holdings only —
  -- delete subtracts it back (D-06).
  value_delta_cents bigint NOT NULL DEFAULT 0,
  -- Deposit sales only (D-20): principal + start date BEFORE the sale, restored
  -- on undo (the restart is not delta-expressible).
  prior_principal_cents bigint,
  prior_start_date date,
  -- Both legs of a conversion share one id.
  transfer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Entry delete = soft delete; every read filters deleted_at IS NULL.
  deleted_at timestamptz,
  CONSTRAINT investment_history_kind_chk
    CHECK (kind IN ('start','buy','add','value_change','withdraw','convert_out','convert_in'))
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_history_budget_date_idx
  ON budgeting.investment_history (budget_id, tenant_id, effective_date)
  WHERE deleted_at IS NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_history_holding_idx
  ON budgeting.investment_history (holding_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_history_transfer_idx
  ON budgeting.investment_history (transfer_id)
  WHERE transfer_id IS NOT NULL;

--> statement-breakpoint
-- D-09: one automatic Start entry per current holding, dated at created_at,
-- amount = current cost. Archived holdings get none (user backfills, D-07).
-- value_delta stays 0: Start records cost only.
INSERT INTO budgeting.investment_history
  (tenant_id, budget_id, holding_id, kind, effective_date,
   amount_cents, amount_currency, qty_delta, cost_delta_cents, cost_currency,
   flow_cents, flow_currency)
SELECT i.tenant_id, i.budget_id, i.id, 'start', i.created_at::date,
       c.cost, i.buy_currency, i.quantity, c.cost, i.buy_currency,
       c.cost, i.buy_currency
  FROM budgeting.investments i
  CROSS JOIN LATERAL (
    SELECT round(i.buy_price_cents::numeric * i.quantity)::bigint AS cost
  ) c
 WHERE i.archived_at IS NULL
   AND i.holding_type <> 'possession'
   AND i.buy_price_cents IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM budgeting.investment_history h
      WHERE h.holding_id = i.id AND h.kind = 'start'
   );

--> statement-breakpoint
ALTER TABLE budgeting.investment_history ENABLE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP POLICY IF EXISTS investment_history_tenant_isolation ON budgeting.investment_history;

--> statement-breakpoint
CREATE POLICY investment_history_tenant_isolation ON budgeting.investment_history
  AS PERMISSIVE FOR ALL TO app_role, worker_role
  USING (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]))
  WITH CHECK (tenant_id = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[]));

--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON budgeting.investment_history TO app_role, worker_role;

--> statement-breakpoint
-- D-12: type-group order saved per budget (shared by members).
ALTER TABLE tenancy.budgets
  ADD COLUMN IF NOT EXISTS investment_type_order text[] NOT NULL DEFAULT '{}';

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
