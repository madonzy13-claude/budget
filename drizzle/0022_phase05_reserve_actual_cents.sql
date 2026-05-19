-- Phase 05 UAT-PH5-T3-54: reserves architecture pivot — actual is stored per category.
--
-- Adds budgeting.categories.reserve_actual_cents BIGINT NOT NULL DEFAULT 0.
-- Mutated only by domain events (set-expected, exclude, wallet-balance edit);
-- never auto-rebalanced on read. Companion code lives in
-- packages/budgeting/src/domain/reserve-allocator.ts.

--> statement-breakpoint

ALTER TABLE "budgeting"."categories"
  ADD COLUMN IF NOT EXISTS "reserve_actual_cents" bigint NOT NULL DEFAULT 0;
