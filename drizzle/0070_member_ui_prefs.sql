-- Per-member UI preferences that must follow the MEMBER, not the device.
-- The Overview's category pickers ("How each month tracked against plan" and
-- "Planned spendings, by category") kept their choice in localStorage, so the
-- same person opening the budget on a second device was back to "All
-- categories" (user report, 260802). One free-form jsonb bag keyed by the
-- chart, so a new picker needs no migration of its own.
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
