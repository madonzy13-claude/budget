-- 0097: assets "deleted" before phase 13.1 are deleted for real
-- (Phase 13.1, round 6; user-approved 2026-10-31).
--
-- Until 13.1 the asset Delete only set archived_at, so removed assets came
-- back in the name autocomplete as "Archived" with their old value (e.g.
-- Tether 128,404 USDT). 13.1 split Delete (an entry-less asset) from Archive.
-- Rule: archived before 13.1 shipped (2026-10-27 13:00 UTC) and nothing ever
-- left the asset (no withdraw / convert_out / transfer_out — a sold-out asset
-- was auto-archived then, and that one stays) → delete it; its ledger goes by
-- ON DELETE CASCADE. Both tables are copied to _bak_0097 first. Idempotent.
-- FORCE RLS is lifted (the migrator has no BYPASSRLS — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_del_0097 (id uuid PRIMARY KEY);

--> statement-breakpoint
TRUNCATE _inv_del_0097;

--> statement-breakpoint
INSERT INTO _inv_del_0097 (id)
SELECT i.id
  FROM budgeting.investments i
 WHERE i.archived_at < TIMESTAMPTZ '2026-10-27 13:00:00+00'
   AND NOT EXISTS (
         SELECT 1 FROM budgeting.investment_history h
          WHERE h.holding_id = i.id
            AND h.kind IN ('withdraw', 'convert_out', 'transfer_out'));

--> statement-breakpoint
-- Backups (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0097 (LIKE budgeting.investments INCLUDING ALL);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS budgeting._investment_history_bak_0097 (LIKE budgeting.investment_history INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0097, budgeting._investment_history_bak_0097 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0097
SELECT i.* FROM budgeting.investments i
  JOIN _inv_del_0097 d ON d.id = i.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0097 b WHERE b.id = i.id);

--> statement-breakpoint
INSERT INTO budgeting._investment_history_bak_0097
SELECT h.* FROM budgeting.investment_history h
  JOIN _inv_del_0097 d ON d.id = h.holding_id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investment_history_bak_0097 b WHERE b.id = h.id);

--> statement-breakpoint
DELETE FROM budgeting.investments i
 USING _inv_del_0097 d
 WHERE i.id = d.id;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
