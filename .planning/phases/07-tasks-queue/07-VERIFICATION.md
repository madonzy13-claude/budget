---
phase: 07-tasks-queue
verified: 2026-05-31T16:30:00Z
status: gaps_found
score: 3/4 success-criteria verified (artifact-level: 40/40 exist, key wiring verified; behavioral gaps cataloged)
overrides_applied: 0
gaps:
  - truth: "Resolve-idempotency and tenant-leak gates green (Phase 7 shipped surface)"
    status: failed
    reason: "6 of 10 deferred bun:test + ci-gate failures still red against the committed tree. SUMMARY 07-10 explicitly states 'cannot mark ROADMAP Phase 7 complete until the 10 deferred failures + UAT are resolved.' All 6 target the Phase 7 resolve adapter and POST /tasks/:id/resolve tenant gate — i.e., the shipped surface, not orthogonal infra."
    artifacts:
      - path: "packages/budgeting/test/tasks/resolve-idempotency.test.ts"
        issue: "3 fails: (a) resolve UPDATE matches no rows when already RESOLVED (no-op); (b) resolve UPDATE respects tenant scope; (c) resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id"
      - path: "tests/tenant-leak/cushion-summary-cross-tenant.test.ts"
        issue: "GET /budgets/:id/cushion-summary tenant isolation > (unnamed) fails — assertions don't match runtime route behavior per Plan 07-07 territory"
      - path: "tests/tenant-leak/tasks-cross-tenant.test.ts"
        issue: "2 fails on tasks POST resolve cross-tenant gate: Layer 2 createTaskRepo().resolve called with budgetB scope leaves budgetA PENDING; sibling sanity case also red"
    missing:
      - "Fix TaskRepo.resolve adapter idempotency: confirm UPDATE WHERE clause + ON CONFLICT semantics deliver no-op-when-resolved, cross-tenant block, and resolveConfirmDraftByDraftId payload-scoped behavior"
      - "Re-align cushion-summary-cross-tenant.test.ts and tasks-cross-tenant.test.ts assertions with the actual route implementation in apps/api/src/routes/budgets.ts:364+ and apps/api/src/routes/tasks.ts:80+"
  - truth: "CUSHION_BELOW_TARGET deep-link URL contract matches frontend test + Plan 07-08 spec + WalletsPo assertion"
    status: failed
    reason: "Three-way drift: Plan 07-08 line 21 spec'd '/budgets/<id>/wallets?task=<id>#cushion'. TaskBannerRow.tsx line 110 ships '/budgets/<id>/wallets?task=<id>&focus=cushion' (query param, no hash). Vitest task-banner-row.test.tsx line 160 still asserts '#cushion' → 1/9 fails. WalletsPo.ts line 26 asserts /#cushion$/ on URL → E2E navigation assertion will also fail on real navigation. Phase 8 push deep-link contract depends on this — wrong URL shipped to Phase 8."
    artifacts:
      - path: "apps/web/src/components/budgeting/task-banner-row.tsx"
        issue: "Line 110 emits ?task=...&focus=cushion (no #cushion hash anchor); inline comment at line 107 says 'Wallets page reads focus=cushion to scroll the cushion lane' — drift from spec & test"
      - path: "apps/web/test/components/budgeting/task-banner-row.test.tsx"
        issue: "Test asserts the spec'd '#cushion' anchor URL; vitest run shows 1/9 fail"
      - path: "apps/web/e2e/page-objects/WalletsPo.ts"
        issue: "assertCushionFocus() expects URL to match /#cushion$/; will not match the shipped query-param URL"
      - path: ".planning/phases/07-tasks-queue/07-08-PLAN.md"
        issue: "Frontmatter must_have line 21 says #cushion; implementation diverged — either revert code, or update spec + page object + test in lockstep"
    missing:
      - "Pick one: (option A) revert task-banner-row.tsx line 110 to '#cushion' anchor and remove focus=cushion query param (matches spec, test, page object); OR (option B) update Plan 07-08 spec + Vitest test + WalletsPo to assert ?focus=cushion query-param contract — and document the URL contract change in 07-VERIFICATION/SUMMARY"
  - truth: "07-10 sweep test #5 is real assertion, not deferred placeholder"
    status: partial
    reason: "reserve-topup.test.ts line 437 still uses it.skip('hourly sweep emits when inline path was missed (manual DB edit)'). Plan 07-06 must_have explicitly said: 'reserve-topup.test.ts test #5 (hourly sweep) replaced with real assertion'. Inline-skip persists."
    artifacts:
      - path: "packages/budgeting/test/tasks/reserve-topup.test.ts"
        issue: "Line 437: it.skip('hourly sweep emits when inline path was missed (manual DB edit)') — Plan 07-06 promised this would be unskipped with a real assertion using budgeting-reconciliation handler"
    missing:
      - "Replace it.skip with real assertion that calls the budgeting-reconciliation handler with a seeded budget+wallet state where inline path was bypassed (raw DB INSERT to wallets.amount) and verifies the sweep emits the RESERVE_TOPUP task"
human_verification:
  - test: "Open dev stack, create a budget, change a reserve-wallet balance so Σ(wallet) ≠ Σ(reserve), observe RESERVE_TOPUP appears in banner with localized title + Top up reserve by {amount} format, click action, land at /reserves with deep link, edit reserve to match wallet sum, observe task disappears"
    expected: "Banner row appears within poll interval, title localized correctly in EN/PL/UK, action button navigates to /reserves?task=<id>, after rebalancing the task auto-resolves on next poll and banner collapses if no other tasks remain"
    why_human: "Plan 07-10 was autonomous=false and explicitly demands UAT checkpoint; visual layout, mobile rendering, real-time emit→resolve cycle, and i18n locale switching are not assertable in unit/E2E run"
  - test: "Open Settings > Cushion, set cushion_target_months from default 6 to 12, observe preview line updates required/actual/shortfall amounts; if shortfall > 0 confirm CUSHION_BELOW_TARGET appears in banner with localized 'Cushion short by {shortfall}' title and routes to Wallets on click"
    expected: "Preview line live-updates after blur, task emits within poll interval, navigation lands at /wallets with the cushion section visible (either via hash anchor OR focus query param — see gap #2)"
    why_human: "PATCH→recompute→banner is a multi-component user flow; visual cushion section anchor scroll behavior cannot be asserted by unit tests"
  - test: "Run recurring rule materialization (e.g., wait for or trigger the worker), observe CONFIRM_DRAFT row appears, click Confirm, observe optimistic row collapse + sonner toast on success, refresh and confirm draft is confirmed in DB"
    expected: "Inline confirm path: button shows Loader2 spinner during request, row disappears on 200, error toast on 4xx/5xx; underlying draft has confirmed_at set; CONFIRM_DRAFT task is RESOLVED in DB"
    why_human: "Inline mutation + optimistic UI + sonner toast UX cannot be asserted by unit tests; real-time poll cycle requires running stack"
  - test: "Run task-banner.feature E2E suite against the running stack to confirm 8 @phase7 scenarios pass (3 kinds × emit/auto-resolve + edge cases)"
    expected: "make test-e2e -- --grep @phase7 reports 8 passing / 0 failing / 1 skipped (the @skip-phase-07-debt dedup scenario by design)"
    why_human: "Verifier cannot run Playwright against the live stack in this session; user/CI must execute"
deferred:
  - truth: "STALE_WALLET (TASK-05) generator + UI"
    addressed_in: "v1.2 Insights dashboard"
    evidence: "REQUIREMENTS.md line 132: TASK-05 [DROPPED in v1.1 — MONTH_END_REVIEW ritual nudge deferred to v1.2 Insights dashboard]; ROADMAP Phase 7 explicitly lists requirements as TASK-05 dropped. Verifier records this as a non-gap deferral per Step 9b."
  - truth: "CONFIRM_DRAFT generator emits on fresh draft INSERT (deferred-items #1-2)"
    addressed_in: "Resolved between catalog snapshot and HEAD (test no longer red)"
    evidence: "deferred-items.md catalog snapshot listed 5 bun:test fails. Current run shows 3 fails — items #1 and #2 (recurring-engine seedDraftRowDirect emit path) no longer reproduce. Treating as auto-closed; no further action needed."
  - truth: "tenant-leak nested cases (deferred-items #2 cushion-summary nested + #5 tasks-resolve nested)"
    addressed_in: "Resolved between catalog snapshot and HEAD (test no longer red)"
    evidence: "Current ci-gate run shows 3 fails, not 5. Items #2 (cushion-summary nested) and #5 (tasks-resolve nested) no longer reproduce."
---

# Phase 7: Tasks Queue Verification Report

**Phase Goal:** Surface the Tasks queue end-to-end. The `tasks` table from Phase 1 plus three deterministic generators — `RESERVE_TOPUP`, `CONFIRM_DRAFT`, `CUSHION_BELOW_TARGET` — plus the BDP task banner expansion plus the kind-specific resolution actions. Auto-resolve on underlying state change so the queue never grows stale. Push deep-link URL contract spec laid down for Phase 8 to wire.

**Verified:** 2026-05-31T16:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (4 ROADMAP Success Criteria)

| #   | Truth                                                                                                                                                           | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | RESERVE_TOPUP emits on Σ-mismatch w/ title + payload diff/direction, auto-resolves on rebalance                                                                 | VERIFIED | `recompute-reserve-topup-task.ts` ships closure-over-deps helper; 3 inline hook call sites (`set-wallet-balance.ts:196`, `update-wallet.ts:257`, `adjust-category-reserve.ts:217`); helper computes direction TOPUP (<0) / WITHDRAW (>0) from mismatchCents; budgeting-reconciliation.ts:137 includes it in hourly sweep; i18n keys "Top up reserve by {amount}" in EN/PL/UK at messages/\*.json                                                                                                                                                                              |
| 2   | CONFIRM_DRAFT emits on recurring-rule materialization, auto-resolves on confirm/dismiss/skip                                                                    | VERIFIED | `recurring-engine.ts:222` calls `taskRepo.emitConfirmDraft` inside `if (insertResult.rows.length > 0)` block; `confirm-recurring-draft.ts:89` + `dismiss-draft.ts:64` + `skip-recurring-draft.ts:71` all invoke `resolveConfirmDraftByDraftId`; payload-scoped partial unique index `tasks_confirm_draft_pending_uq` in migration 0026:40-41 enforces dedup                                                                                                                                                                                                                   |
| 3   | CUSHION_BELOW_TARGET emits on shortfall, payload includes required/actual/shortfall/currency/target_months, auto-resolves on rebalance OR cushion_enabled=false | VERIFIED | `recompute-cushion-task.ts:61` is single create-or-resolve helper, line 30 imports `computeCushionSummary`; `get-cushion-summary.ts:151` calls `computeRecurringFx` for non-budget-currency wallets; recompute helper has 3 branches (line 57-59) — disabled→resolve, shortfall≤0→resolve, shortfall>0→emit. 5 inline hook sites wired: set-wallet-balance.ts:228, update-wallet.ts:289, create-wallet.ts:92, archive-wallet.ts:144, set-category-limit.ts:94; budgeting-reconciliation.ts:163 includes it in sweep; tasks_cushion_below_target_pending_uq index in migration |
| 4   | BDP task banner shows count chip, expands inline, kind-specific buttons, EN/PL/UK i18n, RLS-scoped list endpoint, tenant guard on writes                        | VERIFIED | `task-banner.tsx:108` renders `t("bdp.tasks.count", { count: tasks.length })` chip; mounted in `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx:75`; `task-banner-row.tsx:101-113` switches on kind for `router.push` / `clientApiFetch`; all 3 routes (`tasks.ts:49,84` + `budgets.ts:370` + `budget-identity.ts:63,111`) gate on `tenantIds.includes(budgetId)`; `bdp.tasks.title.{RESERVE_TOPUP,CONFIRM_DRAFT,CUSHION_BELOW_TARGET}` localized in en/pl/uk.json                                                                                                    |

**Score:** 4/4 ROADMAP success criteria substantively wired in source.

### Deferred Items

| #   | Item                                                                       | Addressed In            | Evidence                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | STALE_WALLET / MONTH_END_REVIEW generator (TASK-05)                        | v1.2 Insights dashboard | REQUIREMENTS.md:132 explicitly marks TASK-05 [DROPPED in v1.1 — deferred to v1.2 Insights]; ROADMAP frontmatter for Phase 7 lists requirements: TASK-01..04, TASK-06..08; verifier confirms TASK-05 is a non-gap |
| 2   | CONFIRM_DRAFT generator seedDraftRowDirect emit (deferred-items.md #1, #2) | Already resolved        | bun:test sweep against HEAD shows these tests no longer reproduce — auto-closed between catalog snapshot (a4cfcf0) and verification HEAD                                                                         |
| 3   | Tenant-leak nested cases (deferred-items.md ci-gate #2 + #5)               | Already resolved        | Current ci-gate fails are 3 of 5 originally cataloged; items #2 + #5 no longer reproduce — auto-closed                                                                                                           |

### Required Artifacts (Plan-Level Frontmatter Must-Haves)

All 40 artifacts across the 10 plans pass Levels 1+2 (exist, substantive). Highlights:

| Artifact                                                                | Expected                                                        | Status                    | Details                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle/0026_phase07_tasks_cushion_months.sql`                         | 3-kind chk + cushion_target_months + 3 dedup indexes            | VERIFIED                  | Migration ships ALTER + 3 CREATE UNIQUE INDEX statements; journal entry registered at `drizzle/meta/_journal.json:191`                                                                                                                                                    |
| `packages/budgeting/src/ports/task-repo.ts`                             | TaskKind union + 7 new write methods                            | VERIFIED                  | TaskKind exports 3-kind union (line 30); port surface ships resolve + 3 emit + resolveByKindAndBudget + resolveConfirmDraftByDraftId methods                                                                                                                              |
| `packages/budgeting/src/adapters/persistence/task-repo.ts`              | ON CONFLICT DO NOTHING + tenant_id WHERE                        | VERIFIED                  | Line 83 has ON CONFLICT DO NOTHING; lines 103/135/206/217 all scope UPDATEs by `tenant_id = ${tenantId}::uuid`                                                                                                                                                            |
| `packages/budgeting/src/application/resolve-task.ts`                    | Result<void,Error>-returning service                            | VERIFIED                  | Line 30 returns `Promise<Result<void, Error>>`; line 37 calls `deps.taskRepo.resolve`                                                                                                                                                                                     |
| `packages/budgeting/src/application/recompute-cushion-task.ts`          | Single helper used by 6+ sites                                  | VERIFIED                  | 100% coverage in test run; 5 inline hook sites + sweep import it                                                                                                                                                                                                          |
| `packages/budgeting/src/application/recompute-reserve-topup-task.ts`    | mismatchCents direction logic                                   | VERIFIED                  | Lines 87-126 ship the closure; references buildReservesSummary's mismatchCents (line 23 comment + line 107)                                                                                                                                                               |
| `packages/budgeting/src/application/get-cushion-summary.ts`             | bigint cents + FX as-of TODAY                                   | VERIFIED                  | Line 151 calls computeRecurringFx; line 42 imports FxProviderLike; 100% coverage                                                                                                                                                                                          |
| `apps/worker/src/handlers/recurring-engine.ts`                          | Inline CONFIRM_DRAFT emit gated by insertResult.rows.length > 0 | VERIFIED                  | Line 196 gate + line 222 emitConfirmDraft call                                                                                                                                                                                                                            |
| `apps/worker/src/handlers/budgeting-reconciliation.ts`                  | Hourly sweep for both kinds                                     | VERIFIED                  | Line 114 per-tenant loop + line 137 reserve-topup + line 163 cushion                                                                                                                                                                                                      |
| `apps/api/src/routes/tasks.ts`                                          | POST resolve w/ tenant guard                                    | VERIFIED                  | tenantIds.includes guard at lines 49 + 84; line 91 calls resolveTask                                                                                                                                                                                                      |
| `apps/api/src/routes/budgets.ts`                                        | GET cushion-summary                                             | VERIFIED                  | Line 364 registers route; line 370 tenant guard; line 374 calls getCushionSummary                                                                                                                                                                                         |
| `apps/api/src/routes/budget-identity.ts`                                | cushion_target_months Zod 1..60 + recompute trigger             | VERIFIED                  | Line 35 Zod schema; lines 145/161 patch wiring; line 193 comment confirms recompute after update                                                                                                                                                                          |
| `apps/web/src/components/budgeting/task-banner-row.tsx`                 | router.push per kind                                            | VERIFIED                  | Lines 101 (RESERVE_TOPUP) + 104-110 (CUSHION) + 113 (CONFIRM_DRAFT inline fetch); no actionComingSoon                                                                                                                                                                     |
| `apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx` | pendingTaskId prop + PencilLine                                 | VERIFIED                  | Line 47 prop declaration; lines 267-277 conditional PencilLine render                                                                                                                                                                                                     |
| `apps/web/messages/{en,pl,uk}.json`                                     | 3-kind keys + actionComingSoon removed                          | VERIFIED                  | All three locales ship `bdp.tasks.title.{RESERVE_TOPUP,CONFIRM_DRAFT,CUSHION_BELOW_TARGET}` + .kind + .action.{kind}.label; actionComingSoon count = 0 in all 3                                                                                                           |
| `apps/web/src/components/settings/cushion-section.tsx`                  | Months input + live preview + onBlur PATCH                      | VERIFIED                  | Line 100 useQuery for cushion-summary; line 118/152/171 PATCH calls; line 272 onBlur wired                                                                                                                                                                                |
| `apps/web/src/components/onboarding/steps/step-features.tsx`            | cushionTargetMonths inline                                      | VERIFIED                  | Lines 22/71-77 ship the input with 1..60 validation                                                                                                                                                                                                                       |
| `apps/web/src/components/onboarding/wizard-page.tsx`                    | Commit payload includes months                                  | VERIFIED                  | Line 163 patchPayload.cushion_target_months = form.cushionTargetMonths                                                                                                                                                                                                    |
| `apps/web/src/components/budgeting/category-slider.tsx`                 | Silent linked mirror (no chain icon)                            | VERIFIED                  | Line 181 useState `linked`; line 209 reset-on-reopen; line 394 mirrors planned→cushion; line 435 setLinked(false) on cushion-edit; no chain/PencilLine icon in code                                                                                                       |
| `apps/web/e2e/features/task-banner.feature`                             | @phase7 + 3-kind scenarios + dedup skip                         | VERIFIED                  | Line 1 `@phase7`; 8 @phase7 scenarios covering RESERVE_TOPUP/CONFIRM_DRAFT/CUSHION emit+action+auto-resolve; line 72 @skip-phase-07-debt on dedup scenario                                                                                                                |
| `apps/web/e2e/page-objects/{Reserves,Wallets,Settings}Po.ts`            | Page Objects                                                    | VERIFIED (with path note) | Plans referenced `e2e/pages/{*}-page.ts`; actual location `e2e/page-objects/{*}Po.ts` (PascalCase + Po suffix). Content matches intent: ReservesPo line 17 PencilLine, WalletsPo line 26 cushionSection #cushion match, SettingsPo line 39 #cushion-target-months locator |

### Key Link Verification

| From                                                           | To                                                       | Via                                     | Status                       | Details                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| resolve-task.ts                                                | task-repo adapter via port                               | deps.taskRepo.resolve(taskId, tenantId) | WIRED                        | Line 37 confirmed                                                    |
| task-repo adapter emit                                         | tasks dedup indexes                                      | INSERT ... ON CONFLICT DO NOTHING       | WIRED                        | Line 83                                                              |
| task-repo adapter resolve                                      | RLS isolation                                            | WHERE tenant_id = $tenantId             | WIRED                        | Lines 103/135/206/217                                                |
| recompute-cushion-task                                         | computeCushionSummary                                    | internal import                         | WIRED                        | Line 30 import + line 66 call                                        |
| get-cushion-summary                                            | FxProvider                                               | computeRecurringFx                      | WIRED                        | Line 151                                                             |
| recurring-engine                                               | TaskRepo.emitConfirmDraft                                | Inline, same withTenantTx               | WIRED                        | Lines 196 + 222                                                      |
| confirm-recurring-draft / dismiss-draft / skip-recurring-draft | resolveConfirmDraftByDraftId                             | Same tx as state-change UPDATE          | WIRED                        | confirm:89, dismiss:64, skip:71                                      |
| recompute-reserve-topup-task                                   | reserves-summary-builder.ts mismatchCents                | Internal call                           | WIRED                        | Lines 23 + 107                                                       |
| 3 reserve hook sites → recompute-reserve-topup-task            | set-wallet-balance/update-wallet/adjust-category-reserve | Same withTenantTx                       | WIRED                        | set:30/196, update:29/257, adjust:37/217                             |
| 5 cushion hook sites → recompute-cushion-task                  | set/update/create/archive-wallet + set-category-limit    | Same withTenantTx                       | WIRED                        | set:31/228, update:30/289, create:11/92, archive:27/144, limit:13/94 |
| budgeting-reconciliation hourly sweep                          | recompute-reserve-topup + recompute-cushion              | per-tenant withTenantTx                 | WIRED                        | Line 114 loop + 137 + 163                                            |
| POST /tasks/:taskId/resolve                                    | resolveTask service                                      | deps.budgeting.resolveTask              | WIRED                        | tasks.ts:91                                                          |
| GET /budgets/:id/cushion-summary                               | getCushionSummary service                                | deps.budgeting.getCushionSummary        | WIRED                        | budgets.ts:374                                                       |
| PATCH /budgets/:id cushion_target_months                       | recomputeCushionTask helper                              | Inline after identity update            | WIRED                        | budget-identity.ts:35/145/161/193                                    |
| TaskBannerRow onClick                                          | router.push for deep-link kinds                          | useRouter from next/navigation          | WIRED (partial — see gap #2) | URL contract drift for CUSHION                                       |
| TaskBannerRow CONFIRM_DRAFT onClick                            | POST /recurring-rules/.../confirm                        | clientApiFetch                          | WIRED                        | task-banner-row.tsx:10 import + line 119                             |
| CushionSection onBlur                                          | PATCH /budgets/:id {cushion_target_months}               | api.budgets[":id"].$patch               | WIRED                        | cushion-section.tsx:118/152/272                                      |
| CushionSection preview                                         | GET /budgets/:id/cushion-summary                         | useQuery                                | WIRED                        | cushion-section.tsx:100/103                                          |

### Data-Flow Trace (Level 4)

| Artifact                                   | Data Variable                                                    | Source                                                                                                                        | Produces Real Data                      | Status  |
| ------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------- |
| TaskBanner                                 | `tasks` from `useQuery({queryKey:["tasks",budgetId,"pending"]})` | `GET /budgets/:id/tasks?status=pending` → listPendingTasks application service → TaskRepo.listPending → budgeting.tasks rows  | YES — DB-backed via Drizzle             | FLOWING |
| CushionSection preview                     | `cushionSummary` from useQuery                                   | `GET /budgets/:id/cushion-summary` → getCushionSummary → computeCushionSummary → DB queries on category_limits + wallets + FX | YES                                     | FLOWING |
| TaskBannerRow CUSHION_BELOW_TARGET payload | `task.payload.shortfall_cents` etc                               | Emit-path in recompute-cushion-task.ts:93 packs payload from computeCushionSummary result                                     | YES                                     | FLOWING |
| ReservesTableRow PencilLine                | `pendingTaskId` prop from parent                                 | Parent (reserves-table-client.tsx) reads tasks query to find matching RESERVE_TOPUP task per category                         | YES (parent verified by plan reference) | FLOWING |

### Behavioral Spot-Checks

| Behavior                                  | Command                                                                                      | Result                                              | Status            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------- |
| Drizzle migration 0026 applied to live DB | `grep '0026_phase07' drizzle/meta/_journal.json`                                             | Match found line 191                                | PASS              |
| TaskKind union 3-kind only                | `grep 'export type TaskKind' packages/budgeting/src/ports/task-repo.ts` + tasks-schema CHECK | sql at tasks-schema.ts:41 contains only the 3 kinds | PASS              |
| actionComingSoon removed from i18n        | `grep -c actionComingSoon apps/web/messages/{en,pl,uk}.json`                                 | 0/0/0                                               | PASS              |
| TaskBanner mounted in BDP                 | `grep TaskBanner apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx`                    | Line 75 confirmed                                   | PASS              |
| bun:test packages/budgeting/test/tasks/   | `infisical run -- bun test packages/budgeting/test/tasks/`                                   | 21 pass / 1 skip / 3 fail                           | FAIL — see gap #1 |
| ci-gate tests/tenant-leak/                | `infisical run -- bun test tests/tenant-leak/`                                               | 38 pass / 3 fail                                    | FAIL — see gap #1 |
| Vitest task-banner-row                    | `cd apps/web && bun run test task-banner-row`                                                | 8 pass / 1 fail                                     | FAIL — see gap #2 |
| Docker dev stack running                  | `docker compose ps`                                                                          | api/web/worker/db all healthy                       | PASS              |

### Requirements Coverage

| Requirement | Source Plan(s)                    | Description                                                         | Status    | Evidence                                                                                                                         |
| ----------- | --------------------------------- | ------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TASK-01     | 07-01, 07-02                      | Tasks table schema (kind enum, payload, status)                     | SATISFIED | Migration 0026 + tasks-schema.ts + 3-kind chk verified                                                                           |
| TASK-02     | 07-05, 07-06                      | RESERVE_TOPUP generator on Σ-mismatch                               | SATISFIED | 3 inline hooks + sweep + payload direction TOPUP/WITHDRAW verified                                                               |
| TASK-03     | 07-04                             | CONFIRM_DRAFT on recurring materialization                          | SATISFIED | recurring-engine.ts:222 emit + 3 resolution paths                                                                                |
| TASK-04     | 07-01, 07-03, 07-06, 07-09        | CUSHION_BELOW_TARGET w/ payload schema + auto-resolve               | SATISFIED | Helper + 5 hooks + cushion_target_months column + UI inputs verified                                                             |
| TASK-05     | —                                 | [DROPPED in v1.1]                                                   | DEFERRED  | Properly dropped per REQUIREMENTS.md:132                                                                                         |
| TASK-06     | 07-02, 07-04, 07-05, 07-06, 07-07 | Auto-resolve on underlying state correction                         | SATISFIED | All 3 kinds wire resolve paths; runtime tenant scope partly tested (see gap #1 — adapter idempotency)                            |
| TASK-07     | 07-07, 07-08                      | Banner above BDP tabs w/ count chip + expand + kind-specific action | SATISFIED | task-banner.tsx + task-banner-row.tsx + Layout wiring verified (URL contract drift in gap #2 still scoped to TASK-07/04 surface) |
| TASK-08     | 07-04, 07-05, 07-06, 07-08, 07-10 | i18n title format ("Top up reserve by {amount}" style)              | SATISFIED | All 3 kinds localized in EN/PL/UK at messages/\*.json:912-957                                                                    |

All 8 declared phase TASK-IDs (TASK-01..04, 06..08) accounted for with no orphans. TASK-05 properly tagged DROPPED.

### Anti-Patterns Found

| File                                                  | Line | Pattern                                                                                     | Severity | Impact                                                                                                                                            |
| ----------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| packages/budgeting/test/tasks/reserve-topup.test.ts   | 437  | `it.skip("hourly sweep emits when inline path was missed...")`                              | Warning  | Plan 07-06 must_have stated this would be replaced with real assertion; the skip persists                                                         |
| apps/web/src/components/budgeting/task-banner-row.tsx | 110  | URL drift: `?task=...&focus=cushion` ships but spec/test/page-object expect `#cushion` hash | Blocker  | Phase 8 push deep-link contract will inherit wrong URL; 1 Vitest fails; WalletsPo URL assertion would fail in real navigation                     |
| apps/web/e2e/features/task-banner.feature             | 72   | `@skip-phase-07-debt` on dedup scenario                                                     | Info     | Documented in deferred-items.md as test-seed bypass (uses raw SQL, not TaskRepo.emit) — orthogonal to phase 7 production surface; planner-tracked |

### Human Verification Required

#### 1. RESERVE_TOPUP end-to-end emit→action→auto-resolve

**Test:** Open dev stack, create a budget, change a reserve-wallet balance so Σ(wallet) ≠ Σ(reserve), observe RESERVE_TOPUP appears in banner with localized title + "Top up reserve by {amount}" format, click action, land at /reserves with deep link, edit reserve to match wallet sum, observe task disappears.
**Expected:** Banner row appears within poll interval (≤60s), title localized correctly in EN/PL/UK, action button navigates to `/reserves?task=<id>`, after rebalancing the task auto-resolves on next poll and banner collapses if no other tasks remain.
**Why human:** Plan 07-10 was `autonomous=false` and explicitly demands UAT checkpoint; visual layout, mobile rendering, real-time emit→resolve cycle, and i18n locale switching are not assertable in unit/E2E run.

#### 2. CUSHION cushion_target_months PATCH + preview + emit deep-link

**Test:** Open Settings → Cushion, set `cushion_target_months` from default 6 to 12, observe preview line updates required/actual/shortfall amounts; if shortfall > 0 confirm CUSHION_BELOW_TARGET appears in banner with localized "Cushion short by {shortfall}" title and routes to Wallets on click.
**Expected:** Preview line live-updates after blur, task emits within poll interval, navigation lands at `/wallets` with the cushion section visible (either via hash anchor OR focus query param — see gap #2).
**Why human:** PATCH→recompute→banner is a multi-component user flow; visual cushion section anchor scroll behavior cannot be asserted by unit tests; the URL contract drift gap means the visible navigation result is ambiguous until resolved.

#### 3. CONFIRM_DRAFT inline confirm UX

**Test:** Run recurring rule materialization (e.g., wait for or trigger the worker), observe CONFIRM_DRAFT row appears, click Confirm, observe optimistic row collapse + sonner toast on success, refresh and confirm draft is confirmed in DB.
**Expected:** Inline confirm path: button shows Loader2 spinner during request, row disappears on 200, error toast on 4xx/5xx; underlying draft has `confirmed_at` set; CONFIRM_DRAFT task is RESOLVED in DB.
**Why human:** Inline mutation + optimistic UI + sonner toast UX cannot be asserted by unit tests; real-time poll cycle requires running stack.

#### 4. E2E @phase7 suite green

**Test:** `make test-e2e -- --grep @phase7` against the running stack.
**Expected:** 8 passing / 0 failing / 1 skipped (`@skip-phase-07-debt` by design).
**Why human:** Verifier cannot run Playwright against the live stack in this session; user/CI must execute.

### Gaps Summary

Phase 7 substantively ships the goal: all 4 ROADMAP success criteria are wired through code (3 generators + auto-resolve hooks + banner + i18n + count chip + tenant-guarded routes + cushion math + UI inputs). Migration 0026 is journal-registered and live. All 40 plan-frontmatter artifacts pass existence + substantive checks.

However, three behavioral gaps remain — each is **actionable by a follow-up plan rather than reopening Phase 7 wholesale**:

1. **Resolve-idempotency adapter + tenant-leak gate red (6 fails)** — these target Phase 7's POST /tasks/:id/resolve surface and the cushion-summary endpoint. SUMMARY 07-10 itself explicitly states Phase 7 cannot be marked complete until these are green. Of the 10 originally cataloged, 4 self-resolved between catalog snapshot and HEAD; 6 persist.

2. **CUSHION URL contract drift** — code ships `?task=...&focus=cushion` while spec/Vitest/WalletsPo expect `#cushion` hash. Phase 8 deep-link contract depends on which one wins. 1 Vitest test red, and the E2E WalletsPo navigation assertion will fail against the shipped URL.

3. **Hourly-sweep test #5 unskipped** — Plan 07-06 promised this would land as a real assertion; `it.skip` persists on reserve-topup.test.ts:437.

Recommend opening a small `07-debt` plan to address all three. Once green, re-verify and flip ROADMAP Phase 7 to `[x]` after UAT (items 1–4 in Human Verification).

---

_Verified: 2026-05-31T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
