-- 0093: assets are never unique (Phase 13.1, round-5 scope change, user 2026-10-29).
--
-- Drops the (name, currency) index from 0090 and, defensively, 0088's name
-- index (0090 already dropped it). Any number of assets may share a name and
-- currency; a destination is picked by id. Rows that 0090 suffixed with
-- " (n)" keep their names on purpose — no data is rewritten here.

--> statement-breakpoint
DROP INDEX IF EXISTS budgeting.investments_label_ccy_uq;

--> statement-breakpoint
DROP INDEX IF EXISTS budgeting.investments_label_uq;

--> statement-breakpoint
-- Backups made `LIKE … INCLUDING ALL` copied the label index too; a re-run of
-- 0089 / 0092 over same-name assets would trip on them.
DROP INDEX IF EXISTS budgeting._investments_bak_0089_budget_id_ui_type_lower_idx;

--> statement-breakpoint
DROP INDEX IF EXISTS budgeting._investments_bak_0092_budget_id_ui_type_lower_coalesce_idx;
