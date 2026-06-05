-- 0028_category_archived_from.sql
-- UAT follow-up (issue 1b): month-scoped category removal.
--
-- `archived_from` is the first month a category is hidden:
--   NULL                  → active everywhere.
--   = a month start       → "keep history": visible in months BEFORE it, hidden
--                           from that month onward (archived_at stays NULL).
--   = '0001-01-01' (epoch)→ "remove everywhere": hidden in every month. Paired
--                           with archived_at so the existing archived_at IS NULL
--                           read filters keep hiding it without further changes.
--
-- A category is VISIBLE for month M when:
--   archived_at IS NULL AND (archived_from IS NULL OR archived_from > M)

ALTER TABLE budgeting.categories
  ADD COLUMN IF NOT EXISTS archived_from DATE;

-- Backfill: every already-archived category was hidden everywhere → epoch.
UPDATE budgeting.categories
   SET archived_from = DATE '0001-01-01'
 WHERE archived_at IS NOT NULL
   AND archived_from IS NULL;
