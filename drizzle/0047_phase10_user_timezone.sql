-- Phase 10 UAT (#3/#4): per-user IANA timezone so every date renders in the
-- user's local zone. Nullable: seeded at sign-up from the browser's resolved
-- timezone; a NULL reads back as "UTC" at the repo boundary. Existing rows stay
-- NULL (→ "UTC") until the user picks a zone in General settings.
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op if already applied.

--> statement-breakpoint
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS timezone text;
