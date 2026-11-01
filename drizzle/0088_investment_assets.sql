-- 0088: holdings become assets (Phase 13.1).
--
-- WHY: one row per holding could not model DCA — a user buys BTC many times,
-- holds it in one place and wants ONE line to sell from. An asset is a named
-- group of ledger entries within a type; the name is the key (D-01). The
-- budgeting.investments row already stores aggregate state (quantity, average
-- buy price, current price), so it IS the asset: no new table, every consumer
-- (price worker, snapshots, wealth-now, Overview flows) keeps working.
--
-- What this does:
--   * ledger: new kinds transfer_out / transfer_in / price_change, wallet link
--     columns (sell → wallet, D-20/D-21), a prior-price snapshot (D-18) and a
--     `backfilled` marker (D-35); a newest-entry index for the LIFO rule (D-14).
--   * D-34: same-name groups that cannot merge cleanly (mixed buy currency,
--     mixed value currency, mixed instrument, archived+active, mixed shape,
--     deposits) are NOT merged — the extra sub-groups get " (2)", " (3)"…
--   * D-35: every holding without a live entry gets a cost-0 Start entry marked
--     backfilled = true (temporary: the user enters the real cost later).
--   * D-33: what is left of each same-name group merges into its oldest active
--     row (else oldest row). Quantity assets sum quantity with a weighted
--     average price; amount assets (qty 1, prices ARE totals) sum the prices and
--     keep quantity 1. History and task payloads are repointed first; a loser
--     row is deleted only once nothing references it.
--   * unique label per (budget, type), case/space-insensitive, hidden included
--     (D-02/D-07).
--
-- Idempotent. FORCE RLS is lifted on every table read, written or JOINed —
-- the migrator has no BYPASSRLS and an unseeable JOIN silently matches 0 rows
-- (260803 incident) — and restored at the end.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.tasks NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE tenancy.budgets NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
-- Backups (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0088 (LIKE budgeting.investments INCLUDING ALL);

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0088
SELECT i.* FROM budgeting.investments i
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0088 b WHERE b.id = i.id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting._investment_history_bak_0088 (LIKE budgeting.investment_history INCLUDING ALL);

--> statement-breakpoint
-- Explicit 0087 columns: on a re-run the live table already has 0088's columns.
INSERT INTO budgeting._investment_history_bak_0088 (id, tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency, qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency, sold_cost_budget_cents, realized_budget_cents, budget_currency, value_delta_cents, prior_principal_cents, prior_start_date, transfer_id, created_at, deleted_at)
SELECT h.id, h.tenant_id, h.budget_id, h.holding_id, h.kind, h.effective_date, h.amount_cents, h.amount_currency, h.qty_delta, h.cost_delta_cents, h.cost_currency, h.flow_cents, h.flow_currency, h.sold_cost_budget_cents, h.realized_budget_cents, h.budget_currency, h.value_delta_cents, h.prior_principal_cents, h.prior_start_date, h.transfer_id, h.created_at, h.deleted_at
  FROM budgeting.investment_history h
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investment_history_bak_0088 b WHERE b.id = h.id);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting._tasks_bak_0088 (LIKE budgeting.tasks INCLUDING DEFAULTS);

--> statement-breakpoint
INSERT INTO budgeting._tasks_bak_0088
SELECT t.* FROM budgeting.tasks t
 WHERE t.payload_json ? 'holding_id'
   AND NOT EXISTS (SELECT 1 FROM budgeting._tasks_bak_0088 b WHERE b.id = t.id);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0088, budgeting._investment_history_bak_0088, budgeting._tasks_bak_0088 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history
  ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES budgeting.wallets(id) ON DELETE SET NULL,
  -- Amount credited to the wallet, wallet currency, major units (D-21 delta).
  ADD COLUMN IF NOT EXISTS wallet_delta_numeric numeric(19, 4),
  -- Informational: the sale created the wallet (D-24 — it stays on undo).
  ADD COLUMN IF NOT EXISTS wallet_created boolean NOT NULL DEFAULT false,
  -- Snapshot before value_change / price_change / broker add (D-18 undo).
  ADD COLUMN IF NOT EXISTS prior_price_cents numeric(24, 6),
  ADD COLUMN IF NOT EXISTS prior_price_currency char(3),
  -- D-35 placeholder Start entry written by this migration.
  ADD COLUMN IF NOT EXISTS backfilled boolean NOT NULL DEFAULT false;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history DROP CONSTRAINT IF EXISTS investment_history_kind_chk;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history ADD CONSTRAINT investment_history_kind_chk
  CHECK (kind IN ('start','buy','add','value_change','withdraw','convert_out','convert_in','transfer_out','transfer_in','price_change'));

--> statement-breakpoint
-- D-34: rename conflicting sub-groups. Sub-key = everything that makes a merge
-- meaningless. Shape mirrors holdingShape() in packages/investments/src/domain/holding.ts.
DO $$
DECLARE
  g record;
  s record;
  keeper text;
  n int;
  candidate text;
  renamed int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _inv_subkey_0088 (id uuid PRIMARY KEY, subkey text NOT NULL);
  TRUNCATE _inv_subkey_0088;
  INSERT INTO _inv_subkey_0088 (id, subkey)
  SELECT i.id,
         concat_ws('|',
           coalesce(i.buy_currency, '-'),
           coalesce(i.current_price_currency, i.buy_currency, '-'),
           coalesce(i.instrument_id::text, '-'),
           (i.archived_at IS NULL)::text,
           CASE
             WHEN i.holding_type = 'deposit' OR i.ui_type = 'deposit' THEN 'deposit:' || i.id::text
             WHEN i.ui_type IN ('stocks', 'crypto', 'precious_metals') OR i.quantity <> 1 THEN 'quantity'
             ELSE 'amount'
           END)
    FROM budgeting.investments i;

  FOR g IN
    SELECT i.budget_id, i.ui_type, lower(btrim(i.name)) AS norm
      FROM budgeting.investments i
      JOIN _inv_subkey_0088 k ON k.id = i.id
     GROUP BY 1, 2, 3
    HAVING count(DISTINCT k.subkey) > 1
  LOOP
    SELECT k.subkey INTO keeper
      FROM budgeting.investments i JOIN _inv_subkey_0088 k ON k.id = i.id
     WHERE i.budget_id = g.budget_id AND i.ui_type IS NOT DISTINCT FROM g.ui_type
       AND lower(btrim(i.name)) = g.norm
     ORDER BY (i.archived_at IS NULL) DESC, i.created_at, i.id
     LIMIT 1;
    n := 1;
    FOR s IN
      SELECT k.subkey, array_agg(i.id) AS ids, min(btrim(i.name)) AS base
        FROM budgeting.investments i JOIN _inv_subkey_0088 k ON k.id = i.id
       WHERE i.budget_id = g.budget_id AND i.ui_type IS NOT DISTINCT FROM g.ui_type
         AND lower(btrim(i.name)) = g.norm AND k.subkey <> keeper
       GROUP BY k.subkey
       ORDER BY min(i.created_at), k.subkey
    LOOP
      LOOP
        n := n + 1;
        candidate := s.base || ' (' || n || ')';
        EXIT WHEN NOT EXISTS (
          SELECT 1 FROM budgeting.investments x
           WHERE x.budget_id = g.budget_id AND x.ui_type IS NOT DISTINCT FROM g.ui_type
             AND lower(btrim(x.name)) = lower(candidate));
      END LOOP;
      UPDATE budgeting.investments SET name = candidate WHERE id = ANY (s.ids);
      renamed := renamed + cardinality(s.ids);
    END LOOP;
  END LOOP;
  RAISE NOTICE '0088: renamed % conflicting holding(s)', renamed;
END $$;

--> statement-breakpoint
-- D-35: every holding gets at least one live entry. Before the merge, so Σ entry
-- qty stays equal to asset qty. Amount shape records no qty (create-holding.ts).
INSERT INTO budgeting.investment_history
  (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency,
   qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency, backfilled)
SELECT i.tenant_id, i.budget_id, i.id, 'start', i.created_at::date, 0, c.ccy,
       CASE
         WHEN i.ui_type IN ('stocks', 'crypto', 'precious_metals') OR i.quantity <> 1
           THEN i.quantity
       END,
       0, c.ccy, 0, c.ccy, true
  FROM budgeting.investments i
  JOIN tenancy.budgets b ON b.id = i.budget_id
  CROSS JOIN LATERAL (
    SELECT coalesce(i.buy_currency, i.current_price_currency, b.default_currency) AS ccy
  ) c
 WHERE NOT EXISTS (
   SELECT 1 FROM budgeting.investment_history h
    WHERE h.holding_id = i.id AND h.deleted_at IS NULL);

--> statement-breakpoint
-- D-33: what remains in each same-name group merges into its survivor.
CREATE TEMP TABLE IF NOT EXISTS _inv_merge_0088 (
  loser_id uuid PRIMARY KEY,
  survivor_id uuid NOT NULL,
  amount_shape boolean NOT NULL
);

--> statement-breakpoint
TRUNCATE _inv_merge_0088;

--> statement-breakpoint
INSERT INTO _inv_merge_0088 (loser_id, survivor_id, amount_shape)
SELECT x.id, x.survivor, x.amount_shape
  FROM (
    SELECT i.id,
           first_value(i.id) OVER (
             PARTITION BY i.budget_id, i.ui_type, lower(btrim(i.name))
             ORDER BY (i.archived_at IS NULL) DESC, i.created_at, i.id) AS survivor,
           NOT (i.ui_type IN ('stocks', 'crypto', 'precious_metals') OR i.quantity <> 1) AS amount_shape
      FROM budgeting.investments i
  ) x
 WHERE x.id <> x.survivor;

--> statement-breakpoint
UPDATE budgeting.investments s
   SET quantity = CASE WHEN a.amount_shape THEN s.quantity ELSE a.qty END,
       buy_price_cents = CASE
         WHEN a.all_null_buy THEN NULL
         WHEN a.amount_shape THEN a.sum_buy
         WHEN a.qty > 0 THEN round(a.cost / a.qty)::bigint
         ELSE s.buy_price_cents
       END,
       current_price_cents = CASE WHEN a.amount_shape THEN a.sum_cur ELSE a.last_cur END
  FROM (
    SELECT g.survivor_id,
           bool_and(g.amount_shape) AS amount_shape,
           sum(g.quantity) AS qty,
           sum(coalesce(g.buy_price_cents, 0)::numeric * g.quantity) AS cost,
           sum(coalesce(g.buy_price_cents, 0)) AS sum_buy,
           bool_and(g.buy_price_cents IS NULL) AS all_null_buy,
           sum(g.current_price_cents) AS sum_cur,
           (array_agg(g.current_price_cents ORDER BY g.created_at DESC, g.id DESC))[1] AS last_cur
      FROM (
        SELECT m.survivor_id, m.amount_shape, i.id, i.quantity, i.buy_price_cents,
               i.current_price_cents, i.created_at
          FROM _inv_merge_0088 m JOIN budgeting.investments i ON i.id = m.loser_id
        UNION ALL
        SELECT DISTINCT m.survivor_id, m.amount_shape, i.id, i.quantity, i.buy_price_cents,
               i.current_price_cents, i.created_at
          FROM _inv_merge_0088 m JOIN budgeting.investments i ON i.id = m.survivor_id
      ) g
     GROUP BY g.survivor_id
  ) a
 WHERE s.id = a.survivor_id;

--> statement-breakpoint
-- Amount survivors keep quantity 1: a loser's 0087 Start carried qty_delta = 1,
-- which would otherwise imply quantity 2.
UPDATE budgeting.investment_history h
   SET qty_delta = NULL
  FROM _inv_merge_0088 m
 WHERE h.holding_id = m.loser_id AND m.amount_shape AND h.qty_delta IS NOT NULL;

--> statement-breakpoint
-- Every row incl. soft-deleted ones: the FK cascade would otherwise take them.
UPDATE budgeting.investment_history h
   SET holding_id = m.survivor_id
  FROM _inv_merge_0088 m
 WHERE h.holding_id = m.loser_id;

--> statement-breakpoint
-- One pending delisted task per holding (unique index): keep the oldest per survivor.
UPDATE budgeting.tasks t
   SET status = 'RESOLVED', resolved_at = now()
 WHERE t.id IN (
   SELECT x.id FROM (
     SELECT t2.id,
            row_number() OVER (
              PARTITION BY coalesce(m.survivor_id::text, t2.payload_json->>'holding_id')
              ORDER BY t2.created_at, t2.id) AS rn
       FROM budgeting.tasks t2
       LEFT JOIN _inv_merge_0088 m ON m.loser_id::text = t2.payload_json->>'holding_id'
      WHERE t2.kind = 'INVESTMENT_INSTRUMENT_DELISTED' AND t2.status = 'PENDING'
        AND (m.loser_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM _inv_merge_0088 m2 WHERE m2.survivor_id::text = t2.payload_json->>'holding_id'))
   ) x WHERE x.rn > 1);

--> statement-breakpoint
UPDATE budgeting.tasks t
   SET payload_json = jsonb_set(t.payload_json, '{holding_id}', to_jsonb(m.survivor_id::text))
  FROM _inv_merge_0088 m
 WHERE t.payload_json->>'holding_id' = m.loser_id::text;

--> statement-breakpoint
DELETE FROM budgeting.investments i
 USING _inv_merge_0088 m
 WHERE i.id = m.loser_id
   AND NOT EXISTS (SELECT 1 FROM budgeting.investment_history h WHERE h.holding_id = m.loser_id);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS investments_label_uq
  ON budgeting.investments (budget_id, ui_type, lower(btrim(name)));

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS investment_history_newest_idx
  ON budgeting.investment_history (holding_id, effective_date DESC, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.tasks FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE tenancy.budgets FORCE ROW LEVEL SECURITY;
