-- 0081 — a budget's name belongs to the reader (260808, user request).
--
-- One shared budget, two households' worth of vocabulary: what the owner calls
-- "Family Budget" the other member may want to see as "Dom". Until now the name
-- was a single column on the budget, so renaming it reached across to everyone
-- else's screen.
--
-- The override rides the MEMBERSHIP row, which is already the place per-member
-- state lives (ui_prefs, ownership_share_pct). NULL means "no opinion" and the
-- budget's own name is what shows — so every existing member keeps exactly the
-- name they have today, and a new member starts from the shared one.
--
-- budgets.name stays as the canonical name: it is what a fresh member falls
-- back to, and what invitations and emails speak of.
ALTER TABLE tenancy.budget_members
  ADD COLUMN IF NOT EXISTS display_name text;

-- Same bound as the budget's own name (patchBudgetSchema, 80 chars), and a
-- blank string is not a name — the API clears to NULL rather than storing one,
-- and the check stops any other writer from inventing an empty pill.
ALTER TABLE tenancy.budget_members
  DROP CONSTRAINT IF EXISTS budget_members_display_name_chk;
ALTER TABLE tenancy.budget_members
  ADD CONSTRAINT budget_members_display_name_chk
  CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 80));
