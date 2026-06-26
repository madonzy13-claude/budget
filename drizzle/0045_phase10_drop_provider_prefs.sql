-- Phase 10: remove the AI/voice Provider feature (USET-08).
-- Drops the two LLM/STT provider-preference columns. Nullable text holding only a
-- discarded feature's enum — no FK, no index beyond the column, nothing depends on them.
-- Run LAST (after all code stops referencing the columns) so no live code reads a dropped column.
-- Idempotent.

--> statement-breakpoint
ALTER TABLE identity.users DROP COLUMN IF EXISTS preferred_llm_provider;
--> statement-breakpoint
ALTER TABLE identity.users DROP COLUMN IF EXISTS preferred_stt_provider;
