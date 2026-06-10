---
phase: 03-navigation-home-bdp-frame
plan: 07
subsystem: testing
tags: [playwright-bdd, gherkin, i18n, page-objects, better-auth, e2e]

requires:
  - phase: 03-navigation-home-bdp-frame
    provides: nav.*, home.*, bdp.*, budgets.new.* EN keys; BDP sticky wrapper + task banner test ids; React Query + playwright-bdd config
provides:
  - PL + UK message catalogs covering every Phase 3 namespace (48 leaf keys) in locked nested shape
  - 5 Page Object classes (TopNavPo, SwitcherPo, HomePo, BdpPo, TaskBannerPo) at apps/web/e2e/page-objects/
  - Better-Auth-backed fresh-user-per-scenario fixture (cookie copy via context.addCookies) replacing the Plan 03-01 stub
  - testEmpty fixture variant for empty-state scenarios
  - parseSetCookieToPlaywright + signUpViaHttp + createBudgetViaHttp as named exports for step reuse
  - common-steps.ts with 30+ Given/When/Then bindings (incl. phone-sized viewport + pg-driven task seeding)
  - 4 Gherkin feature files (17 scenarios) covering 14 Phase 3 REQ-IDs + MAJOR #21 mobile-collapse paths
affects:
  - Phase 4 (Spendings Grid) — fixture + Page Object pattern reused
  - Phase 5 (Reserves/Wallets) — same E2E infra
  - Phase 8 (PWA + i18n hardening) — locale catalogs prepared; only message-additions needed
  - All future phases can extend e2e/steps/common-steps.ts and e2e/page-objects/

tech-stack:
  added: [pg (dynamic import for test-only task seeding)]
  patterns:
    - "Programmatic Better Auth signup via /auth/sign-up/email + cookie copy via context.addCookies()"
    - "Page Object encapsulation per surface (TopNavPo, BdpPo, etc.) — Gherkin features call POs, never raw selectors"
    - "Dynamic pg import in steps for test-DB seeding (DATABASE_URL_APP rewritten @db:->@localhost: for host-side runs)"
    - "Nested ICU plural catalog shape (one/few/many/other for PL + UK) — first canonical example for Phase 8"

key-files:
  created:
    - apps/web/e2e/page-objects/TopNavPo.ts
    - apps/web/e2e/page-objects/SwitcherPo.ts
    - apps/web/e2e/page-objects/HomePo.ts
    - apps/web/e2e/page-objects/BdpPo.ts
    - apps/web/e2e/page-objects/TaskBannerPo.ts
    - apps/web/e2e/steps/common-steps.ts
    - apps/web/e2e/features/nav-switcher.feature
    - apps/web/e2e/features/home.feature
    - apps/web/e2e/features/bdp-tab-frame.feature
    - apps/web/e2e/features/task-banner.feature
  modified:
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/e2e/fixtures/fresh-user-per-scenario.ts

key-decisions:
  - "Better Auth cookie-copy pattern via Set-Cookie parser (Node 20 getSetCookie() with raw fallback) — preferred over UI form-fill because it survives sign-in form evolution"
  - "Dynamic import('pg') inside the task-seeding step so production web bundle stays free of pg dependency"
  - "DATABASE_URL_APP rewriter (@db: -> @localhost:) lets E2E steps run from host AND inside compose net without env juggling"
  - "Makefile test-e2e target already shipped by quick-task 260507-m3x with PLAYWRIGHT_BASE_URL_RESOLVED indirection — no change needed; observed at line 80"
  - "Empty-user step inlines signup flow (rather than importing testEmpty) because playwright-bdd binds steps to a single test extender — switching extenders mid-feature is unsupported"

patterns-established:
  - "playwright-bdd v8 + Page Object + fresh-user-per-scenario fixture trio: every feature file requires `Given I am signed in as a fresh user` first"
  - "Step files import `test` from the fixture (NOT from playwright-bdd directly) so freshUser flows into step contexts"
  - "Each PO exposes locator getters returning Playwright `Locator`s; steps drive interactions, never PO methods"

requirements-completed: [NAV-04, HOME-03, BDP-01, BDP-05]

duration: 17min
completed: 2026-05-13
---

# Phase 3 Plan 7: I18N + Gherkin E2E Coverage Summary

**PL + UK message catalogs for every Phase 3 namespace, plus playwright-bdd v8 Gherkin features (17 scenarios across 4 files), Page Objects, and a Better-Auth-backed fresh-user fixture that closes the E2E coverage gap for Phase 3.**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-05-12T23:55:00Z
- **Completed:** 2026-05-13T00:12:00Z
- **Tasks:** 3
- **Files modified/created:** 13

## Accomplishments

- PL + UK translations added for `nav.*`, `home.*`, `bdp.*`, `budgets.new.*` namespaces with correct ICU plural forms (one/few/many/other) — validated by node script showing all 48 Phase 3 leaf keys present in EN/PL/UK
- 5 Page Object classes covering top-nav, budget switcher, home page, BDP frame, task banner
- Better-Auth-backed `freshUser` fixture: programmatic `/auth/sign-up/email` POST, Set-Cookie parse via `getSetCookie()` with raw fallback, `context.addCookies()` browser seeding, `/api/budgets` budget creation; the `pending-implementation` stub is gone
- `testEmpty` fixture variant for the empty-home-state scenario
- 17 Gherkin scenarios across 4 feature files exercising NAV-01..04, HOME-01/03/04, BDP-01/02/04/05, BDP-03 + mobile-viewport paths
- `apps/web/bun run typecheck` exits 0

## Task Commits

1. **Task 1: PL + UK message catalogs** — `fff7f8f` (feat)
2. **Task 2: Page Objects + fresh-user fixture + common steps** — `dccd494` (feat)
3. **Task 3: Gherkin feature files** — `947f1c7` (feat)

## Files Created/Modified

- `apps/web/messages/pl.json` — appended nav.{budgetSwitcher,switcher,newBudget,newBudgetTooltip}, home.{heading,card,chart,empty}, bdp.{tab.{spendings,reserves,wallets,settings}.{label,title,placeholder},tasks.{banner,count,actionComingSoon}}, budgets.new.{title,placeholder,backToHome}
- `apps/web/messages/uk.json` — same additions in Ukrainian
- `apps/web/e2e/page-objects/TopNavPo.ts` — switcher trigger, new-budget button, brand mark
- `apps/web/e2e/page-objects/SwitcherPo.ts` — personal/shared sections + budgetRow(name)
- `apps/web/e2e/page-objects/HomePo.ts` — goto(locale), heading, card(name), emptyCta, placeholderChart
- `apps/web/e2e/page-objects/BdpPo.ts` — goto(locale, budgetId, tab?), pill(slug), pillLabel(slug), stickyWrapper
- `apps/web/e2e/page-objects/TaskBannerPo.ts` — banner, trigger, taskRow(idx), pillLabel
- `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` — replaced stub with Better Auth signup + cookie copy + budget creation; exports parseSetCookieToPlaywright, signUpViaHttp, createBudgetViaHttp, testEmpty
- `apps/web/e2e/steps/common-steps.ts` — 30+ Given/When/Then bindings shared by all 4 features
- `apps/web/e2e/features/nav-switcher.feature` — 4 scenarios (NAV-01..04)
- `apps/web/e2e/features/home.feature` — 4 scenarios (HOME-01, HOME-03, HOME-04 + empty-state)
- `apps/web/e2e/features/bdp-tab-frame.feature` — 5 scenarios (BDP-01, BDP-02, BDP-04, BDP-05 + MAJOR #21 mobile collapse)
- `apps/web/e2e/features/task-banner.feature` — 4 scenarios (BDP-03 absent / count chip / expand / phone viewport)

## Decisions Made

- **Cookie-copy over UI sign-in.** Cookie-copy avoids brittle UI form selectors and exercises the production Better Auth path. Fixture throws explicitly if Set-Cookie is missing, so any Better Auth shape change surfaces immediately.
- **Dynamic `import('pg')` in task-seeding step.** Prevents `pg` from polluting the web bundle while keeping the convenient seed-via-INSERT pattern from `apps/api/test/routes/wallets.test.ts`.
- **Reused existing Makefile `test-e2e:` target.** Quick-task 260507-m3x had already wired `test-e2e:` with a smarter `PLAYWRIGHT_BASE_URL_RESOLVED` macro (reads APP_URL from .env.local). No edit needed — the plan's simpler variant would have been a regression.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Makefile `test-e2e:` target already exists; skipped re-adding**

- **Found during:** Task 3
- **Issue:** Plan instructed appending `test-e2e:` to the Makefile, but quick-task 260507-m3x had already added it at line 80 with a more capable `PLAYWRIGHT_BASE_URL_RESOLVED` macro that reads APP_URL from `.env.local` first.
- **Fix:** Verified existing target via `grep -n '^test-e2e:' Makefile`; left it untouched.
- **Verification:** `grep -q '^test-e2e:' Makefile` exits 0; `grep PLAYWRIGHT_BASE_URL Makefile` shows the resolver.
- **Committed in:** N/A (no file change)

**2. [Rule 1 - Bug] Plan's empty-user step used `import('../fixtures/fresh-user-per-scenario') as any`**

- **Found during:** Task 2
- **Issue:** Plan's draft for `Given I am a signed-in user with no budgets` used `as any` for the dynamic import and ignored the `userId` destructure. Loose typing weakens the contract.
- **Fix:** Replaced with named imports at the top of `common-steps.ts` (`signUpViaHttp`, `parseSetCookieToPlaywright`, `ParsedCookie`) and added an explicit check for empty Set-Cookie array.
- **Files modified:** `apps/web/e2e/steps/common-steps.ts`, `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` (exported helpers).
- **Verification:** `bun run typecheck` exits 0.
- **Committed in:** `dccd494` (Task 2).

**3. [Rule 1 - Bug] Set-Cookie SameSite normalization**

- **Found during:** Task 2
- **Issue:** Plan's parser passed raw `SameSite` attribute value to Playwright via `as any`; Playwright requires `"Strict"|"Lax"|"None"` exactly with capitalized casing.
- **Fix:** Added explicit lowercase comparison + mapped to canonical casing (`Strict` / `None` / `Lax` default).
- **Verification:** `bun run typecheck` exits 0.
- **Committed in:** `dccd494` (Task 2).

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bug). **Impact:** No scope change — all three made the implementation safer/more typed than the plan's pseudo-code.

## Issues Encountered

- Linter reformatted `BdpPo.ts`, `fresh-user-per-scenario.ts`, and `common-steps.ts` after task 2 commit (prettier ran in pre-commit). Diff retained intentionally; no semantic change.

## Threat Flags

None — surface introduced (test fixture HTTP signup, test-DB INSERT) is explicitly enumerated in the plan's threat register with `accept`/`mitigate` dispositions.

## Self-Check: PASSED

- File `apps/web/messages/pl.json` — FOUND
- File `apps/web/messages/uk.json` — FOUND
- Files `apps/web/e2e/page-objects/{TopNavPo,SwitcherPo,HomePo,BdpPo,TaskBannerPo}.ts` — FOUND
- File `apps/web/e2e/fixtures/fresh-user-per-scenario.ts` — FOUND (no `pending-implementation`)
- File `apps/web/e2e/steps/common-steps.ts` — FOUND
- Files `apps/web/e2e/features/{nav-switcher,home,bdp-tab-frame,task-banner}.feature` — FOUND
- Commits `fff7f8f`, `dccd494`, `947f1c7` — FOUND in `git log`
- `node` JSON validator: 48 Phase-3 keys present in EN/PL/UK
- `bun run typecheck` exit 0
- 17 scenarios total across 4 features; `phone-sized viewport` present in BDP + task-banner

## Next Phase Readiness

Phase 3 is closed. Phase 4 (Spendings Grid) can reuse:

- The freshUser fixture pattern (cookie copy + budget seed)
- Page Object encapsulation (extend BdpPo with spendings-grid getters)
- common-steps.ts (extend with grid-row CRUD steps)
- PL + UK catalog scaffold (add `bdp.tab.spendings.*` grid keys)

Running `make test-e2e` against the dev stack will execute all 17 scenarios. Actual green E2E run is deferred to phase-verification once `make dev` is up (per plan §verification).

---

_Phase: 03-navigation-home-bdp-frame_
_Completed: 2026-05-13_
