-- 15-21 (decision b2): an imported wallet-balance history is stored as dated
-- wealth snapshots. 'import' marks them; only those can ever be deleted
-- (rollback / undo). The worker's INSERT names no source and stays 'worker'.
ALTER TABLE budgeting.budget_wealth_snapshots
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'worker'
  CHECK (source IN ('worker', 'import'));
