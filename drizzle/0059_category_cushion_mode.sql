-- Persist the per-category cushion CONFIGURATION (mode) so the slider can show
-- "Needs only" / "Needs + Wants" / "None" independent of the stored amounts (the
-- needs/wants split isn't otherwise persisted, so the mode was only ever inferred:
-- cushion==planned → needs_wants, else → custom — which can't express needs_only).
-- Nullable: NULL keeps the legacy inference behaviour.
ALTER TABLE budgeting.categories
  ADD COLUMN IF NOT EXISTS cushion_mode text;

ALTER TABLE budgeting.categories
  DROP CONSTRAINT IF EXISTS categories_cushion_mode_chk;
ALTER TABLE budgeting.categories
  ADD CONSTRAINT categories_cushion_mode_chk
  CHECK (cushion_mode IS NULL OR cushion_mode IN
    ('none', 'needs_wants', 'needs_only', 'custom'));
