-- 0092: replace the D-35 zero placeholders with the asset's own amount
-- (Phase 13.1, round-5 gap 11).
--
-- WHY: 0088 gave every asset without history a backfilled 'start' entry with
-- cost 0 (D-35, "user will enter the real cost later"). On screen they read
-- "Added money +0", and P/L counted the whole value as gain. User decision
-- (2026-10-29): fill them from the asset itself.
--
-- Rule (amount-shaped assets only — stocks / crypto / metals have none):
--   * live, backfilled 'start' entry with amount 0 and cost 0;
--   * amount = cost = flow = round(coalesce(buy_price, current_price) × quantity)
--     in coalesce(buy_currency, current_price_currency) — the same cost
--     createHolding books; cash has no buy price, so its balance is its cost
--     (P/L 0, as cash should be);
--   * a row with no buy price gets buy_price_cents / buy_currency from its
--     current price, so the row matches its ledger (0089 invariant).
-- Entries and rows are copied to _investment_history_bak_0092 /
-- _investments_bak_0092 first. Idempotent (a filled entry no longer matches).
-- FORCE RLS is lifted on both tables (the migrator has no BYPASSRLS; an
-- unseeable JOIN silently updates 0 rows — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_fix_0092 (
  entry_id uuid PRIMARY KEY,
  holding_id uuid NOT NULL,
  amount bigint NOT NULL,
  ccy char(3) NOT NULL,
  fill_row boolean NOT NULL
);

--> statement-breakpoint
TRUNCATE _inv_fix_0092;

--> statement-breakpoint
INSERT INTO _inv_fix_0092 (entry_id, holding_id, amount, ccy, fill_row)
SELECT h.id, i.id,
       round(coalesce(i.buy_price_cents, i.current_price_cents) * i.quantity)::bigint,
       coalesce(i.buy_currency, i.current_price_currency),
       i.buy_price_cents IS NULL
  FROM budgeting.investments i
  JOIN budgeting.investment_history h
    ON h.holding_id = i.id AND h.deleted_at IS NULL
 WHERE h.kind = 'start'
   AND h.backfilled
   AND coalesce(h.amount_cents, 0) = 0
   AND coalesce(h.cost_delta_cents, 0) = 0
   AND h.qty_delta IS NULL
   AND coalesce(i.ui_type, '') NOT IN ('stocks', 'crypto', 'precious_metals')
   AND coalesce(i.buy_price_cents, i.current_price_cents) IS NOT NULL
   AND coalesce(i.buy_currency, i.current_price_currency) IS NOT NULL
   AND round(coalesce(i.buy_price_cents, i.current_price_cents) * i.quantity) > 0;

--> statement-breakpoint
-- Backups (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investment_history_bak_0092 (LIKE budgeting.investment_history INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investment_history_bak_0092 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0092 (LIKE budgeting.investments INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0092 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investment_history_bak_0092
SELECT h.* FROM budgeting.investment_history h
  JOIN _inv_fix_0092 f ON f.entry_id = h.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investment_history_bak_0092 b WHERE b.id = h.id);

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0092
SELECT i.* FROM budgeting.investments i
  JOIN _inv_fix_0092 f ON f.holding_id = i.id AND f.fill_row
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0092 b WHERE b.id = i.id);

--> statement-breakpoint
UPDATE budgeting.investment_history h
   SET amount_cents = f.amount, amount_currency = f.ccy,
       cost_delta_cents = f.amount, cost_currency = f.ccy,
       flow_cents = f.amount, flow_currency = f.ccy
  FROM _inv_fix_0092 f
 WHERE h.id = f.entry_id;

--> statement-breakpoint
UPDATE budgeting.investments i
   SET buy_price_cents = round(i.current_price_cents)::bigint,
       buy_currency = i.current_price_currency
  FROM _inv_fix_0092 f
 WHERE i.id = f.holding_id AND f.fill_row AND i.buy_price_cents IS NULL;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;
