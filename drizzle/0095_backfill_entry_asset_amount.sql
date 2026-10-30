-- 0095: backfill investment_history.asset_amount_cents (Phase 13.1, round-6 gap 2).
--
-- Fills the deal figure for existing cross-currency entries ONLY where it is
-- exactly recoverable from what the entry already stores (user rule:
-- exact or NULL — no division, no rounding here):
--   * a sale's source leg (withdraw / convert_out) whose budget currency is
--     its asset currency: proceeds = sold_cost_budget + realized_budget;
--   * a buy / add / start / conversion or transfer leg: |cost_delta| (the
--     cost it booked in its own currency at the deal).
-- Everything else stays NULL; the ledger then keeps converting as before.
-- Each touched entry is copied to _investments_bak_0095 first (owner-only).
--
-- Idempotent (only NULL, live rows). FORCE RLS is lifted (the migrator has
-- no BYPASSRLS; an unseeable row silently updates nothing — 260803) and
-- restored.

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_fix_0095 (
  id uuid PRIMARY KEY,
  asset_amount bigint NOT NULL
);

--> statement-breakpoint
TRUNCATE _inv_fix_0095;

--> statement-breakpoint
INSERT INTO _inv_fix_0095 (id, asset_amount)
SELECT h.id,
       CASE
         WHEN h.kind IN ('withdraw', 'convert_out')
           THEN h.sold_cost_budget_cents + h.realized_budget_cents
         ELSE abs(h.cost_delta_cents)
       END
  FROM budgeting.investment_history h
 WHERE h.deleted_at IS NULL
   AND h.asset_amount_cents IS NULL
   AND h.amount_currency IS NOT NULL
   AND h.cost_currency IS NOT NULL
   AND h.amount_currency <> h.cost_currency
   AND (
     (h.kind IN ('withdraw', 'convert_out')
       AND h.budget_currency = h.cost_currency
       AND h.sold_cost_budget_cents IS NOT NULL
       AND h.realized_budget_cents IS NOT NULL)
     OR
     (h.kind IN ('buy', 'add', 'start', 'convert_in', 'transfer_in', 'transfer_out')
       AND h.cost_delta_cents <> 0)
   );

--> statement-breakpoint
-- Backup (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0095 (LIKE budgeting.investment_history INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0095 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0095
SELECT h.* FROM budgeting.investment_history h
  JOIN _inv_fix_0095 f ON f.id = h.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0095 b WHERE b.id = h.id);

--> statement-breakpoint
UPDATE budgeting.investment_history h
   SET asset_amount_cents = f.asset_amount
  FROM _inv_fix_0095 f
 WHERE h.id = f.id;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;
