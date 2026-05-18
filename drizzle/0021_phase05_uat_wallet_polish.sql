-- 0021_phase05_uat_wallet_polish.sql
-- UAT-PH5-T3-1x: per-wallet color + icon + intra-section sort order.
--
-- color  : optional hex string ("#RRGGBB") or named token (e.g. "primary").
--          Default null = no color.
-- icon   : optional lucide icon name (e.g. "wallet", "piggy-bank"). Default
--          null = no icon. The frontend renders the icon to the left of the
--          wallet name in the selected color when both are set.
-- sort_order : per-tenant monotonic integer used to order wallets WITHIN
--              a section (Spendings / Cushion / Reserve). On INSERT the
--              app layer assigns max(sort_order)+1 within the section so
--              new wallets append. The reorder endpoint swaps these values.
--              Backfilled by row order at migration time so existing wallets
--              keep their visible position.

ALTER TABLE budgeting.wallets
  ADD COLUMN IF NOT EXISTS color      TEXT,
  ADD COLUMN IF NOT EXISTS icon       TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill sort_order so existing wallets retain their created_at order
-- within each tenant + wallet_type bucket. Without the backfill every row
-- gets 0 and the listing collapses to created_at fallback.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, wallet_type
      ORDER BY created_at, id
    ) AS rn
  FROM budgeting.wallets
)
UPDATE budgeting.wallets w
   SET sort_order = ranked.rn
  FROM ranked
 WHERE w.id = ranked.id
   AND w.sort_order = 0;

-- Index keeps the per-section reordering query cheap.
CREATE INDEX IF NOT EXISTS wallets_tenant_type_sort_idx
  ON budgeting.wallets (tenant_id, wallet_type, sort_order);
