-- Phase 9.2: make the global-universe search "very very fast" at ~219k rows.
-- The 0038 GIN index is on the CONCATENATED expression (symbol || ' ' || display_name),
-- which the search query's per-column predicates (symbol ILIKE 'q%' OR display_name
-- ILIKE '%q%') cannot use → it seq-scanned (~95 ms). Add a trigram GIN index PER column
-- so both ILIKE arms are index-driven (BitmapOr) → single-digit ms.
-- Idempotent (IF NOT EXISTS). pg_trgm already enabled in 0038.

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS instruments_symbol_trgm
  ON budgeting.instruments USING GIN (symbol gin_trgm_ops);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS instruments_display_name_trgm
  ON budgeting.instruments USING GIN (display_name gin_trgm_ops);
