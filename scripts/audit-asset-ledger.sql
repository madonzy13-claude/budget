-- audit-asset-ledger.sql — READ-ONLY. Lists every asset whose row disagrees
-- with the sum of its live ledger entries (UAT 13.1 test 12). Same rule as
-- drizzle/0089_reconcile_asset_ledger.sql and expectRowMatchesEntries():
--   * quantity shape (stocks/crypto/precious_metals, or qty ≠ 1): row quantity
--     must equal Σ qty_delta; quantity × buy_price ≈ Σ cost_delta (½ cent/unit);
--   * amount shape (qty 1, buy_price IS the total): buy_price = Σ cost_delta;
--   * assets with a live D-35 backfilled Start are skipped (placeholder entry:
--     cost 0, and on demo pools no qty either);
--   * deposits excluded: their remainder restarts on every sale (D-20).
--
-- Run as postgres (owner bypasses RLS):
--   docker compose exec -T db psql -U postgres -d budget -f - < scripts/audit-asset-ledger.sql
WITH s AS (
  SELECT i.id, i.tenant_id, i.budget_id, i.name, i.ui_type,
         i.quantity AS row_qty,
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
)
SELECT tenant_id, budget_id, id AS holding_id, name, ui_type,
       row_qty, entries_qty,
       CASE WHEN qty_shape THEN round(row_qty * row_buy) ELSE row_buy END AS row_cost_cents,
       entries_cost AS entries_cost_cents,
       backfilled
  FROM s
 WHERE NOT backfilled
   AND ((qty_shape AND row_qty <> entries_qty)
     OR (qty_shape AND abs(row_qty * row_buy - entries_cost) > row_qty / 2 + 1)
     OR (NOT qty_shape AND row_buy <> entries_cost))
 ORDER BY tenant_id, ui_type, name;
