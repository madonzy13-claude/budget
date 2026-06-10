-- 02-06 follow-up: Better Auth's verification model expects an `updatedAt`
-- column. Phase 1 identity schema only had created_at, so every signUp /
-- requestPasswordReset / verifyEmail call throws:
--   BetterAuthError: The field "updatedAt" does not exist in the
--   "verification" Drizzle schema.
-- Add the column with DEFAULT now() so existing rows backfill cleanly.

--> statement-breakpoint

ALTER TABLE identity.verifications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
