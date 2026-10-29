-- 0090 — asset labels are unique per (budget, type, name, CURRENCY)
-- (13.1 round-4 gap 23, user 2026-10-29: "avoid Erste and Erste (2) when the
-- currencies are different").
--
-- 1. drop investments_label_uq (budget, ui_type, lower(btrim(name)));
-- 2. rename "X (n)" back to "X" where a base "X" in the same budget + type
--    uses a DIFFERENT currency and nobody already owns (X, this currency) —
--    one survivor per (budget, type, X, currency) if several qualify;
-- 3. create investments_label_ccy_uq on
--    (budget_id, ui_type, lower(btrim(name)), coalesce(current_price_currency, buy_currency)).
--
-- Idempotent. FORCE RLS is lifted on investments (the migrator has no
-- BYPASSRLS; an unseeable row silently updates 0 rows — 260803) and restored.

--> statement-breakpoint
ALTER TABLE budgeting.investments NO FORCE ROW LEVEL SECURITY;

--> statement-breakpoint
DROP INDEX IF EXISTS budgeting.investments_label_uq;

--> statement-breakpoint
CREATE TEMP TABLE IF NOT EXISTS _inv_rename_0090 (
  id uuid PRIMARY KEY,
  old_name text NOT NULL,
  new_name text NOT NULL
);

--> statement-breakpoint
TRUNCATE _inv_rename_0090;

--> statement-breakpoint
INSERT INTO _inv_rename_0090 (id, old_name, new_name)
SELECT id, name, base
  FROM (
    SELECT i.id, i.name,
           regexp_replace(i.name, '\s\(\d+\)$', '') AS base,
           row_number() OVER (
             PARTITION BY i.budget_id, i.ui_type,
                          lower(btrim(regexp_replace(i.name, '\s\(\d+\)$', ''))),
                          coalesce(i.current_price_currency, i.buy_currency)
             ORDER BY i.created_at, i.id
           ) AS rn
      FROM budgeting.investments i
     WHERE i.name ~ '\s\(\d+\)$'
       AND EXISTS (
         SELECT 1 FROM budgeting.investments b
          WHERE b.budget_id = i.budget_id
            AND b.ui_type IS NOT DISTINCT FROM i.ui_type
            AND b.id <> i.id
            AND lower(btrim(b.name)) = lower(btrim(regexp_replace(i.name, '\s\(\d+\)$', '')))
            AND coalesce(b.current_price_currency, b.buy_currency)
                IS DISTINCT FROM coalesce(i.current_price_currency, i.buy_currency))
       AND NOT EXISTS (
         SELECT 1 FROM budgeting.investments c
          WHERE c.budget_id = i.budget_id
            AND c.ui_type IS NOT DISTINCT FROM i.ui_type
            AND c.id <> i.id
            AND lower(btrim(c.name)) = lower(btrim(regexp_replace(i.name, '\s\(\d+\)$', '')))
            AND coalesce(c.current_price_currency, c.buy_currency)
                IS NOT DISTINCT FROM coalesce(i.current_price_currency, i.buy_currency))
  ) s
 WHERE s.rn = 1;

--> statement-breakpoint
-- Backup (owner-only). Never CREATE … AS: under RLS that copies nothing.
CREATE TABLE IF NOT EXISTS budgeting._investments_bak_0090 (LIKE budgeting.investments INCLUDING DEFAULTS);

--> statement-breakpoint
REVOKE ALL ON budgeting._investments_bak_0090 FROM PUBLIC, app_role, worker_role;

--> statement-breakpoint
INSERT INTO budgeting._investments_bak_0090
SELECT i.* FROM budgeting.investments i
  JOIN _inv_rename_0090 r ON r.id = i.id
 WHERE NOT EXISTS (SELECT 1 FROM budgeting._investments_bak_0090 b WHERE b.id = i.id);

--> statement-breakpoint
UPDATE budgeting.investments i
   SET name = r.new_name
  FROM _inv_rename_0090 r
 WHERE r.id = i.id
   AND EXISTS (SELECT 1 FROM budgeting._investments_bak_0090 b WHERE b.id = i.id);

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS investments_label_ccy_uq
  ON budgeting.investments (
    budget_id, ui_type, lower(btrim(name)),
    coalesce(current_price_currency, buy_currency)
  );

--> statement-breakpoint
ALTER TABLE budgeting.investments FORCE ROW LEVEL SECURITY;
