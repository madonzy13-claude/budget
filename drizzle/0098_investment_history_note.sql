-- 0098: a note on a sale out of investments (Phase 13.1, round 6, user).
-- Optional, ≤ 200 chars; the ledger row shows it where a linked asset would.
ALTER TABLE budgeting.investment_history ADD COLUMN IF NOT EXISTS note text;

--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE budgeting.investment_history
    ADD CONSTRAINT investment_history_note_len CHECK (note IS NULL OR char_length(note) <= 200);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
