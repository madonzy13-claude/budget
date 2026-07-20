-- Ownership shares are now self-set per member, no Σ=100 cross-member
-- constraint. Default becomes 100 (was 0) so every member counts their full
-- share toward their own all-budgets total unless they choose otherwise.
ALTER TABLE tenancy.budget_members ALTER COLUMN ownership_share_pct SET DEFAULT 100;
UPDATE tenancy.budget_members SET ownership_share_pct = 100;
