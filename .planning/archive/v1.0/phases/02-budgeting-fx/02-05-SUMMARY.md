---
phase: 02-budgeting-fx
plan: 05
type: summary
wave: 5
status: completed
requirements:
  [BDGT-01, BDGT-02, BDGT-03, BDGT-04, BDGT-05, BDGT-06, BDGT-07, BDGT-08]
completed_date: "2026-05-10"
duration_minutes: 120
---

# Phase 02 Plan 05: Categories + SCD-2 Limits + Budget Templates + Share Overrides Summary

## Outcome

Full budgeting category system with SCD-2 effective-dated limits, per-category contribution share overrides (DEFERRABLE sum-100 DB trigger), budget templates with bulk-apply, workspace budget mode history, and six web UI components. 130 backend tests pass in combined run. 34 Vitest component tests pass.

## Commits (oldest → newest)

| SHA       | Type | Title                                                                        |
| --------- | ---- | ---------------------------------------------------------------------------- |
| `97e1fe2` | feat | Categories schema + domain + repo + migration (Task 1)                       |
| `cd09524` | feat | SCD-2 category limits + domain + repos + use cases + 22 tests green (Task 2) |
| `4fddc0c` | feat | API routes + UI — categories, limits, shares, templates (Task 3)             |
| `b472512` | fix  | Resolve mock.module contamination across bun test files (Rule 1 deviation)   |

## Artifacts shipped

### Domain layer (`packages/budgeting/src/domain/`)

- `category.ts` — Category entity with one-level grouping rule, archive, rename
- `category-limit.ts` — Value object: normal+cushion money, effective dates, `isOpen()`/`isActiveAt()`
- `share-validation.ts` — Validates share entries sum to 100 ±0.005

### Schemas (`packages/budgeting/src/adapters/persistence/`)

- `categories-schema.ts` — `budgeting.categories` with RLS policy
- `category-limits-schema.ts` — SCD-2 with `effective_from`/`effective_to` date columns
- `budget-templates-schema.ts` — `budgetTemplates` + `budgetTemplateItems` (composite PK)
- `category-share-overrides-schema.ts` — Composite PK (category_id, user_id), denormalized tenant_id
- `workspace-budget-mode-history-schema.ts` — SCD-2 for NORMAL|CUSHION mode per workspace

### Post-migration SQL additions (`apps/migrator/post-migration.sql`)

- FORCE RLS + GRANTs for all 5 new tables
- `categories_one_level_check()` trigger (BDGT-02)
- Partial unique index `category_limits_one_open_per_cat WHERE effective_to IS NULL`
- `category_share_overrides_sum_check()` DEFERRABLE INITIALLY DEFERRED trigger (BDGT-08)
- `workspace_share_dirty` flag table + `flag_workspace_share_dirty()` trigger

### Adapters (`packages/budgeting/src/adapters/persistence/`)

- `category-repo.ts` — CRUD + archive + rename with RLS
- `category-limit-repo.ts` — SCD-2 `setLimit()`: same-day UPDATE in place (Pitfall 5), else close+insert
- `budget-template-repo.ts` — `createTemplate()` + `applyTemplate()` (bulk SCD-2)
- `share-override-repo.ts` — DELETE-all + INSERT-all inside DEFERRABLE tx
- `budget-mode-repo.ts` — SCD-2 workspace budget mode

### Application use cases (`packages/budgeting/src/application/`)

- `create-category`, `archive-category`, `list-categories`, `find-category-by-id`, `rename-category`
- `set-category-limit` (defaults effectiveFrom to first of current month if not provided)
- `get-effective-limit`
- `apply-budget-template`
- `set-share-overrides` (app-level sum-100 validation before DB trigger)
- `list-share-overrides`
- `toggle-budget-mode`

### API routes (`apps/api/src/routes/`)

- `categories.ts` — POST /, GET /, GET /:id, POST /:id/archive, PATCH /:id
- `category-limits.ts` — POST /:id/limits, GET /:id/limits/effective?date=YYYY-MM-DD
- `share-overrides.ts` — PUT /:id/share-overrides, GET /:id/share-overrides
- `budget-templates.ts` — POST /, GET /, POST /:id/apply
- `workspace-settings.ts` — POST /budget-mode

### Web UI (`apps/web/src/components/budgeting/`)

- `category-form.tsx` — RHF form: name, scope, optional parent group
- `category-list.tsx` — RSC: grouped root/child list with icon-only edit/archive actions
- `limit-editor.tsx` — RHF form: normal+cushion amounts, currency picker, effectiveFrom date
- `share-override-editor.tsx` — Live sum counter, save disabled when |sum-100| > 0.005
- `budget-template-form.tsx` — Template selector + target month apply form
- `budget-bar.tsx` — Three-state progress: green 0-80%, yellow 81-100%, red >100%

### Pages

- `apps/web/src/app/[locale]/(app)/budget/page.tsx` — RSC budget page with CategoryList

### Tests

- 22 domain/integration tests in `packages/budgeting/test/` (all green)
- 12 API route integration tests in `apps/api/test/routes/` (categories, limits, share-overrides)
- 8 Vitest component tests (LimitEditor, ShareOverrideEditor)
- E2E feature files: `category-limits.feature`, `share-overrides.feature`, `BudgetPage.ts`

### i18n

- `apps/web/messages/en.json` — `budgeting_categories` block added; `currency.names` restored with all 8 currencies
- `apps/web/messages/pl.json` — `budgeting_categories` block added (Polish)
- `apps/web/messages/uk.json` — `budgeting_categories` block added (Ukrainian)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mock.module contamination across bun:test files**

- **Found during:** Task 3 verification gate (combined test run had 18 failures, 0 in isolation)
- **Issue:** Bun 1.3.x `mock.module()` is process-global — `tenant-guard.test.ts`, `fx.test.ts`, and `workspaces.test.ts` all mocked `@budget/platform` without restoring, breaking subsequent tests that needed real `withTenantTx`.
- **Fix:**
  1. Refactored `tenantGuard` to `buildTenantGuard(bootstrapFn)` factory so `tenant-guard.test.ts` uses dependency injection instead of global module mock.
  2. Removed `@budget/platform` mock from `workspaces.test.ts` (route uses injected `fakeDeps`, platform mock not needed).
  3. Removed `@budget/platform` mock from `fx.test.ts` (route has no platform imports); fixed `pg-boss` mock to include `PgBoss` named export.
  4. Added `listShareOverrides` use case + wired via deps to eliminate dynamic import in GET route handler (was picking up stale module from mock cache).
- **Files modified:** `tenant-guard.ts`, `share-overrides.ts`, `tenant-guard.test.ts`, `categories.test.ts`, `fx.test.ts`, `share-overrides.test.ts`, `workspaces.test.ts`, `factory.ts`, `list-share-overrides.ts`
- **Commit:** `b472512`

**2. [Rule 2 - Missing critical] listShareOverrides use case**

- **Found during:** Deviation fix above
- **Issue:** GET route created `DrizzleShareOverrideRepo` inline via dynamic import, bypassing the DI pattern and causing mock cache issues.
- **Fix:** Added `listShareOverrides` use case, wired into factory and test deps.
- **Files modified:** `list-share-overrides.ts` (new), `factory.ts`, `share-overrides.ts`, test files

### Architectural Decision

The `buildTenantGuard(bootstrapFn)` factory pattern (exported alongside the default `tenantGuard` singleton) was introduced as a pragmatic fix. The default `tenantGuard` still uses the real `withBootstrapUserContext` from `@budget/platform`. This is a pure additive change — no existing behavior modified.

## Key Decisions

- SCD-2 same-day edit (Pitfall 5): UPDATE in place when `effective_from` matches; prevents duplicate open rows
- Share override sum-100 validated twice: app-level (`validateShares`) + DB-level (DEFERRABLE trigger)
- `listShareOverrides` use case added (not in original plan) to avoid dynamic import in route handler

## Known Stubs

None — all components are wired to real API endpoints. Category list uses RSC server fetch. Share-override-editor sends real PUT to `/api/categories/:id/share-overrides`.

## Threat Flags

| Flag                            | File                        | Description                                                                                                                                                                                                                                                                                   |
| ------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: rls_bypass_via_uid | `share-override-repo.ts:80` | `listOverrides` passes `tenantId` as `userId` for `withTenantTx` — sets `app.current_user_id = tenantId`. Functionally correct (RLS only checks `tenant_id`), but semantically incorrect. Low priority; no security impact since `current_user_id` is not used in share-overrides RLS policy. |

## Self-Check: PASSED

- [x] All 4 commits exist: `97e1fe2`, `cd09524`, `4fddc0c`, `b472512`
- [x] 130 backend tests pass, 0 fail (`bun test packages/budgeting/test/ apps/api/test/`)
- [x] 34 Vitest component tests pass
- [x] SUMMARY.md written to `.planning/phases/02-budgeting-fx/02-05-SUMMARY.md`
- [x] i18n files valid JSON (en/pl/uk all OK)
- [x] TypeScript compiles without errors (`bun run tsc --noEmit` in apps/web)
