# Phase 1: Schema Migration & Rename Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 1-Schema Migration & Rename Foundation
**Areas discussed:** Migration shape, Cushion-mode history, Rename PR / plan shape, Phase 1 ↔ Phase 2 boundary

---

## Migration shape

| Option       | Description                                                                                                                                                                                                                 | Selected |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RENAME chain | Drizzle-kit generates `ALTER TABLE/COLUMN RENAME` from renamed schema files. Preserves RLS policies + indexes. Smaller diff. Replay-safe.                                                                                   |          |
| DROP+CREATE  | Hand-write one big migration: drop legacy tables, create renamed tables fresh. Cleaner SQL narrative but destructive.                                                                                                       |          |
| Hybrid       | RENAME survivors (`workspaces`→`budgets`, `accounts`→`wallets`); CREATE new (`tasks`, `wallet_type` enum, `sort_index`, `cushion_mode_enabled`, `cushion_amount_cents`); DROP removed columns. Drizzle does this naturally. | ✓        |

**User's choice:** Hybrid
**Notes:** Maps directly to a single `drizzle-kit generate` run after editing schema files in place. RLS policies reattach automatically through Postgres RENAME semantics.

---

## Cushion-mode history

| Option                         | Description                                                                                                                                  | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Boolean + SCD-2 history (dual) | `budgets.cushion_mode_enabled` boolean for current; renamed `budget_mode_history` SCD-2 table for as-of-month lookup. Reuses existing infra. | ✓        |
| History-only                   | Drop boolean. Derive current from `effective_to IS NULL` row. One source of truth; every read pays join cost.                                |          |
| Boolean + audit log only       | Boolean column + emit audit-log event on flip. No dedicated SCD-2; replay log to reconstruct history.                                        |          |

**User's choice:** Boolean + SCD-2 history (dual)
**Notes:** Existing `workspace_budget_mode_history` table (`NORMAL`|`CUSHION` CHECK constraint) is renamed and reused. Toggle writes both atomically inside one transaction. UI reads the boolean; RSCM-02 reads SCD-2 rows for historical month calculation.

---

## Rename PR / plan shape

| Option            | Description                                                                                                                                                | Selected |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Layered waves     | 01-01 schema/migration → 01-02 domain → 01-03 API routes → 01-04 i18n + CI gate + web client. Sequential. Each plan independently reviewable + revertable. | ✓        |
| Single sweep plan | One plan that touches everything atomically. Smallest count, biggest diff. Pain to review.                                                                 |          |
| Parallel waves    | Schema/migration first; i18n parallel; domain+API after schema. Some parallelism but coordination overhead.                                                |          |

**User's choice:** Layered waves
**Notes:** Plan-level ordering: schema before domain before API before web. Tenant-leak CI gate folded into plan 01-04 alongside i18n + api-client URL update.

---

## Phase 1 ↔ Phase 2 boundary — Route-body scope

| Option                | Description                                                                                                                                                               | Selected |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Minimum compile-fix   | Strip dropped-column refs from Drizzle queries + repos so app builds post-migration. Hono request/response shapes stay v1.0-ish (minus dropped fields). Phase 2 reshapes. | ✓        |
| Full strip in Phase 1 | Remove kind/account_id from request/response Zod schemas + adjust routes. Phase 2 adds new fields (FX, drafts) on top.                                                    |          |
| Defer DROP COLUMN     | Phase 1 only RENAMEs; columns stay nullable. Actual DROP shipped with Phase 2 reshape. Violates MIG-03 literal text.                                                      |          |

**User's choice:** Minimum compile-fix
**Notes:** Keeps Phase 1 surface bounded. Phase 2 reshapes route bodies for the categorical-only transaction schema, FX side-slider amounts, recurring engine.

---

## Phase 1 ↔ Phase 2 boundary — Web-client scope

| Option                    | Description                                                                                                                        | Selected |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Update api-client.ts only | Mechanical `/workspaces`→`/budgets` URL change in `api-client.ts`. v1.0 pages keep working until Phase 3 restructures. No 404 gap. | ✓        |
| Leave web on old URLs     | Phase 1 → Phase 3 window has web pages calling 404 routes. Accept the gap; faster Phase 1.                                         |          |
| Temporary route aliases   | Ship `/workspaces/*` + `/budgets/*` in Phase 1; remove aliases in Phase 3. Contradicts roadmap criterion #5 'no aliases'.          |          |

**User's choice:** Update api-client.ts only
**Notes:** v1.0 web pages (workspaces list, transactions, budget, recurring) keep functioning via renamed API surface. UI structure restructure is Phase 3's job. Search for any hardcoded `/workspaces` or `/accounts` URL strings in `apps/web/src/**/*.tsx` and update them alongside the api-client change.

---

## Claude's Discretion

- **Tasks table internals** — RLS policy shape, indexes, FK shape, enum vs text+CHECK for `kind`. Planner applies the same tenant-isolation pattern used by `workspace_budget_mode_history`. Generators land in Phase 7.
- **`categories.sort_index` default** — `default 0 not null`. Onboarding wizard (Phase 6) assigns increments at seed time.
- **i18n key rename approach** — rewrite each locale JSON in place; codemod via `sed`/`jq` acceptable; manual review for `i18n_key_path` strings inside `*.tsx` components.
- **Drizzle migration file naming** — `drizzle/0012_phase01_v11_rename.sql`, next sequential after `0011_plan_02_08_recurring.sql`.
- **Cushion column lifecycle on `category_limits`** — reuse existing SCD-2 pattern (close old row + insert new row with `effective_from = today`).

## Deferred Ideas

- **Income tracking + transfer ledger** — explicitly out of scope for v1.1 (REQUIREMENTS.md §Out of scope).
- **Wallet↔transaction linkage** — explicitly out of scope for v1.1.
- **Materialized view for reserves auto-compute** — Phase 2 (Risk Register row 2).
- **`balance_adjustments` table fate** — planner of plan 01-01 decides whether to DROP in Phase 1 or leave dormant.
- **Drag-reorder UI for `categories.sort_index`** — Phase 4 (GRID-09).
- **Tasks generators + banner UI** — Phase 7.
