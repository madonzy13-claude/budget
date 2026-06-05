-- Phase 05 reserve model REWRITE (decision B): reset & rebuild.
-- Drops the OLD expected-accrual VIEW and the greedy stored "actual" column.
-- The new model is replay-on-read from category_reserve_adjustments (kept) +
-- transactions + category_limits + budget_mode_history (all kept).
-- KEEPS: category_reserve_adjustments, budgets.reserves_enabled, categories
--        archive cols (archived_at, archived_from, reserve_excluded),
--        budget_mode_history, RESERVE wallets.
--
-- The new reserve-engine (packages/budgeting/src/domain/reserve-engine.ts)
-- folds an ordered event stream on read; it needs the raw events, not a
-- precomputed balance. The category_reserve_balance VIEW (migrations
-- 0013/0014/0020/0023/0029) computed the OLD expected-accrual model and is
-- replaced. reserve_actual_cents (migration 0022) stored the OLD greedy
-- "actual" and is dead. Both are dropped here with IF-EXISTS guards so the
-- migration is idempotent and the live DB regenerates Drizzle types from the
-- new shape. Dropping the VIEW also removes its dependent grants
-- (app_role, worker_role); no grant cleanup needed.

--> statement-breakpoint
DROP VIEW IF EXISTS budgeting.category_reserve_balance;
--> statement-breakpoint
ALTER TABLE budgeting.categories DROP COLUMN IF EXISTS reserve_actual_cents;
