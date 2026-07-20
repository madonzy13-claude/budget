-- Per-member aggregation settings (all-budgets aggregate overview).
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS ownership_share_pct SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS include_in_aggregation BOOLEAN NOT NULL DEFAULT true;

-- Backfill: the owner of each existing budget owns 100%, everyone else 0%.
UPDATE tenancy.budget_members SET ownership_share_pct = 100 WHERE role = 'owner';
UPDATE tenancy.budget_members SET ownership_share_pct = 0 WHERE role <> 'owner';
