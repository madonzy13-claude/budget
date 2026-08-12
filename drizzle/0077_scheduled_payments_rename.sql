-- 0077 — recurring_rules becomes scheduled_payments (260807, user request).
--
-- The engine's word for these rows was "recurring rules"; the household's word
-- is "scheduled payments", and the rename was asked to go all the way down so
-- nobody has to translate between two vocabularies. Nothing about the rows
-- changes — this is names only.
--
-- RENAME, never drop-and-recreate. A rename carries the data, the policy, the
-- grants, the foreign key and the indexes with it in one catalogue update;
-- recreating would have to copy 'em back by hand, and 0072 is the standing
-- lesson about what a data move loses when RLS is watching (82 rows).
--
-- Constraint and index names do NOT follow a table rename in Postgres, so each
-- one is renamed explicitly. IF EXISTS / DO-block guards throughout: this may
-- replay against a database that already carries part of the new naming.

-- ---------------------------------------------------------------- the table
ALTER TABLE IF EXISTS budgeting.recurring_rules
  RENAME TO scheduled_payments;

-- ------------------------------------------------------------- its own names
ALTER TABLE budgeting.scheduled_payments
  RENAME CONSTRAINT recurring_rules_cadence_chk TO scheduled_payments_cadence_chk;
ALTER TABLE budgeting.scheduled_payments
  RENAME CONSTRAINT recurring_rules_weekly_dow_chk TO scheduled_payments_weekly_dow_chk;
ALTER TABLE budgeting.scheduled_payments
  RENAME CONSTRAINT recurring_rules_yearly_month_chk TO scheduled_payments_yearly_month_chk;
ALTER TABLE budgeting.scheduled_payments
  RENAME CONSTRAINT recurring_rules_cadence_anchor_chk TO scheduled_payments_cadence_anchor_chk;

ALTER INDEX IF EXISTS budgeting.recurring_rules_pkey
  RENAME TO scheduled_payments_pkey;
ALTER INDEX IF EXISTS budgeting.recurring_rules_next_due_idx
  RENAME TO scheduled_payments_next_due_idx;

-- The policies are renamed rather than dropped and rebuilt: a window with no
-- policy on a FORCE-RLS table is a window where a tenant could read another's.
--
-- Conditionally, because these two do not exist at the same point in every
-- database. post-migration.sql re-asserts every policy BY NAME and runs AFTER
-- the migrations, so on an EXISTING database the old names are here to be
-- renamed, while on a FRESH one post-migration has not run yet and there is
-- nothing to rename — the worker's policy in particular is created only there.
-- An unguarded ALTER POLICY aborted the whole migration run on any new
-- database, which is every CI run and every new deployment (260808).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'budgeting'
                AND tablename = 'scheduled_payments'
                AND policyname = 'recurring_rules_tenant_isolation') THEN
    ALTER POLICY recurring_rules_tenant_isolation
      ON budgeting.scheduled_payments
      RENAME TO scheduled_payments_tenant_isolation;
  END IF;

  -- The worker's cross-tenant SELECT, which is how the engine finds what is
  -- due before it knows whose it is.
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'budgeting'
                AND tablename = 'scheduled_payments'
                AND policyname = 'recurring_rules_worker_cron_scan') THEN
    ALTER POLICY recurring_rules_worker_cron_scan
      ON budgeting.scheduled_payments
      RENAME TO scheduled_payments_worker_cron_scan;
  END IF;
END $$;

-- ------------------------------------------- the ledger column pointing at it
ALTER TABLE budgeting.expense_ledger
  RENAME COLUMN recurring_rule_id TO scheduled_payment_id;

ALTER TABLE budgeting.expense_ledger
  RENAME CONSTRAINT expense_ledger_recurring_rule_id_fkey
                 TO expense_ledger_scheduled_payment_id_fkey;

-- The partial unique index is what stops one payment drafting twice for the
-- same day. It survives the column rename (Postgres rewrites its definition),
-- so only its NAME needs moving.
ALTER INDEX IF EXISTS budgeting.expense_ledger_recurring_rule_date_uidx
  RENAME TO expense_ledger_scheduled_payment_date_uidx;

-- RLS is carried by the rename, but post-migration.sql re-asserts it by name on
-- every deploy; that file now names scheduled_payments. Re-assert here too so a
-- database migrated without that step is never left unforced.
ALTER TABLE budgeting.scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting.scheduled_payments FORCE ROW LEVEL SECURITY;
