-- Phase 10 UAT: persist the user's UI theme so it follows them across devices.
-- Nullable; a NULL reads back as "dark" (app default) at the repo boundary.
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS theme text;
