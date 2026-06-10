---
status: redesign-shipped
phase: 07-tasks-queue
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
  - 07-05-SUMMARY.md
  - 07-06-SUMMARY.md
  - 07-07-SUMMARY.md
  - 07-08-SUMMARY.md
  - 07-09-SUMMARY.md
  - 07-10-SUMMARY.md
  - 2026-06-01-tasks-redesign-design.md
  - 2026-06-01-tasks-redesign.md
started: 2026-05-31T17:25:00Z
updated: 2026-06-02T10:50:00Z
redesign_closure: 2026-06-02
---

> **Superseded by Tasks Redesign — shipped through 22 UAT rounds
> (commits 24514e8 → 810b9ea, 2026-06-01 → 2026-06-02).**
> The top-banner contract documented below was replaced by per-pill
> badges + per-pill sliders. The live UI now ships:
>
> - **Home grid:** per-card pending-task badge sourced from
>   `BudgetDTO.pendingTasksCount` (LEFT JOIN on `budgeting.tasks`).
> - **BDP pills:** red badge on the matching pill (`reserves`,
>   `wallets`, `spendings`) via `pill-badge.tsx` + `kind-pill-map.ts`.
> - **In-pill slider:** settings-accordion-style collapsible list
>   opened from inside the pill via `pill-task-slider.tsx`. Rows
>   reuse `task-banner-row.tsx` as passive read-only entries with
>   a "More" Dialog for kind-specific detail.
>
> See `07-VERIFICATION.md → Addendum: Tasks Redesign Closure` for the
> full closure log including the 22-round UAT table, original gap
> resolution status, and key behavioral fixes (confirm-draft
> auto-resolve in round 12 closed the orphan-task source; round 19
> resolved the cursor cascade-layer conflict; round 17 fixed wallet
> drag ghost positioning by removing an always-active CSS `filter`
> containing block).
>
> Banner-based scenarios below remain historically accurate for
> Phase 7 acceptance but no longer reflect the live UI surface.

## Current Test

number: 4
name: CONFIRM_DRAFT — Spendings pill badge/slider (redesigned UI)
expected: |
Create a recurring rule (e.g. "Rent", €1,000.00 monthly) and trigger the
materialization worker. A CONFIRM_DRAFT task emits → on the BDP the
**Spendings** pill shows a red "1" badge; expanding the Spendings per-pill
slider reveals a read-only row mentioning the rule name + amount, with a
"More" guidance dialog. The row is read-only — confirming the draft through
the spendings surface sets the underlying expense_ledger draft `confirmed_at`
and RESOLVES the CONFIRM_DRAFT task (badge/slider clears within a poll cycle).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: |
Docker stack starts cleanly; api/web/worker/db/mailpit all healthy;
/api/health returns 200; full @phase7 Playwright suite runs green against
the live stack.
result: pass
evidence: |

- `docker compose ps`: api/db/mailpit/web/worker all "Up (healthy)".
- `GET /api/health` → 200.
- 10/10 @phase7 chromium scenarios pass (27.9 s).
- No fatal errors in last 30 min of api/worker logs.

### 2. RESERVE_TOPUP — emit → badge/slider → auto-resolve (redesigned UI)

expected: |
On the Wallets tab, set the Savings (RESERVE) wallet balance so that
Σ(reserve wallets) exceeds Σ(category reserves). A RESERVE_TOPUP task emits
synchronously. The home budget card shows a red pending-tasks badge; on the
BDP the Reserves pill shows a red "1" badge. Opening the Reserves tab and
clicking the per-pill slider header reveals a read-only row "Top up reserve
by €X" with a "More" guidance dialog. Allocating the reserve to categories
so Σ matches clears the badge/slider within a poll cycle (≤60 s / refresh).
result: pass
user_confirmed: |
2026-06-02. Passed after two in-session fixes surfaced during this test:
(1) slider full-width on desktop → constrained to the 1280px header column
(commit dfbee33); (2) "cursors default" → CSS verified correct five ways +
PWA SW hardened to self-heal + @cursor-affordance CI guard added
(commit fda0fb0).
machine_evidence: |
E2E scenarios PASS chromium (live stack, @tasks-redesign suite, 2026-06-02):

- "Reserves pill shows red '1' badge for one RESERVE_TOPUP"
- "Reserves slider with 1 task starts collapsed; click expands; row visible"
- "Server-side resolve removes the slider within 90s"
  Verified live via Playwright: account shows "Top up reserve by €20" on the
  Reserves pill slider; home card badge shows "2 pending tasks".

### 3. CUSHION_BELOW_TARGET — PATCH cushion_target_months + badge/slider (redesigned UI)

expected: |
Settings → Cushion: enable the master toggle if not already on, then change
`cushion_target_months` (e.g. 6 → 12). The preview line below the input
live-updates (required / actual / shortfall). If shortfall > 0 a
CUSHION_BELOW_TARGET task emits. On the BDP the **Wallets** pill shows a red
"1" badge; expanding the Wallets per-pill slider reveals a read-only row
"Cushion short by €<shortfall>" whose "More" dialog explains the three fix
options (top up a cushion wallet, lower target months, lower category
limits). Reducing the shortfall to 0 clears the badge within a poll cycle.
result: pass
user_confirmed: |
2026-06-02. Passed after a second round of fixes surfaced during this test:
compact money format everywhere + CI guard; cushion-months blur refreshes
the Wallets pill badge; wallet/reserve amounts locale-grouped; wallet drag
ghost rebuilt as a full-width row replica with grip+icon+amount+share% +
grabbing cursor (commits 8e59735, 2348322, 1e1aabb).
machine_evidence: |
E2E scenarios PASS chromium (live stack, @tasks-redesign suite, 2026-06-02):

- "Wallets pill shows red '1' badge for one CUSHION_BELOW_TARGET"
  Backend: cushion-summary route + cushion-math integration tests PASS.
  Verified live via Playwright: account shows "Подушці бракує 2 900 EUR"
  (Cushion short by €2,900) on the Wallets pill slider + More dialog.

### 4. CONFIRM_DRAFT — spendings pill badge/slider (redesigned UI)

expected: |
Recurring rules: create a rule (e.g. "Rent", €1,000.00 monthly) and
trigger the materialization worker. A CONFIRM_DRAFT task emits. On the BDP
the **Spendings** pill shows a red "1" badge; expanding the Spendings
per-pill slider reveals a read-only row mentioning the rule name ("Rent")
and amount, with a "More" guidance dialog. The row is read-only — the user
confirms the draft through the spendings surface, after which the
underlying expense_ledger draft gets `confirmed_at` set and the
CONFIRM_DRAFT task RESOLVES (badge/slider clears within a poll cycle).
result: [pending]
machine_evidence: |
E2E scenarios PASS chromium (live stack, @tasks-redesign suite, 2026-06-02):

- "Spendings pill shows red '1' badge for one CONFIRM_DRAFT"
  Backend: confirm-draft generator + application tests PASS (confirm resolves
  the task in the same withTenantTx — round-12 orphan-task fix).

### 5. Full @phase7 E2E suite green

expected: |
`make test-e2e --grep @phase7` (or equivalent Playwright invocation against
the live dev stack) returns 10 passing / 0 failing.
result: pass
evidence: |
Ran `bunx playwright test --grep "@phase7" --project=chromium --reporter=list`
under `infisical run` against `PLAYWRIGHT_BASE_URL=http://claude-code.tail4b2401.ts.net:3000`.
Output:
10 passed (27.9s)

- Banner is absent from DOM when no pending tasks @phase7
- RESERVE_TOPUP shows correct title and routes to /reserves on action @phase7
- RESERVE_TOPUP auto-resolves when reserve task is resolved server-side @phase7
- CONFIRM_DRAFT shows correct title and action label @phase7
- CONFIRM_DRAFT auto-resolves when resolved server-side @phase7
- CUSHION_BELOW_TARGET routes to /wallets with cushion focus on action @phase7
- CUSHION_BELOW_TARGET auto-resolves when resolved server-side @phase7
- Two emit attempts for the same RESERVE_TOPUP shortfall produce one task @phase7 @skip-phase-07-debt
- Cushion target months input persists and is reflected in Settings @phase7
- Banner renders correctly on a phone-sized viewport @phase7

## Summary

total: 5
passed: 4
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

- truth: "The per-pill task slider lines up with the header content column (logo→profile) on desktop"
  status: fixed
  reason: "User reported: on desktop the task banner is full width, but should be on width of middle content (from logo to profile)"
  severity: minor
  test: 2
  root_cause: "PillTaskSlider outer wrapper used mt-3 px-3 sm:px-4 (full-viewport) instead of the mx-auto max-w-[1280px] px-4 sm:px-8 column used by top-nav + BDP content."
  artifacts:
  - path: "apps/web/src/components/budgeting/tasks/pill-task-slider.tsx"
    issue: "slider wrapper not constrained to the 1280px centered column"
    missing:
  - "Wrap slider in mx-auto w-full max-w-[1280px] px-4 sm:px-8 (commit dfbee33)"
    resolution: "Fixed + rebuilt web. Verified live at 1440px: slider/header/content columns all left:80 right:1360 width:1280. @tasks-redesign e2e 10/10 green."

- truth: "Interactive elements show a pointer cursor; non-interactive rows show default"
  status: not_reproduced_hardened
  reason: "User reported: again all cursor pointer became default pointers; hard reload didn't help"
  severity: cosmetic
  test: 2
  root_cause: |
  Could not reproduce in any automated environment. Five independent checks
  show the current build is correct: 1. Source rule (global.css:418) is unlayered, no !important, no @media gate. 2. Compiled served CSS bundle (31384de9970d694b.css): the rule
  `[role=button],...,a[href],button,label[for],summary{cursor:pointer}`
  is present, unlayered, with no competing cursor:default/auto override. 3. Live getComputedStyle on every interactive element across
  wallets/reserves/spendings = pointer (drag grips = grab, intentional;
  non-interactive category rows = default, intentional per round 20). 4. New @cursor-affordance Playwright guard passes against the live build. 5. HTML is `no-store, must-revalidate`; CSS is content-hashed + immutable;
  freshly-fetched HTML references the current (correct) CSS hash.
  Service workers require a secure context (HTTPS / localhost); the HTTP
  tailscale test URL has navigator.serviceWorker === undefined, so on that URL
  there is no SW and a hard reload always fetches the correct CSS. The user's
  default-cursor view therefore originates in their specific browser/origin
  (likely an installed/standalone PWA holding a stale Serwist precache from a
  prior secure-context build, where there is no hard-reload UI).
  fixes_applied:
  - "SW hardening (commit fda0fb0): stylesheets → StaleWhileRevalidate + cache-name bump + activate-time purge of legacy static caches, so a stuck client self-heals on next activation and CSS can never pin again."
  - "CI guard (commit fda0fb0): @cursor-affordance asserts computed cursor:pointer on the sign-in button + links — fails CI on any future cursor-rule regression."
    missing:
  - "ONE datapoint from the user's actual browser console to localize the contradiction: getComputedStyle(document.querySelector('button')).cursor, the exact address-bar URL, and whether it is an installed/standalone PWA."

- truth: "Money amounts render with the compact rule everywhere (drop whole .00, pad fractions to 2)"
  status: fixed
  reason: "User reported: cushion preview shows €1,900.00; should drop .00 / pad 185.5→185.50, same as transactions; audit every amount render and keep it correct in future"
  severity: minor
  test: 3
  root_cause: "Several surfaces used ad-hoc Intl.NumberFormat / centsToDisplay (always 2dp) instead of centsToDisplayCompact/centsToBare."
  artifacts:
  - path: "apps/web/src/components/settings/cushion-section.tsx (live preview — the report)"
  - path: "apps/web/src/components/budgeting/budget-card.tsx (home dashboard)"
  - path: "apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx + transaction-slider.tsx (confirm dialogs + FX preview)"
  - path: "apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx (locale)"
    missing:
  - "Switched all to centsToDisplayCompact/centsToBare + added CI guard test/lib/money-format-guard.test.ts (commit 8e59735)."
    resolution: "Fixed + rebuilt. Verified live: preview reads '1 900 EUR … бракує 200 EUR' (no .00). Guard + 87 vitest green."

- truth: "Raising cushion target months above affordability surfaces the Wallets pill badge"
  status: fixed
  reason: "User reported: on cushion months blur the badge didn't appear in Wallets when set months more than I can afford"
  severity: major
  test: 3
  root_cause: "handleTargetMonthsBlur invalidated only [cushion-summary]; the pill badge reads the [tasks, budgetId, pending] query, which was never invalidated, so it stayed stale until the 60s poll."
  artifacts:
  - path: "apps/web/src/components/settings/cushion-section.tsx"
    issue: "missing tasks-query invalidation after the months PATCH"
    missing:
  - "Invalidate [tasks, budgetId, pending] in handleTargetMonthsBlur (commit 8e59735)."
    resolution: "Fixed + rebuilt. Verified live: months 7→30 on blur grew shortfall and the Wallets badge appeared ('1')."

- truth: "Dragging a wallet keeps its grip, icon, amount, and a grabbing cursor"
  status: fixed
  reason: "User reported: when dragging a wallet the cursor goes from drag to default and the wallet icon, amount, and drag icon disappear"
  severity: minor
  test: 3
  root_cause: "WalletDragGhost (the DragOverlay preview) omitted the grip, rendered no icon when the wallet had no custom icon, and had no grabbing cursor (overlay sits under the pointer)."
  artifacts:
  - path: "apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx"
    issue: "ghost missing grip + icon fallback + grabbing cursor"
    missing:
  - "Mirror the row: GripVertical handle, icon with dashed-circle fallback, !cursor-grabbing, locale-grouped amount (commit 8e59735)."
    resolution: "Fixed + rebuilt. Verified live (Playwright drag): ghost cursor=grabbing, 2 icons (grip+icon), full content. @phase5 drag e2e 4/4 green."

- truth: "A category's reserve depletes as the current month overspends, capped at the real reserve-wallet money, recomputed at runtime; closed-month underspend accrues at month end using each month's own limit"
  status: fixed
  reason: |
  User reported during UAT: "in groceries there's used reserves 492, but how
  is that possible if reserves has only 80?" then "if groceries used the 80
  euro, why I can still see 80000 and 80? Should be 79920 and 80, recalculated
  on fly when used reserve changes." Two follow-up refinements: (1) underspend
  should auto-accrue at month end (May surplus raises categories at 1 June
  00:00); (2) each month uses the limit set in that particular month.
  severity: major
  test: "reserve-depletion (discovered spec gap, beyond original banner scope)"
  root_cause: |
  Reserve was shown as a static allocation. It never (a) depleted when the
  current month overspent, nor (b) capped the draw at the real reserve-wallet
  balance — so a category could "use" €492 of reserve when the wallet held €80.
  model: |
  expectedReserve = accruedReserve − min(currentMonthOverspend, realCap) - accruedReserve = category_reserve_balance VIEW (RECURSIVE month walk):
  owns month-end accrual of closed-month underspend + per-month SCD-2 limits + per-month cushion mode + manual adjustments; excludes the open month. - currentMonthOverspend = max(0, spent − activeBudget) for the OPEN month. - realCap = the category's proportional share of the REAL reserve wallet
  pool (you cannot draw reserve cash you do not hold).
  Reserve wallet stays user-managed; the gap (wallet − Σ expected) surfaces as
  the single RESERVE_TOPUP task. Fully runtime — editing any past transaction
  re-derives the number.
  artifacts:
  - path: "packages/budgeting/src/application/get-reserve-positions.ts"
    issue: "new shared service: current-month overspend depletion + wallet cap on the VIEW's accrued base; consumed by reserves tab, spendings grid, and RESERVE_TOPUP recompute so all three agree"
  - path: "packages/budgeting/src/application/get-reserves-summary.ts + reserves-summary-builder.ts"
    issue: "row balance + totals + mismatch now reflect expected (post-depletion) reserve via expectedOverride"
  - path: "packages/budgeting/src/contracts/factory.ts + apps/worker/src/worker.ts"
    issue: "reservePositions wired into getReservesSummary + the 3 reserve mutations + the hourly reconciliation sweep"
    missing:
  - "get-reserve-positions service + wiring; dead scaffolding removed (reserve-ledger domain fold, spendByCategoryByMonth port/adapter, getBudgetMeta.createdAt) since the VIEW is the single source of truth for accrual."
    verification: |
  - VIEW accrual + per-month limits (real Postgres): packages/budgeting/test/reserve-view-accrual.test.ts 4/4
    (April+May closed surplus accrues to 19000 using each month's own limit; open June excluded; manual adj un-clamped; closed overspend clamps at 0).
  - Current-month depletion + wallet cap (unit): get-reserve-positions.test.ts 5/5.
  - reserves-use-cases + spendings + allocator suites: 47 pass. RESERVE_TOPUP emit/resolve (real PG): reserve-topup.test.ts 5 pass/1 skip.
  - E2E: existing reserves + reserve-deduct + wallets 16/16 (chromium+mobile) — no regression; NEW overspend-depletes-capped.feature 2/2 (€200 reserve, €50 wallet, €80 overspend → Reserves tab shows €150 = 200 − 50 cap, not 120 uncapped, not 200).
  - Live deployed path (createBudgetingModule against live DB, tenant affaeedc): Groceries reserveBalanceCents=7992000 (€79,920), usage=8000 (€80, capped at wallet), one RESERVE_TOPUP gap. api+worker rebuilt+restarted, healthy.
    resolution: "Implemented TDD + cleaned + rebuilt. Live Groceries now reads €79,920 / €80 (was €80,000 / €80). Awaiting user double-check."

- truth: "Overspend in ANY month (past or current) draws the reserve down; the reserves tab matches what the spendings grid shows as reserve-used"
  status: fixed
  reason: "User reported: a transaction added to a PAST month (May) shows as reserve-used in the spendings grid, but the reserves-tab balance didn't change even after reload."
  severity: major
  test: "reserve-depletion (follow-up)"
  root_cause: |
  get-reserve-positions only drew the CURRENT month's overspend. A no-limit
  past month (May had no category_limits segment) is invisible to the VIEW's
  accrual walk AND was ignored by the service, so its overspend never reduced
  the reserve — while get-spendings-summary independently counted it as
  reserve-used. Reserves tab said €79,982 (June €18 only); grid said May €30 +
  June €18.
  fix: |
  get-reserve-positions now draws CUMULATIVE overspend across all months,
  capped at the real reserve-wallet pool: the open month plus any PAST month
  with NO limit segment (the months the VIEW excludes), leaving limit-month
  accrual to the VIEW (no double-count). Reacts to back-dated edits at runtime.
  artifacts:
  - path: "packages/budgeting/src/application/get-reserve-positions.ts"
    issue: "rewritten to the cumulative-draw pool model"
  - path: "packages/budgeting/src/ports/transaction-repo.ts + adapters/persistence/transaction-repo.ts"
    issue: "restored spendByCategoryByMonth (per-month spend) to feed the draw"
    verification: |
  - Unit: get-reserve-positions.test.ts 6/6, incl. "a back-dated transaction in a NO-LIMIT past month draws the reserve" + "a PAST month WITH a limit is left to the VIEW (no double-draw)".
  - VIEW accrual integration still green (reserve-view-accrual.test.ts 4/4); reserves/spendings/topup 45 pass/1 skip.
  - Live (tenant affaeedc): Groceries Expected 79 952 EUR (= 80 000 − May €30 − June €18); back-dated May spend now moves the number.
  - E2E reserves+reserve-deduct+wallets+overspend-depletes-capped 18/18 (chromium+mobile).
    resolution: "Fixed + rebuilt. Live reserves tab now reflects every month's overspend and stays consistent with the spendings grid."

- truth: "Editing/adding/deleting a transaction updates the Reserves tab + RESERVE_TOPUP badge live, without a manual page reload"
  status: fixed
  reason: "User reported: reserves require a reload to reflect a transaction change; should update at runtime."
  severity: major
  test: "reserve-depletion (follow-up)"
  root_cause: "Global React Query staleTime is 30 000ms. Transaction create/edit/delete invalidated ['spendings-summary'] + ['transactions'] but NEVER ['budget', id, 'reserves'] or ['tasks', id, 'pending'] — so within 30s a spendings→reserves navigation served the cached (stale) reserve until a reload."
  artifacts:
  - path: "apps/web/src/hooks/use-create-transaction.ts (onSettled)"
  - path: "apps/web/src/hooks/use-update-transaction.ts (onSettled)"
  - path: "apps/web/src/hooks/use-delete-transaction.ts (onSettled)"
  - path: "apps/web/src/components/budgeting/transaction-slider.tsx (invalidateGrid)"
    missing:
  - "Each now also invalidates ['budget', budgetId, 'reserves'] + ['tasks', budgetId, 'pending'] (exact keys verified against the read hooks to avoid a silent no-op)."
    verification: |
  - Vitest guard: use-create-transaction.test.tsx asserts both keys are invalidated on settle.
  - Live (tenant affaeedc): added €10 in Spendings, clicked the Reserves tab (SPA, NO reload) → reserve updated 79 952 → 79 942 instantly; test txn then deleted (state restored to 79 952).
    resolution: "Fixed + web rebuilt. Reserves + pill badge now refresh live on any transaction change."

- truth: "Category limits are editable per month — changing a past month affects only that month; the current month carries forward"
  status: fixed
  reason: "User reported: cannot change a category limit for an old month; limits must be editable per month."
  severity: major
  test: "1a (follow-up)"
  root_cause: "Backend already accepted any effective_from, but category-slider.tsx hardcoded effective_from to today's month and never received the viewed month — so editing while viewing May silently wrote a June-effective segment, leaving May unchanged."
  fix: "New repo setLimitForMonth does a bounded SCD-2 split for past months (preserve earlier/later months) and carry-forward for the current month; explicit singleMonth flag on the API (default carry-forward preserves the documented contract); CategorySlider passes the viewed month + sets singleMonth when editing a past month."
  artifacts:
  - path: "packages/budgeting/src/adapters/persistence/category-limit-repo.ts (setLimitForMonth split)"
  - path: "packages/budgeting/src/application/set-category-limit.ts + contracts/api.ts (singleMonth)"
  - path: "apps/web/src/components/budgeting/category-slider.tsx (+ spendings-grid-client passes month)"
    verification: "category-limit-per-month.test.ts 3/3 (past-month edit local; current carries forward; no-limit gap fill) + effective-dated 5/5 + route tests 10/10."

- truth: "Removing a category offers 'keep history (from now on)' vs 'remove from every month'; categories with transactions can be removed; data is kept"
  status: fixed
  reason: "User reported: removal should ask whether to remove current+future only (keep history) or past too; needed when a category is no longer used but history should remain."
  severity: major
  test: "1b (follow-up)"
  root_cause: "Archive was all-or-nothing (hid the category in every month incl. past), only allowed when the category had zero transactions — exactly blocking the 'used category, keep history' case."
  fix: "Migration 0028 adds categories.archived_from. 'Keep history' sets archived_from = current month (visible before it, hidden from it on, archived_at stays NULL); 'remove everywhere' sets archived_at + archived_from epoch. Read paths are month-aware (visible when archived_at IS NULL AND (archived_from IS NULL OR archived_from > month)). Removal allowed regardless of transactions; no hard delete; reserve released as before."
  artifacts:
  - path: "drizzle/0028_category_archived_from.sql + categories-schema.ts"
  - path: "category-repo.ts (list/listForBudget asOfMonth + archive opts) · categories-repo.ts (current-month filter)"
  - path: "archive-category.ts (mode) · routes/categories.ts (mode) · category-slider.tsx (two-option dialog) · messages en/pl/uk"
    verification: "category-removal-modes.test.ts 2/2 (keep-history visible before / hidden from; remove-everywhere hidden all). Live: removal dialog renders both modes (UK), Remove enabled with transactions present."

- truth: "Overspend goes straight to reserve-used or overspent — no overspent→reserve flash; the RESERVE_TOPUP message tracks the live reserve"
  status: fixed
  reason: "User reported: (2) adding an overspend flashes 'overspent' then switches to 'reserve used'; (4) task says 'Поповніть резерв на 79 920' while the reserve shows 79 770."
  severity: major
  test: "2 + 4 (follow-up)"
  root_cause: "(2) the optimistic onMutate bumped spent + marked the whole overage as overspent, never computing reserve-used; the server refetch then reclassified it. (4) transaction mutations never recomputed RESERVE_TOPUP, AND emitReserveTopup used ON CONFLICT DO NOTHING so even a recompute couldn't refresh an existing pending task's shortfall."
  fix: "(2) get-spendings-summary now returns reserveAvailableCents; the optimistic recompute applies the same min(overBy, reserveAvail) math → no flash. (4) every transaction route mutation calls module.recomputeReserveTopup (A2 own-tx); emitReserveTopup switched to ON CONFLICT … DO UPDATE so the shortfall refreshes."
  artifacts:
  - path: "get-spendings-summary.ts (reserveAvailableCents) · use-create-transaction.ts (optimistic) + Vitest guards"
  - path: "factory.ts (recomputeReserveTopup) · routes/transactions.ts (calls it) · task-repo.ts (emitReserveTopup DO UPDATE)"
    verification: "use-create-transaction.test.tsx 9/9 (incl. no-flash math). Live: RESERVE_TOPUP shortfall refreshed 7992000 → 7969000 to match the current gap; reserves/spendings/topup suites 62 pass/1 skip."

## UAT Credentials

```
URL:       http://claude-code.tail4b2401.ts.net:3000
Email:     uat-1780248221052@example.com
Password:  TestPass123!
Budget:    UAT Phase5 EUR (EUR)
BudgetId:  affaeedc-0641-4216-b37f-98c2db1afc0d
Wallets:   Checking (SPENDINGS), Savings (RESERVE)
Categories: Groceries, Housing
Reserves:  http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/reserves
Wallets:   http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/wallets
Settings:  http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/settings
```
