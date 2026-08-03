-- Move possessions out of the holdings table and into wallets (260803).
--
-- The type work landed in 0071; this is the data.
--
-- THE TRAP, learned the hard way: budgeting.investments, budgeting.wallets AND
-- tenancy.budgets are all FORCE ROW LEVEL SECURITY, and the migrator role does
-- not bypass RLS. A statement that cannot see a row does not fail — it reports
-- success having matched nothing. The first attempt lifted FORCE on two of the
-- three tables, so the INSERT (which joins budgets for the owner and currency)
-- matched zero rows while the DELETE, joining nothing, matched everything: it
-- deleted real possessions and wrote none of them back.
--
-- Hence two rules here, both of which must survive any edit:
--   1. Every table the statements touch has FORCE lifted for the duration.
--   2. The DELETE removes ONLY rows that now have a wallet of the same id, so a
--      move that inserted nothing can never delete anything.
-- post-migration.sql re-applies FORCE (Pitfall 6) regardless; the toggles here
-- run inside the migrator's single transaction.
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.wallets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.budgets NO FORCE ROW LEVEL SECURITY;

-- Keep the originals rather than dropping them, so the move can be read back if
-- a figure ever looks wrong. Created empty first, then filled — `CREATE TABLE IF
-- NOT EXISTS ... AS SELECT` skips the SELECT entirely when the table is already
-- there, which is how the first attempt ended up with an empty backup.
CREATE TABLE IF NOT EXISTS budgeting._possessions_to_wallets_backup
  (LIKE budgeting.investments);
INSERT INTO budgeting._possessions_to_wallets_backup
SELECT i.* FROM budgeting.investments i
 WHERE i.holding_type = 'possession'
   AND NOT EXISTS (
     SELECT 1 FROM budgeting._possessions_to_wallets_backup b WHERE b.id = i.id);

INSERT INTO budgeting.wallets
  (id, tenant_id, name, currency, current_balance, archived_at, created_at,
   actor_user_id, wallet_type, color, icon, sort_order)
SELECT
  i.id,
  i.tenant_id,
  i.name,
  COALESCE(i.current_price_currency, i.buy_currency, b.default_currency)::char(3),
  -- quantity has always been 1, but multiply anyway rather than assume.
  ROUND(COALESCE(i.current_price_cents, 0) * COALESCE(i.quantity, 1) / 100.0, 4),
  i.archived_at,
  i.created_at,
  b.owner_user_id,
  'POSSESSION',
  i.color,
  i.icon,
  i.sort_order
FROM budgeting.investments i
JOIN tenancy.budgets b ON b.id = i.tenant_id
WHERE i.holding_type = 'possession'
  -- Re-runnable: never insert a wallet that is already there.
  AND NOT EXISTS (SELECT 1 FROM budgeting.wallets w WHERE w.id = i.id);

-- Only what actually arrived. Rule 2 above.
DELETE FROM budgeting.investments i
 WHERE i.holding_type = 'possession'
   AND EXISTS (SELECT 1 FROM budgeting.wallets w WHERE w.id = i.id);

ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.wallets FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.budgets FORCE ROW LEVEL SECURITY;
