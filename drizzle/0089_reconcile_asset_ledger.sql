-- 0089: reconcile asset rows with their live ledger entries (Phase 13.1, UAT test 12).
--
-- WHY: the Phase 13 CR-01 lost-update (Edit fired a stale full-row PATCH
-- alongside POST /adjust) left holdings whose buy entries are live but whose
-- quantity/cost never moved — e.g. a BTC row at 0.5 / $1,000 while its entries
-- sum 2.1 / $128,082.40. 0088 carried those rows as-is. In 13.1 the ledger is
-- the source of truth on screen, so the row is rebuilt from it.
--
-- Rule (mirrors scripts/audit-asset-ledger.sql and expectRowMatchesEntries()):
--   * quantity shape: quantity := Σ qty_delta;
--     buy_price_cents := round(Σ cost_delta / quantity), 0 when quantity is 0;
--   * amount shape (qty 1, price IS the total): buy_price_cents := Σ cost_delta;
--   * an asset with a live D-35 backfilled Start is skipped: that entry is a
--     placeholder (cost 0, and on demo pools no qty either), not a fact —
--     rebuilding from it would zero real quantities and costs;
--   * deposits are skipped (remainder restarts on every sale, D-20).
-- Only mismatched rows are touched; each is copied to _investments_bak_0089 first.
--
-- Idempotent. FORCE RLS is lifted on both tables (the migrator has no
-- BYPASSRLS; an unseeable JOIN silently updates 0 rows — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_fix_0089 (
  id uuid PRIMARY KEY,
  quantity numeric(28, 8) NOT NULL,
  buy_price_cents bigint
);

--> statement-breakpoint
TRUNCATE _inv_fix_0089;

--> statement-breakpoint
INSERT INTO _inv_fix_0089 (id, quantity, buy_price_cents)
SELECT s.id,
       CASE WHEN s.qty_shape THEN s.entries_qty ELSE s.row_qty END,
       CASE
         WHEN NOT s.qty_shape THEN s.entries_cost
         WHEN s.entries_qty = 0 THEN 0
         ELSE round(s.entries_cost / s.entries_qty)::bigint
       END
  FROM (
    SELECT i.id, i.quantity AS row_qty,
           coalesce(i.buy_price_cents, 0) AS row_buy,
           (i.ui_type IN ('stocks', 'crypto', 'precious_metals') OR i.quantity <> 1) AS qty_shape,
           e.qty AS entries_qty, e.cost AS entries_cost, e.backfilled
      FROM budgeting.investments i
      JOIN LATERAL (
        SELECT coalesce(sum(h.qty_delta), 0) AS qty,
               coalesce(sum(h.cost_delta_cents), 0) AS cost,
               bool_or(h.backfilled) AS backfilled
          FROM budgeting.investment_history h
         WHERE h.holding_id = i.id AND h.deleted_at IS NULL
        HAVING count(*) > 0
      ) e ON true
     WHERE i.holding_type <> 'deposit' AND coalesce(i.ui_type, '') <> 'deposit'
  ) s
 WHERE NOT s.backfilled
   AND ((s.qty_shape AND s.row_qty <> s.entries_qty)
     OR (s.qty_shape AND abs(s.row_qty * s.row_buy - s.entries_cost) > s.row_qty / 2 + 1)
     OR (NOT s.qty_shape AND s.row_buy <> s.entries_cost));

--> statement-breakpoint
-- Backup (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0089 (LIKE budgeting.investments INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0089 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0089
SELECT i.* FROM budgeting.investments i
  JOIN _inv_fix_0089 f ON f.id = i.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0089 b WHERE b.id = i.id);

--> statement-breakpoint
UPDATE budgeting.investments i
   SET quantity = f.quantity,
       buy_price_cents = f.buy_price_cents
  FROM _inv_fix_0089 f
 WHERE i.id = f.id;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;
