-- Per-USER UI preferences, for the surfaces that belong to no single budget.
--
-- 0070 gave each budget MEMBER a preferences bag, which is the right home for
-- anything scoped to one budget. The all-budgets aggregate page is scoped to
-- none of them: it is the person's own view across every budget they can see,
-- so its range selector has nowhere to store its pick and was starting from
-- scratch on every device (user request, 260805).
--
-- Same shape as the member bag on purpose — one free-form jsonb keyed by the
-- thing being remembered, so the next preference needs no migration of its own.
ALTER TABLE identity.user_preferences
  ADD COLUMN IF NOT EXISTS ui_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
