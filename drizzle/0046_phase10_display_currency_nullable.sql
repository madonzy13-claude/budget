-- Phase 10 UAT: the global display currency should default to the user's FIRST
-- budget's currency (seeded at budget creation), and stay unset until then.
-- Drop the hard-coded USD default + NOT NULL so a fresh user starts NULL; the
-- budget-create path writes it via setDisplayCurrencyIfUnset (only-if-NULL), and
-- findById coalesces NULL -> "USD" so the DTO contract stays a string.
-- Existing rows keep their current value (already "USD") and are untouched.
-- Idempotent: DROP DEFAULT / DROP NOT NULL are no-ops if already applied.

--> statement-breakpoint
ALTER TABLE identity.users ALTER COLUMN display_currency DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE identity.users ALTER COLUMN display_currency DROP NOT NULL;
