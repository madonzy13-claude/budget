-- 0091: date each deposit's opening entry on its start date (Phase 13.1, round-5 gap 1).
--
-- WHY: createHolding dated a deposit's opening "add" entry by the Add sheet's
-- generic Date field (default today) instead of deposit_start_date, so
-- "Added money" landed on the day the deposit was entered into the app.
-- New deposits are fixed in code; this moves the existing ones.
--
-- Rule:
--   * deposit holdings (holding_type or ui_type = 'deposit') with a start date;
--   * exactly ONE live entry (a top-up or part-sale means the history is real
--     and deposit_start_date has moved since — D-20 — so those are skipped);
--   * that entry is the opening 'add' — or the 0088 'start' a pre-13.1 deposit
--     was migrated with (dated the day of the migration; user approved moving
--     those too, 2026-10-29) — dated AFTER the start date;
--   * new date = least(deposit_start_date, current_date).
-- Each touched entry is copied to _investment_history_bak_0091 first.
--
-- Idempotent. FORCE RLS is lifted on both tables (the migrator has no
-- BYPASSRLS; an unseeable JOIN silently updates 0 rows — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_fix_0091 (
  entry_id uuid PRIMARY KEY,
  new_date date NOT NULL
);

--> statement-breakpoint
TRUNCATE _inv_fix_0091;

--> statement-breakpoint
INSERT INTO _inv_fix_0091 (entry_id, new_date)
SELECT h.id, least(i.deposit_start_date, current_date)
  FROM budgeting.investments i
  JOIN budgeting.investment_history h
    ON h.holding_id = i.id AND h.deleted_at IS NULL
 WHERE (i.holding_type = 'deposit' OR i.ui_type = 'deposit')
   AND i.deposit_start_date IS NOT NULL
   AND h.kind IN ('add', 'start')
   AND i.deposit_start_date < h.effective_date
   AND (SELECT count(*) FROM budgeting.investment_history x
         WHERE x.holding_id = i.id AND x.deleted_at IS NULL) = 1;

--> statement-breakpoint
-- Backup (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investment_history_bak_0091 (LIKE budgeting.investment_history INCLUDING ALL);

--> statement-breakpoint
REVOKE ALL ON budgeting._investment_history_bak_0091 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investment_history_bak_0091
SELECT h.* FROM budgeting.investment_history h
  JOIN _inv_fix_0091 f ON f.entry_id = h.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investment_history_bak_0091 b WHERE b.id = h.id);

--> statement-breakpoint
UPDATE budgeting.investment_history h
   SET effective_date = f.new_date
  FROM _inv_fix_0091 f
 WHERE h.id = f.entry_id;

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
ALTER TABLE budgeting.investment_history FORCE ROW LEVEL SECURITY;
