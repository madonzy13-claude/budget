-- 0096: collectibles sold out while they were single-total assets hold 0 items
-- (Phase 13.1, round 6; user-approved 2026-10-30).
--
-- Before R6-1 a collectible was one item with a total value; selling it all
-- set value and cost to 0 but left quantity 1. Now collectibles are counted,
-- so such a row read "1 × 0" and offered 1 unit to Sell / Transfer.
-- Rule: ui_type 'collectibles', quantity 1, buy price 0 (or null) and current
-- value 0 (or null) → quantity 0. Nothing else changes. Each touched row is
-- copied to _investments_bak_0096 first. Idempotent.
-- FORCE RLS is lifted (the migrator has no BYPASSRLS — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_fix_0096 (id uuid PRIMARY KEY);

--> statement-breakpoint
TRUNCATE _inv_fix_0096;

--> statement-breakpoint
INSERT INTO _inv_fix_0096 (id)
SELECT i.id
  FROM budgeting.investments i
 WHERE i.ui_type = 'collectibles'
   AND i.quantity = 1
   AND coalesce(i.buy_price_cents, 0) = 0
   AND coalesce(i.current_price_cents, 0) = 0;

--> statement-breakpoint
-- Backup (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0096 (LIKE budgeting.investments INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0096 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0096
SELECT i.* FROM budgeting.investments i
  JOIN _inv_fix_0096 f ON f.id = i.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0096 b WHERE b.id = i.id);

--> statement-breakpoint
UPDATE budgeting.investments i
   SET quantity = 0
  FROM _inv_fix_0096 f
 WHERE i.id = f.id;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
