-- Phase 2 (Plan 02-01): Consolidated domain restructure migration.
-- Hand-authored (drizzle-kit requires TTY; same approach as 0011_* and 0012_*).
-- Idempotent throughout — safe to replay on fresh DB or upgrade.
--
-- Sections:
--   A) expense_ledger column reshape (TXN-01..08)
--   B) recurring_rules cadence extension (RECR-01, RECR-02)
--   C) DROP recurring_drafts table (D-PH2-08 — folded into expense_ledger)
--   D) CREATE tenancy.budget_share_links overlay table (SHRD-01..05)
--   E) CREATE budgeting.category_reserve_balance VIEW (RSCM-01, RSCM-02)

-- ============================================================
-- Section A: expense_ledger column reshape (TXN-01..08)
-- ============================================================

--> statement-breakpoint

-- A1. amount_orig → amount_original_cents (numeric→bigint via cents conversion)
-- Step 1: add intermediate column and populate
DO $$
BEGIN
  -- Rename amount_orig → amount_original_decimal if it exists and amount_original_cents does not
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='amount_orig'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger RENAME COLUMN amount_orig TO amount_original_decimal';
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='amount_original_cents'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD COLUMN amount_original_cents bigint';
    EXECUTE 'UPDATE budgeting.expense_ledger SET amount_original_cents = ROUND(amount_original_decimal * 100)::bigint';
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ALTER COLUMN amount_original_cents SET NOT NULL';
  END IF;
END $$;

--> statement-breakpoint

-- Drop the intermediate decimal column once bigint is populated
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS amount_original_decimal;

--> statement-breakpoint

-- A2. amount_default → amount_converted_cents (numeric→bigint via cents conversion)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='amount_default'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger RENAME COLUMN amount_default TO amount_converted_decimal';
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='amount_converted_cents'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD COLUMN amount_converted_cents bigint';
    EXECUTE 'UPDATE budgeting.expense_ledger SET amount_converted_cents = ROUND(amount_converted_decimal * 100)::bigint';
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ALTER COLUMN amount_converted_cents SET NOT NULL';
  END IF;
END $$;

--> statement-breakpoint

ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS amount_converted_decimal;

--> statement-breakpoint

-- A3. currency_orig → currency_original
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='currency_orig'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='currency_original'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger RENAME COLUMN currency_orig TO currency_original';
  END IF;
END $$;

--> statement-breakpoint

-- A4. fx_rate_date → fx_as_of
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='fx_rate_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='fx_as_of'
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger RENAME COLUMN fx_rate_date TO fx_as_of';
  END IF;
END $$;

--> statement-breakpoint

-- A5. Drop wallet_id from expense_ledger (wallet linkage removed per TXN-02)
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS wallet_id;

--> statement-breakpoint

-- A6. Drop currency_default (budget currency is now on the budget row; fx_as_of stores the rate date)
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS currency_default;

--> statement-breakpoint

-- A7. Drop fx_provider (provider attribution not needed at row level; sourced from fx_rates table)
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS fx_provider;

--> statement-breakpoint

-- A8. DROP account_balance_adjustments (D-PH2-09: wallet balances are manual snapshots; table is obsolete)
DROP TABLE IF EXISTS budgeting.account_balance_adjustments CASCADE;

--> statement-breakpoint

-- A9. budget_id column: ensure expense_ledger has budget_id (tenant_id IS the budget_id in this schema)
-- The existing tenant_id column serves this role. Add budget_id as alias if not present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='budget_id'
  ) THEN
    -- budget_id = tenant_id (budget IS the tenant boundary in this single-workspace model)
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD COLUMN budget_id uuid';
    EXECUTE 'UPDATE budgeting.expense_ledger SET budget_id = tenant_id';
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ALTER COLUMN budget_id SET NOT NULL';
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD CONSTRAINT expense_ledger_budget_id_fk
             FOREIGN KEY (budget_id) REFERENCES tenancy.budgets(id) ON DELETE CASCADE';
  END IF;
END $$;

--> statement-breakpoint

-- A10. Narrow kind column to SPENDING|INCOME (drop old EXPENSE|INCOME|TRANSFER)
-- Use intermediate rename to avoid data loss
ALTER TABLE budgeting.expense_ledger DROP CONSTRAINT IF EXISTS expense_ledger_kind_chk;

--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='kind'
  ) THEN
    -- kind column exists: add new col, migrate, drop old
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'expense_ledger_kind_v11_chk'
        AND conrelid = 'budgeting.expense_ledger'::regclass
    ) THEN
      -- Migrate TRANSFER → SPENDING, EXPENSE → SPENDING, INCOME stays INCOME
      EXECUTE 'ALTER TABLE budgeting.expense_ledger RENAME COLUMN kind TO kind_old';
      EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD COLUMN kind text NOT NULL DEFAULT ''SPENDING''';
      EXECUTE $sql$UPDATE budgeting.expense_ledger
                   SET kind = CASE kind_old
                     WHEN 'INCOME'   THEN 'INCOME'
                     ELSE 'SPENDING'
                   END$sql$;
      EXECUTE 'ALTER TABLE budgeting.expense_ledger DROP COLUMN kind_old';
    END IF;
  ELSE
    -- kind column does not exist at all: add fresh
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT ''SPENDING''';
  END IF;
END $$;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_ledger_kind_chk'
      AND conrelid = 'budgeting.expense_ledger'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE budgeting.expense_ledger ADD CONSTRAINT expense_ledger_kind_chk
             CHECK (kind IN (''SPENDING'',''INCOME''))';
  END IF;
END $$;

--> statement-breakpoint

-- A11. Add recurring_rule_id (FK to recurring_rules; NULL for manual entries)
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS recurring_rule_id uuid NULL
  REFERENCES budgeting.recurring_rules(id) ON DELETE SET NULL;

--> statement-breakpoint

-- A12. Add confirmed_at (NULL = draft per D-PH2-08)
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL;

--> statement-breakpoint

-- A13. Add updated_at column (for PATCH support)
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

--> statement-breakpoint

-- A14. Add deleted_at for soft-delete
ALTER TABLE budgeting.expense_ledger
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

--> statement-breakpoint

-- A15. Unique index for idempotency: (recurring_rule_id, date) — prevents duplicate drafts (T-02-03 mitigation)
CREATE UNIQUE INDEX IF NOT EXISTS expense_ledger_recurring_rule_date_uidx
  ON budgeting.expense_ledger (recurring_rule_id, transaction_date)
  WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL;

--> statement-breakpoint

-- A16. Drop legacy columns no longer needed
-- corrects_id: correction chain removed in Phase 2 (TXN-08)
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS corrects_id;

--> statement-breakpoint
-- transfer_group_id: transfer type removed in Phase 2
ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS transfer_group_id;

--> statement-breakpoint

-- ============================================================
-- Section B: recurring_rules cadence extension (RECR-01, RECR-02)
-- ============================================================

--> statement-breakpoint

-- B1. Drop wallet_id from recurring_rules (categorical-only rules per RESEARCH §A3)
ALTER TABLE budgeting.recurring_rules DROP COLUMN IF EXISTS wallet_id;

--> statement-breakpoint

-- B2. Drop kind from recurring_rules (all rules produce SPENDING drafts per D-PH2-09)
ALTER TABLE budgeting.recurring_rules DROP CONSTRAINT IF EXISTS recurring_rules_kind_chk;

--> statement-breakpoint

ALTER TABLE budgeting.recurring_rules DROP COLUMN IF EXISTS kind;

--> statement-breakpoint

-- B3. Extend cadence CHECK constraint to include DAILY and YEARLY
ALTER TABLE budgeting.recurring_rules DROP CONSTRAINT IF EXISTS recurring_rules_cadence_chk;

--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_rules_cadence_chk'
      AND conrelid = 'budgeting.recurring_rules'::regclass
  ) THEN
    EXECUTE $sql$ALTER TABLE budgeting.recurring_rules
                 ADD CONSTRAINT recurring_rules_cadence_chk
                 CHECK (cadence IN ('DAILY','WEEKLY','MONTHLY','YEARLY'))$sql$;
  END IF;
END $$;

--> statement-breakpoint

-- B4. Add yearly_month column (1-12) for YEARLY cadence rules
ALTER TABLE budgeting.recurring_rules
  ADD COLUMN IF NOT EXISTS yearly_month integer NULL;

--> statement-breakpoint

-- B5. Add check: yearly_month must be 1-12 when cadence=YEARLY, NULL otherwise
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_rules_yearly_month_chk'
      AND conrelid = 'budgeting.recurring_rules'::regclass
  ) THEN
    EXECUTE $sql$ALTER TABLE budgeting.recurring_rules
                 ADD CONSTRAINT recurring_rules_yearly_month_chk
                 CHECK (
                   (cadence <> 'YEARLY' AND yearly_month IS NULL) OR
                   (cadence = 'YEARLY' AND yearly_month BETWEEN 1 AND 12)
                 )$sql$;
  END IF;
END $$;

--> statement-breakpoint

-- B6. Add check: cadence_anchor semantics per cadence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_rules_cadence_anchor_chk'
      AND conrelid = 'budgeting.recurring_rules'::regclass
  ) THEN
    EXECUTE $sql$ALTER TABLE budgeting.recurring_rules
                 ADD CONSTRAINT recurring_rules_cadence_anchor_chk
                 CHECK (
                   (cadence IN ('MONTHLY','YEARLY') AND cadence_anchor BETWEEN 1 AND 31) OR
                   (cadence IN ('DAILY','WEEKLY') AND cadence_anchor IS NULL) OR
                   cadence_anchor IS NULL
                 )$sql$;
  END IF;
END $$;

--> statement-breakpoint

-- ============================================================
-- Section C: DROP recurring_drafts table (D-PH2-08)
-- Drafts are now expense_ledger rows with confirmed_at IS NULL.
-- ============================================================

--> statement-breakpoint

DROP TABLE IF EXISTS budgeting.recurring_drafts CASCADE;

--> statement-breakpoint

-- ============================================================
-- Section D: CREATE tenancy.budget_share_links overlay table (SHRD-01..05)
-- ============================================================

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS tenancy.budget_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id uuid NOT NULL REFERENCES tenancy.budgets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  token text NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  accepted_by uuid NULL,
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS budget_share_links_token_uidx
  ON tenancy.budget_share_links (token);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS budget_share_links_active_idx
  ON tenancy.budget_share_links (budget_id)
  WHERE revoked_at IS NULL AND accepted_by IS NULL;

--> statement-breakpoint

-- ============================================================
-- Section E: CREATE budgeting.category_reserve_balance VIEW (RSCM-01, RSCM-02)
-- WITH RECURSIVE CTE walks months from first limit/txn to current month.
-- Cushion-mode-as-of-month respected via budget_mode_history SCD-2 JOIN.
-- GREATEST(0,...) ensures reserve never goes below zero.
-- ============================================================

--> statement-breakpoint

CREATE OR REPLACE VIEW budgeting.category_reserve_balance AS
WITH RECURSIVE months AS (
  SELECT
    cl.budget_id,
    cl.category_id,
    cl.tenant_id,
    LEAST(
      COALESCE(date_trunc('month', MIN(cl.effective_from))::date, date_trunc('month', CURRENT_DATE)::date),
      COALESCE(date_trunc('month', MIN(e.date))::date,           date_trunc('month', CURRENT_DATE)::date)
    ) AS month_start
  FROM budgeting.category_limits cl
  LEFT JOIN budgeting.expense_ledger e
    ON e.category_id = cl.category_id AND e.deleted_at IS NULL
  GROUP BY cl.budget_id, cl.category_id, cl.tenant_id

  UNION ALL

  SELECT budget_id, category_id, tenant_id,
         (month_start + INTERVAL '1 month')::date
  FROM months
  WHERE month_start < date_trunc('month', CURRENT_DATE)::date
),
monthly_spent AS (
  SELECT
    e.budget_id, e.category_id,
    date_trunc('month', e.transaction_date)::date AS month_start,
    SUM(CASE WHEN e.kind = 'SPENDING' THEN e.amount_converted_cents
             WHEN e.kind = 'INCOME'   THEN -e.amount_converted_cents
             ELSE 0 END) AS spent_cents
  FROM budgeting.expense_ledger e
  WHERE e.confirmed_at IS NOT NULL AND e.deleted_at IS NULL
  GROUP BY e.budget_id, e.category_id, date_trunc('month', e.transaction_date)
),
mode_per_month AS (
  SELECT DISTINCT
    m.budget_id, m.month_start,
    COALESCE(
      (SELECT bmh.mode FROM budgeting.budget_mode_history bmh
       WHERE bmh.budget_id = m.budget_id
         AND bmh.effective_from <= m.month_start
         AND (bmh.effective_to IS NULL OR bmh.effective_to > m.month_start)
       ORDER BY bmh.effective_from DESC LIMIT 1),
      'NORMAL'
    ) AS mode
  FROM months m
),
budget_per_month AS (
  SELECT
    cl.budget_id, cl.category_id, cl.tenant_id, m.month_start,
    CASE WHEN mpm.mode = 'CUSHION' THEN COALESCE(cl.cushion_amount_cents, 0)
         ELSE COALESCE(cl.planned_amount_cents, 0) END AS active_budget_cents
  FROM months m
  JOIN budgeting.category_limits cl
    ON cl.category_id = m.category_id
   AND cl.budget_id  = m.budget_id
   AND cl.effective_from <= m.month_start
   AND (cl.effective_to IS NULL OR cl.effective_to > m.month_start)
  LEFT JOIN mode_per_month mpm
    ON mpm.budget_id = m.budget_id AND mpm.month_start = m.month_start
),
reserve_accum AS (
  SELECT
    bpm.budget_id, bpm.category_id, bpm.tenant_id, bpm.month_start,
    GREATEST(0, bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)) AS reserve_cents
  FROM budget_per_month bpm
  LEFT JOIN monthly_spent ms
    ON ms.budget_id = bpm.budget_id AND ms.category_id = bpm.category_id AND ms.month_start = bpm.month_start
  WHERE bpm.month_start = (SELECT MIN(month_start) FROM budget_per_month bpm2
                           WHERE bpm2.budget_id = bpm.budget_id AND bpm2.category_id = bpm.category_id)

  UNION ALL

  SELECT
    bpm.budget_id, bpm.category_id, bpm.tenant_id, bpm.month_start,
    GREATEST(0,
      ra.reserve_cents + bpm.active_budget_cents - COALESCE(ms.spent_cents, 0)
    ) AS reserve_cents
  FROM reserve_accum ra
  JOIN budget_per_month bpm
    ON bpm.budget_id = ra.budget_id
   AND bpm.category_id = ra.category_id
   AND bpm.month_start = (ra.month_start + INTERVAL '1 month')::date
  LEFT JOIN monthly_spent ms
    ON ms.budget_id = bpm.budget_id AND ms.category_id = bpm.category_id AND ms.month_start = bpm.month_start
)
SELECT
  budget_id,
  category_id,
  tenant_id,
  reserve_cents AS balance_cents
FROM reserve_accum ra1
WHERE month_start = (
  SELECT MAX(month_start) FROM reserve_accum ra2
  WHERE ra2.budget_id = ra1.budget_id AND ra2.category_id = ra1.category_id
);
