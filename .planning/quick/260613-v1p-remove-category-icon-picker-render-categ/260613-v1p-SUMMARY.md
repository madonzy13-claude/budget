---
quick_id: 260613-v1p
type: execute
status: awaiting-human-verify
subsystem: budgeting (categories + reserves + spendings)
tags: [category-color, icon-removal, persistence, migration, i18n, accent-bar]
requires:
  - budgeting.categories table
  - reserves + spendings summary read paths
provides:
  - persisted category color_key (POST/PATCH/SELECT end-to-end)
  - shared CATEGORY_COLORS map + hexForColorKey()
  - 4px left accent bar on spendings columns + reserves rows
  - icon picker removed
affects:
  - apps/web/src/components/budgeting/category-slider.tsx
  - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
  - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
tech-stack:
  added: []
  patterns:
    - "single source of truth color map (key->hex) consumed by picker + 2 renderers"
    - "presence-aware PATCH recolor (omit colorKey => leave color untouched)"
    - "z-0 pointer-events-none absolute bar under the sticky band => no mask/drag/scroll regression"
key-files:
  created:
    - drizzle/0036_category_color_key.sql
    - apps/web/src/lib/category-colors.ts
    - apps/web/src/lib/category-colors.test.ts
  modified:
    - packages/budgeting/src/adapters/persistence/categories-schema.ts
    - packages/budgeting/src/adapters/persistence/category-repo.ts
    - packages/budgeting/src/adapters/persistence/categories-repo.ts
    - packages/budgeting/src/domain/category.ts
    - packages/budgeting/src/application/create-category.ts
    - packages/budgeting/src/application/rename-category.ts
    - packages/budgeting/src/application/find-category-by-id.ts
    - packages/budgeting/src/application/archive-category.ts
    - packages/budgeting/src/application/list-categories.ts
    - packages/budgeting/src/application/unarchive-category.ts
    - packages/budgeting/src/application/get-spendings-summary.ts
    - packages/budgeting/src/application/get-reserves-summary.ts
    - packages/budgeting/src/application/reserves-summary-builder.ts
    - packages/budgeting/src/application/adjust-category-reserve.ts
    - packages/budgeting/src/application/set-wallet-balance.ts
    - packages/budgeting/src/application/update-wallet.ts
    - packages/budgeting/src/ports/category-repo.ts
    - packages/budgeting/src/ports/categories-repo.ts
    - packages/budgeting/src/contracts/api.ts
    - apps/api/src/routes/categories.ts
    - apps/web/src/components/budgeting/category-slider.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
    - apps/web/src/hooks/use-reserves-summary.ts
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
decisions:
  - "color_key is plain nullable text in DB; the 8-key enum is enforced at the API zod boundary (POST + PATCH) => future palette change needs no migration."
  - "PATCH recolor is presence-aware: a rename-only PATCH never wipes an existing color; sending colorKey:null clears it."
  - "icon_key column NOT added (none existed); icon removal is frontend-only — slider stops sending iconKey."
  - "Spendings bar hidden on archived columns; reserves bar shown on active AND excluded rows (category cue independent of exclusion)."
metrics:
  duration: ~30m
  tasks: 3 + deploy
  completed: 2026-06-13
---

# Quick 260613-v1p: Remove Category Icon Picker + Render Category Color Summary

Persisted per-category color end-to-end (the color was NEVER stored before) and rendered it as a 4px left accent bar on spendings column cards and reserves rows; removed the dead icon picker. Shared `category-colors.ts` map is the single source of truth.

## What shipped

**T1 — persistence (commit 74c2131).** The brief-verified gap: `budgeting.categories` had no `color_key` column, `createCategorySchema` dropped `colorKey`, no repo SELECTed it, and `get-spendings-summary` read a dead `(c as any).colorKey` that was always null. Added migration 0036 (nullable `color_key text`), Drizzle schema field, `Category.colorKey` + `recolor()`, `createCategorySchema`/`updateCategorySchema` 8-key enum (`mauve` -> 422), INSERT/UPDATE + both repo SELECTs (spendings `category-repo` + reserves `categories-repo`), and threaded colorKey through the reserves chain (`CategoryRow` -> builder `ReservesSummaryCategory`/`ReservesSummaryRow` -> DTO) plus the spendings DTO now reading a real `c.colorKey`. CategoryDto gained `colorKey` so all 5 DTO builders + 3 reserve-mutation builder callers were updated.

**T2 — render (commit 531fec3).** Created `apps/web/src/lib/category-colors.ts` (`CATEGORY_COLORS` 8 keys->hex + `hexForColorKey`). Spendings `category-column`: `relative` card root + a z-0, pointer-events-none, `w-1` left bar as the first child (hidden on archived + when colorless). Reserves `reserves-table-row`: `relative overflow-hidden` inner row + the same z-0 bar as its first child (shown on active + excluded). `use-reserves-summary` row type gained `colorKey`.

**T3 — icon removal + i18n (commit 37302d2).** Deleted the icon `FormField` + `PRESET_ICONS` + 8 unused lucide imports (kept `Loader2`); stripped `iconKey` from the zod schema, `props.initial`, defaults, reset, and both submit payloads; color picker now maps the shared `CATEGORY_COLORS`. Removed `grid.catSlider.field.icon` from en/pl/uk (kept `.color`). `spendings-grid-client` stopped passing `iconKey` into the slider initial.

## Verification (Claude-run, all green)

- `apps/api/test/routes/categories.test.ts` — 16/16 (5 new color round-trip: POST/PATCH/GET persist colorKey, omit -> null, clear -> null, `mauve` -> 422).
- `apps/api/test/routes/reserves.test.ts` — 8/8 (new: row carries category colorKey; colorless -> null; tenant-scoped via RLS fixture).
- `packages/budgeting/test/application/reserves-summary-builder.test.ts` — 6/6 (new colorKey-threading test).
- `apps/web` Vitest — category-colors + category-column + reserves-table-row + category-slider = 55 tests green (bar present w/ hex, absent on null + archived spendings; icon picker gone; create payload has colorKey, no iconKey).
- `make ci-gate` (tenant-leak) — 51/51 pass (exit-1 is the pre-existing coverage-threshold artifact, not a test failure; colorKey is tenant-scoped, no leak).
- `bun run check:i18n` — `I18N_GATE_PASS`.
- `tsc --noEmit`: 0 errors in `apps/web` and 0 in `packages/budgeting/src` (remaining package errors are pre-existing TEST-file drift — see Deferred Issues).
- **Live deploy**: migration 0036 applied (migrator image rebuilt — baked, not mounted); `\d` confirms `color_key text YES` on the live DB. api+worker+web images rebuilt + restarted (all healthy). Served `.next` contains `category-accent-bar` (spendings + reserves pages); served api contains `color_key` in all 3 persistence files. Live DB round-trip: insert `color_key='blue'` -> read back 'blue' -> cleanup, OK.

## Deviations from Plan

- **[Rule 2 — missing critical functionality] CategoryDto colorKey propagation.** Adding `colorKey` (required) to `CategoryDto` forced updates to all 5 DTO builders (create/rename/find/archive/list/unarchive) and the 3 reserve-mutation builder callers (adjust-category-reserve, set-wallet-balance, update-wallet) that build `ReservesSummaryCategory`. The plan named the primary files; these transitive call sites were required for type-correctness and to actually carry the color through every read path. No behavior change beyond threading the field.
- **[Rule 3 — blocking] Migrator image is baked, not volume-mounted.** First `make migrate` ran the stale image and did NOT add the column (verified: 0 rows in information_schema). Rebuilt `migrator` (then api/worker/web) before re-running — matches the "Docker build cache ships stale images" memory.
- **Migration index:** 0036 (journal last was 0035, not 0034 as the brief guessed).

## Deferred Issues (out of scope — logged to .planning/phases/deferred-items.md)

- `packages/budgeting/test/db-constraints/ledger-immutability.test.ts:51` (`app_role cannot DELETE from expense_ledger`) fails — confirmed PRE-EXISTING (fails identically on a clean `git stash` tree; unrelated to color, no ledger files touched).
- Pre-existing budgeting TEST-file typecheck drift (openMonth / reserveExcluded on ReservePosition fixtures; budget-template `.value` without isOk guard; get-budget-home-summary toBeNull(true)). Production `src/` typechecks clean.

## Known Stubs

None. The `iconKey` field still appears on some spendings DTO types (`category-column`, `use-spendings-summary`, `column-header`) but is no longer written by the form and is unused by render — harmless dead type surface, not a functional stub (no icon column ever existed). Removing those type fields was out of scope (would cascade through the spendings DTO contract).

## Awaiting human verification (blocking checkpoint)

Live device/desktop check on https://budget-dev.madonzy.com per the plan's `how-to-verify`.

## Self-Check: PASSED

- Files: drizzle/0036_category_color_key.sql, apps/web/src/lib/category-colors.ts, apps/web/src/lib/category-colors.test.ts, SUMMARY.md — all present.
- Commits: 74c2131 (T1), 531fec3 (T2), 37302d2 (T3) — all in history.
