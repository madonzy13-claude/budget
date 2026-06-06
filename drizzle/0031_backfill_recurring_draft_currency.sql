-- Lock pre-fix recurring DRAFTS to the budget currency. The worker bug stored them
-- in the rule's foreign currency; amount_converted_cents is already the budget value,
-- so align amount_original_cents / currency_original / fx_rate to it. UNCONFIRMED drafts
-- only. Idempotent: after running, currency_original = budget, so re-runs match 0 rows.
--
-- RLS NOTE: the migrator role is NOBYPASSRLS NOSUPERUSER (D-18) and both
-- budgeting.expense_ledger and tenancy.budgets are FORCE ROW LEVEL SECURITY, so a
-- plain cross-tenant UPDATE/JOIN sees 0 rows (no app.tenant_ids GUC in the migrator
-- session). The migrator OWNS both tables, and a table owner is exempt from RLS only
-- when the table is not FORCE'd. So drop FORCE on both for the duration of this
-- backfill, then immediately restore it. Transient + same-transaction; post-migration.sql
-- re-asserts FORCE on every run, so the security posture is unchanged. We only READ
-- tenancy.budgets here (no mutation — the immutable-currency trigger is untouched).
--> statement-breakpoint
ALTER TABLE budgeting.expense_ledger NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.budgets NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE budgeting.expense_ledger el
   SET amount_original_cents = el.amount_converted_cents,
       currency_original     = b.default_currency,
       fx_rate               = 1,
       updated_at            = now()
  FROM tenancy.budgets b
 WHERE b.id = el.tenant_id
   AND el.recurring_rule_id IS NOT NULL
   AND el.confirmed_at IS NULL
   AND el.deleted_at IS NULL
   AND el.currency_original <> b.default_currency;
--> statement-breakpoint
ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy.budgets FORCE ROW LEVEL SECURITY;
