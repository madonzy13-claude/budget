---
phase: quick-260611-vuo
plan: 01
subsystem: budgeting (spendings grid + category lifecycle)
tags: [archive, unarchive, category, spendings-grid, grants, rls]
requires: []
provides:
  - unarchiveCategory use-case (same-month + months-later limit replay)
  - CategoryRepo.unarchive (flags clear + audit + outbox)
  - POST /budgets/:id/categories/:cid/unarchive route
  - Revert (Undo2) button on archived columns, no confirm
  - Overlay action cluster — full-width names on non-archived columns
  - Column-wide reveal (all 5 header rows)
affects: [spendings grid UX, category archive lifecycle, DB grants]
tech-stack:
  added: []
  patterns:
    - absolute overlay action cluster with visible-only background
    - reveal hook ref lifted to component root for column-wide reveal
key-files:
  created:
    - packages/budgeting/src/application/unarchive-category.ts
    - packages/budgeting/test/application/unarchive-category.test.ts
    - drizzle/0033_app_role_category_purge_grants.sql
  modified:
    - packages/budgeting/src/ports/category-repo.ts
    - packages/budgeting/src/adapters/persistence/category-repo.ts
    - packages/budgeting/src/contracts/factory.ts
    - packages/budgeting/package.json
    - apps/api/src/routes/categories.ts
    - apps/api/test/routes/categories.test.ts
    - apps/migrator/post-migration.sql
    - apps/web/src/components/budgeting/spendings-grid/column-header.tsx
    - apps/web/src/components/budgeting/spendings-grid/category-column.tsx
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/test/components/spendings-grid/column-header.test.tsx
decisions:
  - "app_role granted DELETE on expense_ledger + category_reserve_adjustments (ONLY app_role; worker stays append-only) — required by the already-shipped archive draft-purge and permanent-delete features; RLS still tenant-scopes every DELETE; audit_history records deletions"
  - "Action buttons overlay (absolute, right-pinned) instead of inline — hidden actions reserve zero width so names truncate at full header width"
  - "Reveal state lifted to header root: group-hover + tap on any of the 5 rows reveals; outside pointerdown still closes (useRevealActions unchanged)"
metrics:
  duration: ~55min (continuation session)
  completed: 2026-06-11
---

# Quick 260611-vuo: BDP Archived-Category Fixes + Unarchive Lifecycle Summary

Unarchive (revert) lifecycle end-to-end — backend use-case with month-by-month limit
replay + revert icon on archived columns — plus full-width header names via an overlay
action cluster, column-wide action reveal, and the 42501 grants fix that was silently
breaking archive AND permanent delete.

## Tasks

| Task | Name                                                                   | Commits                        |
| ---- | ---------------------------------------------------------------------- | ------------------------------ |
| 1    | Backend — unarchiveCategory + repo.unarchive + POST /:id/unarchive     | c1409fa (test), 7d86c03 (feat) |
| 2    | Frontend — full-width name, revert icon, column-wide reveal, trash fix | bfa6d83 (test), 08e2d96 (feat) |

## What was built

### Task 1 — Backend

- `unarchiveCategory` use-case: errs on missing/not-archived; same-month revert clears
  flags only (zero `setLimitForMonth` calls); months-later revert reads the archive-month
  effective limit, writes `0/0` (carryForward=false) for every month STRICTLY between
  archive month and current month, writes the archive-month limits to the current month,
  then `repo.unarchive`. Optional RESERVE_TOPUP recompute mirrors archiveCategory.
- `CategoryRepo.unarchive`: `archived_from = NULL, archived_at = NULL` + audit +
  outbox (`budgeting.category.unarchived`). Deleted recurring rules/drafts stay deleted.
- `POST /budgets/:id/categories/:cid/unarchive`: tenant-mismatch 403, use-case err 422.
- Tests: 5 unit (fake repos) + 3 route (real Postgres) — all green.

### Task 2 — Frontend

- BUG1 (truncated names): pen/trash/revert moved into an absolute right-pinned cluster
  (`column-header-actions`) — hidden actions consume zero inline width; cluster bg only
  paints while revealed/hovered so it never covers the name's tail. Non-archived columns
  give the name the full header width; the archived label renders only on archived columns.
- FEATURE4 (revert): `Undo2` button before the trash on archived columns;
  `onUnarchive(categoryId)` with NO confirm; grid-client POSTs unarchive, invalidates
  spendings-summary/transactions/drafts/reserves, `router.refresh()`.
- FEATURE3 (column-wide reveal): `useRevealActions` ref + `group` class lifted to a new
  header root (`column-header-root`); rows 2-5 (planned/overspent/reserves-used/left)
  toggle reveal on tap; desktop hover anywhere reveals. D-PH4-INT1 respected (no JS hover).
- BUG2 (dead trash): the click path component contract was already wired and is covered
  by tests; the real production root cause was the backend 42501 below — every DELETE
  (and archive) failed server-side, so the confirm appeared to "do nothing".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] budgeting package.json missing export entries**

- **Found during:** Task 1 (route tests could not resolve imports)
- **Issue:** `@budget/budgeting/src/application/permanently-delete-category` and
  `.../unarchive-category` absent from the `exports` map — every test in
  `categories.test.ts` failed with module-not-found.
- **Fix:** added both export entries.
- **Commit:** 7d86c03

**2. [Rule 2/3 - Missing critical functionality] app_role lacked DELETE on the ledger tables**

- **Found during:** Task 1 (archive route returned 422 in integration tests)
- **Issue:** `42501 permission denied` — `post-migration.sql` re-asserts
  `REVOKE UPDATE, DELETE ON budgeting.expense_ledger` on every migrate (append-only,
  D-23/ENGR-06), and the same for `category_reserve_adjustments` (D-PH5-R8). But the
  archive draft-purge (commit ccca754, Jun 10) and `DELETE /categories/:id` permanent
  delete (Jun 9) both DELETE from those tables as app_role. **Both shipped features were
  broken in production** — this is also the true root cause of plan BUG2 ("trash does
  nothing").
- **Fix:** migration `0033_app_role_category_purge_grants.sql` + amended all three
  REVOKE sites in `post-migration.sql` to `GRANT DELETE ... TO app_role` (app_role ONLY;
  worker_role stays append-only; RLS tenant-scopes deletes; audit_history records them).
  Documented at each site. Migrator image rebuilt, migration applied, grants verified.
- **Commit:** 7d86c03

**3. [Rule 1 - Bug] findById omitted archived_from**

- **Found during:** Task 1 (unarchive returned 422 "Category not archived" after a
  successful keep-history archive)
- **Issue:** `DrizzleCategoryRepo.findById` SELECT did not include `archived_from`,
  so the use-case never saw the archive month.
- **Fix:** added `archived_from::text` to the SELECT (text cast — the use-case does
  string month math).
- **Commit:** 7d86c03

## Authentication Gates

None.

## Verification

- `packages/budgeting` unit: 5/5 green
- `apps/api` categories route (real Postgres via Infisical): 10/10 green
- `apps/web` column-header: 27/27 green; full Vitest suite 624 passed / 43 skipped
- `bun run typecheck` (all workspaces): clean
- `depcruise`: no violations (no SQL/Drizzle leaked outside adapters)
- tenant-leak gate: **51/51 tests pass** (gate's exit code 1 is a pre-existing
  coverage-threshold artifact — see deferred-items.md)
- Docker: api/worker/web rebuilt + restarted, healthy; served web bundle verified to
  contain `column-header-revert` / `column-header-actions`; api image contains the
  unarchive route; migration 0033 applied, grants verified live

Manual UAT spot-check on https://budget-dev.madonzy.com still recommended:
archive a category → revert same month (limits unchanged) → confirm trash now opens
the dialog and a confirmed delete removes the column.

## Known Stubs

None.

## Threat Flags

| Flag                            | File                              | Description                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: privilege-widening | apps/migrator/post-migration.sql  | app_role gained DELETE on expense_ledger + category_reserve_adjustments (was append-only). Tenant-scoped by RLS; worker_role unchanged; deletions audited. Intentional — required by shipped archive/permanent-delete features. |
| threat_flag: new-endpoint       | apps/api/src/routes/categories.ts | POST /budgets/:id/categories/:cid/unarchive — session auth + tenant-mismatch 403 guard (same pattern as DELETE /:id).                                                                                                           |

## Deferred Issues

See `deferred-items.md`:

1. `make ci-gate` exits 1 on coverage threshold (fixtures under `tests/` not ignored) — pre-existing.
2. `list()` returns `archived_from` un-cast (Date) while `findById` now casts `::text`.

## Self-Check: PASSED

All created files exist on disk; all four commits (c1409fa, 7d86c03, bfa6d83, 08e2d96)
present in git history.
