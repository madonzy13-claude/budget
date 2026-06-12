---
quick: 260612-kxd
plan: 01
subsystem: shell-safe-area + spendings-grid + tasks/drafts-atomicity
tags:
  [
    ios,
    pwa,
    shell,
    clip-chain,
    dvh,
    grid,
    keyboard,
    remeasure,
    tasks,
    drafts,
    confirm-draft,
    orphan-task,
    tdd,
  ]
requires: [quick-260612-g7v (SHELL-R15)]
provides:
  - browser-mode shell canvas sized 100lvh (paints under the translucent bar)
  - keyboard-aware grid remeasure freeze (no inline-edit jump-back)
  - atomic CONFIRM_DRAFT close on hard-delete + dismiss + ARCHIVE; banner read self-heal (incl. archived-category legacy rows); home-badge actionability parity
affects:
  [
    tasks-banner,
    spendings-grid,
    category-hard-delete,
    category-archive,
    recurring-drafts,
    home-budget-cards,
  ]
key-files:
  modified:
    - packages/tenancy/src/adapters/persistence/workspace-repo.ts
    - tests/tenant-leak/budgets-active-tasks-count-cross-tenant.test.ts
    - apps/api/test/routes/budgets-active.test.ts
    - apps/web/src/app/global.css
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/components/common/viewport-debug.tsx
    - apps/web/test/shell-safe-area.test.ts
    - packages/budgeting/src/adapters/persistence/category-repo.ts
    - packages/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo.ts
    - packages/budgeting/src/adapters/persistence/task-repo.ts
    - packages/budgeting/src/application/dismiss-draft.ts
    - apps/api/src/boot.ts
    - packages/budgeting/test/application/permanently-delete-category.test.ts
    - packages/budgeting/test/application/dismiss-draft.test.ts
    - packages/budgeting/test/application/list-pending-tasks.test.ts
    - packages/budgeting/test/tasks/confirm-draft.test.ts
    - apps/api/test/routes/categories.test.ts
  created:
    - packages/budgeting/test/draft-task-fixtures.ts
    - packages/budgeting/test/application/archive-category.test.ts
decisions:
  - "Shell-root browser cap reverted to 100lvh (round-2 dvh was a misdiagnosis; real cause removed in R14)"
  - "Dismiss task-resolve folded into the ADAPTER's tx (preferred option) — dismissDraft use case loses taskRepo dep"
  - "hardDelete resolves CONFIRM_DRAFT via inline tenant-scoped SQL in its own tx — no new TaskRepo port method (plan's step-1 method would be dead code given step-2 inlining)"
  - "listPending self-heal also excludes dismissed_at drafts (plan listed deleted/confirmed only)"
  - "Addendum: ARCHIVE (both modes) resolves the category's drafts' CONFIRM_DRAFT tasks in the same tx — keep-history has archived_at NULL so the read self-heal cannot cover it"
  - "Addendum: listPending + home-badge actionability also requires the draft's category to NOT have archived_at set (legacy Maczfit shape heals on read)"
  - "Addendum: home-card pendingTasksCount shares the banner's actionability predicate (badge parity — closes prior deferred item)"
metrics:
  completed: 2026-06-12
  marker: SHELL-R16
---

# Quick 260612-kxd: Shell clip-chain dvh + grid keyboard remeasure + CONFIRM_DRAFT atomicity Summary

**One-liner:** Browser-mode shell root reverted dvh→100lvh so the R15 grid box paints under Safari's bar (SHELL-R16); grid remeasure frozen while a scroller field has focus (single rAF remeasure on focusout) to kill inline-edit jump-back; CONFIRM_DRAFT tasks now close in the SAME transaction on category hard-delete and draft dismiss, with an EXISTS self-heal in listPending that hides Maczfit-style orphans on the next banner read.

## Tasks

### T1 — Browser-mode shell root → 100lvh (commit a5fa1ac, prior session)

- global.css `@media (display-mode: browser)` `[data-shell-root]`: `height:auto; min-height:100lvh` (was `min-height:100dvh`, round-2 commit 0e07dd6 — documented misdiagnosis-revert at global.css:486 region).
- viewport-debug: clip-chain probes `shellRootClientH` / `shellRootMinH` / `ptrBlurClientH`; `BUILD_MARKER = "SHELL-R16"`.
- shell-safe-area.test.ts Round 6 guards R6-A..D.

### T2 — Keyboard remeasure freeze (commit a5fa1ac, prior session)

- spendings-grid-client.tsx: `isKeyboardEditing()` predicate (activeElement inside scroller, INPUT/TEXTAREA/contentEditable); `updateMaxH` no-ops while editing (line 354); `focusout` listener does one `requestAnimationFrame` remeasure (lines 367-372). All visualViewport/ResizeObserver listeners retained (now self-gating).
- Guards R6-E/F/G (source-guard style; real-iOS-keyboard behavior is device-checkpoint-proven, consistent with R3-R5).

### T3 — Atomic CONFIRM_DRAFT close + self-healing banner read (this session)

- **RED f570cdb** — real-Postgres integration tests (no DB mock, CLAUDE.md rule 3):
  - T3-A permanently-delete-category: task RESOLVED in the same call — was PENDING (RED).
  - T3-B dismiss-draft: resolve without taskRepo dep, atomic in adapter tx (RED); failed dismiss never resolves independently.
  - T3-C list-pending-tasks: orphan (never-existed draft) hidden (RED), soft-deleted draft hidden (RED), live draft kept, RESERVE_TOPUP kept (orphan half RED).
  - T3-D categories route: DELETE /categories/:id → banner read via real HTTP → orphan absent (RED at final assert).
  - Shared fixtures `draft-task-fixtures.ts` (tx-local RLS GUC pattern from 07-03).
  - RED run: 5 fail / 12 pass (budgeting), 1 fail (route) — all failing on the new atomicity/self-heal asserts only.
- **GREEN 40e0c81**:
  - category-repo.hardDelete: tenant-scoped `UPDATE budgeting.tasks SET status='RESOLVED'` for `payload_json->>'draft_id' IN (SELECT id::text FROM expense_ledger WHERE category_id=…)` — runs BEFORE the expense_ledger purge inside the existing `withTenantTx` (subquery must still see drafts).
  - expense-ledger-draft-port-repo.dismiss: same idempotent resolve inlined in the dismiss tx (mirrors skip-recurring-draft.ts).
  - dismiss-draft.ts: separate `withTenantTx` ("A2 fallback") + `taskRepo?` dep REMOVED; boot.ts wiring updated.
  - task-repo.listPending: `AND (kind <> 'CONFIRM_DRAFT' OR EXISTS (… el.id::text = tasks.payload_json->>'draft_id' AND el.tenant_id = tasks.tenant_id AND el.deleted_at IS NULL AND el.dismissed_at IS NULL AND el.confirmed_at IS NULL))`.

### T3 addendum — archive gap + archived-category self-heal + badge parity (commits e7bde7b RED, d2bb94f GREEN)

The live Maczfit task survived because its category was ARCHIVED (not hard-deleted) and the archive predated the 42501 grants fix — the draft purge silently failed, leaving task + live draft. Invariant: banner/badge show only ACTIONABLE tasks; a CONFIRM_DRAFT whose category is archived is not actionable (draft invisible in UI).

- **RED e7bde7b** (5 fail / 24 pass): archive-category.test.ts (new, keep-history + hide-all must resolve the task same-tx); list-pending archived-category heal; T3-D re-spec (archived category → task already hidden BEFORE permanent delete; delete still flips row RESOLVED); budgets-active badge excludes non-actionable CONFIRM_DRAFT.
- **GREEN d2bb94f**:
  - category-repo.archive: same tenant-scoped CONFIRM_DRAFT resolve as hardDelete, BEFORE the draft purge in the same `withTenantTx`. Keep-history mode is the critical path — `archived_at` stays NULL there, so the read self-heal can never hide a leftover row; the in-tx resolve is the only guard.
  - task-repo.listPending: actionability EXISTS gains `AND NOT EXISTS (SELECT 1 FROM budgeting.categories c WHERE c.id = el.category_id AND c.tenant_id = el.tenant_id AND c.archived_at IS NOT NULL)` — heals legacy stale rows (Maczfit) on read, no manual SQL. NULL category_id keeps the task visible; tenant-joined per T-kxd-02.
  - workspace-repo.listForUser: `pendingTasksCount` subquery uses the same actionability predicate — home-card badge now equals the banner count (was raw `status='PENDING'`).
  - tenant-leak gate test: CONFIRM_DRAFT seed references a REAL live draft (orphan-shaped seed is correctly excluded now) + NEW vector pinned: a budgetB task whose payload points at budgetA's live draft must NOT count (tenant-joined EXISTS can never let one tenant's ledger state activate another tenant's task).

## Commits

| Commit  | Type         | What                                                                                        |
| ------- | ------------ | ------------------------------------------------------------------------------------------- |
| a5fa1ac | feat (T1+T2) | SHELL-R16 — dvh shell cap revert + keyboard remeasure freeze (prior session)                |
| f570cdb | test (RED)   | T3 integration tests: atomicity (hard-delete, dismiss), self-heal, route + fixtures         |
| 40e0c81 | feat (GREEN) | atomic CONFIRM_DRAFT close on every draft-removal path + listPending EXISTS self-heal       |
| eb6b0e2 | test         | e2e CONFIRM_DRAFT seed creates a live draft + draft_id (self-heal broke orphan-shaped seed) |
| e7bde7b | test (RED)   | addendum: archive closes CONFIRM_DRAFT tasks + archived-category self-heal + badge parity   |
| d2bb94f | feat (GREEN) | addendum: archive resolve same-tx, archived-category read-heal, badge actionability parity  |

## Verification (real numbers)

| Check                                                                    | Result                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest shell-safe-area (Rounds 1-6, SHELL-R16)                           | PASS — 49/49                                                                                                                                                                                                                                                                          | run 2026-06-12T16:54Z                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T3 budgeting integration (3 files, real Postgres)                        | PASS — 17/17 (was 5 fail RED)                                                                                                                                                                                                                                                         | `infisical run --env=dev -- bun test …`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| T3-D route + confirm-draft regression (2 files)                          | PASS — 17/17                                                                                                                                                                                                                                                                          | same runner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `make ci-gate` tenant-leak                                               | PASS — 51/51 (14 files)                                                                                                                                                                                                                                                               | new tasks UPDATEs double tenant-scoped (T-kxd-01/02)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| tsc on touched files                                                     | clean                                                                                                                                                                                                                                                                                 | budgeting `tsc --noEmit` has 19 PRE-EXISTING errors in unrelated test files (reserves-rewrite debt); 0 in files touched here. All other packages typecheck exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deployment                                                               | web+api+worker (+migrator) images rebuilt, full stack restarted                                                                                                                                                                                                                       | `make dev-build` exit 0 (stack had been torn down by ci-gate's `docker compose down` cleanup — see deviations)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Served web bundle = SHELL-R16                                            | PASS                                                                                                                                                                                                                                                                                  | container chunk `layout-c11e32ce784d4235.js` contains SHELL-R16, zero SHELL-R15 hits; live fetch of the same chunk from budget-dev.madonzy.com → `SHELL-R16`; served CSS has `[data-shell-root]{height:auto;min-height:100lvh}` and the only `100dvh` left is the unrelated Tailwind `.min-h-dvh` utility                                                                                                                                                                                                                                                                                                                                                                 |
| API image carries T3                                                     | PASS                                                                                                                                                                                                                                                                                  | `/app/packages/budgeting/src/adapters/persistence/task-repo.ts` in budget-api image contains the self-heal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Geometry e2e `@tasks-geometry`, 4 viewports, live                        | PASS — 19 passed + 1 flaky-passed-on-retry (20/20 effective), exit 0, 2.8m                                                                                                                                                                                                            | /tmp/pw-kxd-r16-geometry.log. All viewports: at-rest `boxVvDelta=0`, after-scroll `boxVvDeltaAfterScroll=0`, last-row `gap=96`, `maxHVar="max(160px, calc(100lvh - 178px))"`, band-banner gap=12, shell-root ≤ viewport. Flake = geom-320 last-row clearance first-attempt timeout (tunnel latency), retried green — same class as R15 run                                                                                                                                                                                                                                                                                                                                |
| Subset sweep `--grep "spendings\|tab frame\|home"` chromium+mobile, live | 93 passed / 7 flaky-passed-on-retry / 6 skipped / 6 failed — ALL 6 failures triaged, none a shell/grid/backend regression                                                                                                                                                             | /tmp/pw-kxd-r16-subset.log, 19.9m. (a) tasks badge CONFIRM_DRAFT ×2 — REAL break of the orphan-shaped e2e seed by the intended self-heal; seed fixed in eb6b0e2, re-run 4/4 + home badge-3 2/2 green. (b) onboarding-wizard ×2 — known stale phase-8 "Push step" test (pre-existing, already in deferred-items). (c) category-cell chromium — died waiting for the column header to EXIST (fixture/tunnel latency; mobile passed on retry). (d) draft-edit-promote mobile — died in the sign-up fixture `page.goto` timeout (never reached the grid; chromium passed 8.0s). home.feature 6/6, wallets add-edit-drag-delete 2/2 (page-scroll end-of-scroll surfaces green) |
| `@tasks-redesign` full tag chromium+mobile, live (post-seed-fix)         | 44 passed / 2 failed — both = reserves golden-timeline, BOTH projects; triaged as tunnel-latency flake: failure snapshots show the OFFLINE error boundary ("We can't reach the server") mid-replay, and a solo re-run of the identical test on the identical deployment PASSED (3.6m) | /tmp/pw-kxd-r16-tasks.log, /tmp/pw-kxd-golden-solo2.log. Heaviest test in the suite (2-3m of rapid mutations through cloudflared); no assertion-value mismatch in any attempt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Live orphan self-heal (deployed API)                                     | PASS                                                                                                                                                                                                                                                                                  | seeded synthetic orphan CONFIRM_DRAFT (draft never existed) in UAT budget b2dd4f75 → `GET /api/budgets/…/tasks?status=pending` (signed in as uat-probe-1, X-Budget-ID set) returned it ABSENT while RESERVE_TOPUP + the live Maczfit task stayed present; synthetic row deleted after the probe                                                                                                                                                                                                                                                                                                                                                                           |
| Live Maczfit task state                                                  | SUPERSEDED by addendum — see two rows below                                                                                                                                                                                                                                           | (pre-addendum analysis: task d28f5e07 points at draft 9e4ffc7d, LIVE in category "Їжа" with archived_at=2026-06-09 — the archive's draft purge silently failed pre-grants-fix. Pre-addendum the banner showed it "correctly per data"; the addendum makes archived-category tasks non-actionable by definition)                                                                                                                                                                                                                                                                                                                                                           |
| Addendum suites (real Postgres)                                          | PASS — RED 5 fail/24 pass → GREEN 29/29; regression 41/41 (permanently-delete, dismiss-draft, unarchive, reserves-use-cases, confirm-draft); tenant-leak gate 51/51 incl. new cross-tenant draft-reference vector                                                                     | `infisical run --env=dev -- bun test …` 2026-06-12T18:0xZ; tsc clean on touched files (budgeting/tenancy/api)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Addendum deployment                                                      | api + worker images carry all 3 changes                                                                                                                                                                                                                                               | `make dev-build` (post-ci-gate stack restore); container grep: task-repo + workspace-repo `archived_at IS NOT NULL` = 1 hit each, category-repo `260612-kxd T3 addendum` = 1 hit, in BOTH api and worker images                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Live Maczfit self-heal (deployed API)                                    | PASS — task GONE from banner, no manual SQL                                                                                                                                                                                                                                           | signed in as uat-probe-1 at budget-dev.madonzy.com; `GET /api/budgets/b2dd4f75…/tasks?status=pending` → 1 task: a4f2679e RESERVE_TOPUP PENDING; d28f5e07 ABSENT (banner total 2→1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Live badge parity (deployed API)                                         | PASS — badge equals banner                                                                                                                                                                                                                                                            | `GET /api/budgets/active` → "Optimistic Tapo" pendingTasksCount=1 (was 2 raw PENDING rows); all other probe budgets 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 2 - Correctness] listPending self-heal also excludes `dismissed_at` drafts**

- Plan's WHERE listed only `deleted_at IS NULL AND confirmed_at IS NULL`; a dismissed draft's PENDING task is equally non-actionable. Added `dismissed_at IS NULL` to the EXISTS.

**2. [Deviation - plan internally redundant] No `resolveConfirmDraftByCategoryId` port method**

- Plan step T3-1 adds the method, step T3-2 inlines the same SQL in hardDelete and itself notes "no DI change needed". Implemented the inline-only variant; the port method would have been dead code.

**3. [Deviation - plan action not applicable] `budgeting.tasks` NOT added to the hardDelete purge loop**

- The purge loop deletes `WHERE category_id = …`; `budgeting.tasks` has no `category_id` column (payload_json only) — the defensive loop entry would be invalid SQL. The CONFIRM_DRAFT resolve covers the actual orphan source; audit reflects RESOLVED, not DELETE.

**4. [Rule 3 - Blocking] boot.ts + confirm-draft.test.ts updated (not in plan file list)**

- Removing `taskRepo?` from `DismissDraftDeps` broke two callers: boot.ts wiring and the Phase-7 integration test `dismissDraft({ repo, taskRepo })`. Both updated to `dismissDraft({ repo })`; the test still proves resolve-on-dismiss (now via the adapter tx).

**5. [Environment] `make ci-gate` cleanup tears down the WHOLE dev compose stack**

- `scripts/ci/run-tenant-leak.sh` trap runs `docker compose down --remove-orphans` — removed all budget-\* containers (volumes preserved). Restored via `make dev-build`, which doubled as the required image rebuild. Pre-existing script behavior, not changed here; noted as infra debt.

**6. [Rule 1 - Bug] e2e CONFIRM_DRAFT seed was orphan-shaped — broke pill-badge scenarios (commit eb6b0e2)**

- `tasks.steps.ts seedTask` raw-INSERTed a CONFIRM_DRAFT task with NO `payload.draft_id` and no draft row; the new self-heal correctly hides such tasks → "Spendings pill shows red 1 badge" failed on both projects. Production tasks always reference a live draft — the seed now inserts a real unconfirmed `expense_ledger` row (existing category looked up, fallback-free) and sets `draft_id`. Badge + home-badge scenarios re-verified green live.

**7. [Rule 2 - Correctness] Addendum: home-card badge shares the banner's actionability predicate (commit d2bb94f)**

- Hiding archived-category tasks in the banner made the raw-PENDING badge visibly diverge on the exact UAT budget under device verification (badge 2 vs banner 1). Extended `workspace-repo.listForUser` pendingTasksCount with the same EXISTS predicate — this was already the named follow-up in Deferred Issues; the divergence became user-visible through this change, so it was pulled in.

**8. [Rule 1 - Bug] Addendum: tenant-leak gate seed was orphan-shaped — same class as deviation 6 (commit d2bb94f)**

- `budgets-active-tasks-count-cross-tenant.test.ts` seeded a CONFIRM_DRAFT with a random draft_id and no draft row; the badge actionability filter correctly excludes it → "user B sees 3" failed (got 2). Seed now creates a real live draft per budget; gate additionally pins the new cross-tenant vector (budgetB task referencing budgetA's draft must NOT count). Isolation assertions never failed.

## Known Stubs

None — no placeholder data paths introduced.

## Threat Flags

None beyond the plan's register. T-kxd-01/02 mitigations implemented as specified (double tenant-scoped UPDATE subquery; tenant-joined EXISTS) and proven by ci-gate 51/51.

## Deferred Issues

- 19 pre-existing `tsc --noEmit` errors in `packages/budgeting/test/` (reserves-rewrite-era fixtures: `ReservePositionsResult.openMonth`, `ReservePosition.reserveExcluded`, Result narrowing) — untouched by this task, tracked as make-test infra debt.
- 156 orphan-shaped PENDING CONFIRM_DRAFT rows remain in the dev DB (test residue + own RED fixtures). Hidden by the read self-heal; rows are not flipped to RESOLVED (plan's optional generator-sweep extra was skipped as non-trivial).
- ~~Home budget-card badge counts RAW PENDING rows~~ — RESOLVED by the addendum (deviation 7, commit d2bb94f): badge now shares the banner's actionability predicate.
- Legacy stale CONFIRM_DRAFT rows (Maczfit d28f5e07 + the 156 dev-residue orphans) stay `status='PENDING'` in the DB — hidden everywhere by the read predicates, but not flipped to RESOLVED (no sweep). Rows heal physically only when their category is archived again (no-op), permanently deleted, or the draft is dismissed/confirmed.
- `onboarding-progress-repo.ts:31` throws `completed_at.toISOString is not a function` ~970×/6h in api logs (pg returns string, code expects Date) — pre-existing since 5e87f22 (May 22); likely the real cause behind the stale onboarding-wizard e2e failures.
- Reserves golden-timeline e2e is tunnel-latency flaky (offline error boundary mid-replay; solo re-run green). Consider a retry bump or local-baseURL run for this heaviest scenario.

## Self-Check: PASSED

Commits a5fa1ac, f570cdb, 40e0c81, eb6b0e2, e7bde7b, d2bb94f all present; fixtures + all modified files on disk; SUMMARY.md (this file) intentionally uncommitted until the device checkpoint resolves.

## Device checkpoint (blocking, human-verify)

Pending user verification per plan: Safari black block gone (Issue 1), 0/10 jump-backs on bottom-row inline edit (Issue 2), Maczfit task ALREADY gone from the banner with no manual action (Issue 3 — addendum: its category is archived, the read self-heals; NO permanent-delete needed; home-card badge matches the banner count), no PWA-standalone/pinned-header/page-scroll-tab/PTR regressions. Overlay must read SHELL-R16 before judging (?vpdbg=1).
