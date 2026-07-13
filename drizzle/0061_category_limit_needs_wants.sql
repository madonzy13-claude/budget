-- Persist the per-category needs/wants SPLIT of the planned amount, so the
-- category edit slider can prefill it instead of collapsing everything into
-- Needs (needs = planned total, wants = 0) on reopen. normal_amount stays the
-- authoritative planned total (= needs + wants); these two just record the split.
-- Nullable: NULL keeps the legacy behaviour (needs = normal_amount, wants = 0).
ALTER TABLE budgeting.category_limits
  ADD COLUMN IF NOT EXISTS needs_amount bigint;

ALTER TABLE budgeting.category_limits
  ADD COLUMN IF NOT EXISTS wants_amount bigint;
