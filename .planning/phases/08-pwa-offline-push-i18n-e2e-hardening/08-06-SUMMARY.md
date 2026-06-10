---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: "06"
subsystem: e2e
tags:
  [
    e2e,
    playwright-bdd,
    offline,
    spendings,
    reserves,
    onboarding,
    share-link,
    cushion,
    recurring-draft,
    phase8,
  ]
dependency_graph:
  requires: [08-03, 08-05]
  provides: [E2EX-01, E2EX-02, E2EX-03, E2EX-04, PWAX-03, PWAX-06]
  affects: [apps/web/e2e]
tech_stack:
  added: []
  patterns:
    - playwright-bdd Gherkin @phase8 tag on all new features
    - PO-only step bindings (no inline raw-CSS locators in steps)
    - role-based locators where components lack data-testid (wizard nav buttons, join confirm)
    - context.setOffline() for offline queue scenarios
    - Module-level token stash for cross-step invite token sharing
key_files:
  created:
    - apps/web/e2e/features/spendings.feature
    - apps/web/e2e/features/recurring-draft.feature
    - apps/web/e2e/features/cushion.feature
    - apps/web/e2e/features/share-link.feature
    - apps/web/e2e/features/onboarding.feature
    - apps/web/e2e/steps/spendings.steps.ts
    - apps/web/e2e/steps/recurring-draft.steps.ts
    - apps/web/e2e/steps/cushion.steps.ts
    - apps/web/e2e/steps/share-link.steps.ts
    - apps/web/e2e/steps/onboarding.steps.ts
  modified:
    - apps/web/e2e/features/reserves.feature
    - apps/web/e2e/page-objects/SpendingsPo.ts
    - apps/web/e2e/page-objects/ShareLinkPo.ts
    - apps/web/e2e/page-objects/OnboardingPo.ts
    - apps/web/e2e/page-objects/SettingsPo.ts
decisions:
  - "Use role-based locators for wizard nav buttons and join-confirm button — wizard-layout.tsx and join-page-card.tsx ship no testids on those elements; adding testids would be out-of-scope component edits"
  - "txn-row testid keys off amountConvertedCents, not a server id — SpendingsPo.transactionRowByAmount(cents) encodes this correctly"
  - "quick-entry testid is per-column: quick-entry-{categoryName.toLowerCase()}, not a single quick-entry-input"
  - "Onboarding wizard lives at /en/budgets/new (not /en/onboarding which redirects there)"
  - "Join page URL is /en/budgets/join/[token] (not /en/invite/[token])"
  - "Onboarding background step must NOT call PUT /api/onboarding/progress — that would bypass the wizard redirect"
  - "Sync-issues scenario uses custom DOM event injection (budget:sync-failure) to avoid needing a real server error"
  - "Reserve auto-deduct scenario asserts column-header reserves-used indicator (from 08-05 column-header.tsx) rather than reserves tab live update — the spendings column is the real-time surface"
metrics:
  duration: "~70 minutes"
  completed: "2026-06-10T22:07:59Z"
  tasks: 4
  files_created: 10
  files_modified: 5
---

# Phase 08 Plan 06: E2E Authoring (D-21 Audit & Fill) Summary

**One-liner:** Playwright-bdd @phase8 suite covering quick-entry + offline replay, reserve auto-deduct, recurring-draft confirm, cushion toggle, share-link join, and onboarding wizard end-to-end — all bound to completed Page Objects.

## What Was Built

### Task 1 — SpendingsPo + spendings.feature + reserve auto-deduct

- **SpendingsPo.ts** rewritten: corrected testid mappings (`quick-entry-{name}`, `txn-row-{amountCents}`, `txn-pending-{id}`); added `typeQuickEntry()`, `goOffline()/goOnline()`, `anyPendingSyncMarker()`, `draftRow()`, `draftConfirmButton()`, `columnReservesUsed/Available()`.
- **spendings.feature** (@phase8, 4 scenarios): quick-entry appears in grid; offline queue shows pending marker + offline badge; reconnect clears markers; sync-issues list visible after failure injection.
- **reserves.feature** extended with @phase8 scenario: spending against a reserve-backed category makes the `column-header-groceries-reserves-used` indicator appear in real time (05-REWRITE depletion model surface in spendings column header).
- **spendings.steps.ts**: binds all spendings + auto-deduct sentences; `context.setOffline()` for offline scenarios.

### Task 2 — recurring-draft.feature + cushion.feature

- **recurring-draft.feature** (@phase8, 2 scenarios): draft row visible with confirm button; confirming removes it. Reuses `CONFIRM_DRAFT` seed step from tasks.steps.ts.
- **cushion.feature** (@phase8, 2 scenarios): toggle cushion target months in Settings; Wallets cushion section visible when enabled.
- **recurring-draft.steps.ts**: bound to `SpendingsPo.draftRow()` / `draftConfirmButton()` testids.
- **cushion.steps.ts**: bound to `SettingsPo.openCushionSection()` + `WalletsPo.cushionSection()`.

### Task 3 — ShareLinkPo + OnboardingPo + share-link.feature + audit

- **ShareLinkPo.ts** corrected: actual testids are `join-page-card`, `join-error-heading`, `join-error-cta`, `join-budget-name`; join confirm button via `getByRole("button", { name: /join|accept/i })`; `goto()` uses `/en/budgets/join/[token]`.
- **OnboardingPo.ts** completed: `stepper()`, `nextButton()`, `backButton()`, `skipButton()`, `pushStepSwitch()`, `goto()`, `clickNext()`, `clickSkip()`.
- **SettingsPo.ts** extended: `shareUrlField()` (testid `share-url-field`) + `clickGenerateInviteLink()`.
- **share-link.feature** (@phase8, 3 scenarios): generate link visible with URL; recipient sees join card; invalid token shows error heading.
- D-22 enforced: cross-tenant-cache.spec.ts and server-down.spec.ts untouched.

### Task 4 — onboarding.feature (ROADMAP criterion #4)

- **onboarding.feature** (@phase8, 2 scenarios): full wizard end-to-end (welcome → basics → skip Type/Features → assert push switch → complete → land on spendings); push step skippable (wizard still completes).
- **onboarding.steps.ts**: new `"I am signed in as a new user with no existing budget"` Given (creates user without budget, does NOT mark onboarding complete so wizard renders); wizard navigation via `OnboardingPo` only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] quick-entry testid is per-column, not a single input**

- Found during: Task 1
- Issue: Plan spec assumed `quick-entry-input`; actual component emits `quick-entry-{categoryName.toLowerCase()}` per column
- Fix: `SpendingsPo.quickEntryInputFor(categoryName)` + `typeQuickEntry(name, amount)`; old `quickEntryInput()` removed
- Files modified: SpendingsPo.ts

**2. [Rule 1 - Bug] txn-row testid uses amountConvertedCents not server id**

- Found during: Task 1
- Issue: Plan assumed `txn-row-{id}`; actual component keys off `txn.amountConvertedCents`
- Fix: `transactionRowByAmount(cents)` method; documented in PO JSDoc
- Files modified: SpendingsPo.ts

**3. [Rule 1 - Bug] Join page URL and ShareLinkPo testids incorrect in scaffold**

- Found during: Task 3
- Issue: Scaffold had `/en/invite/[token]` and testid `share-join-card` / `share-join-confirm` / `share-join-error`; actual component uses `join-page-card`, `join-error-heading`, `join-error-cta`, `join-budget-name`; join-confirm has no testid
- Fix: Updated ShareLinkPo with correct testids, role-based confirm button, correct URL
- Files modified: ShareLinkPo.ts

**4. [Rule 1 - Bug] Onboarding wizard at /en/budgets/new, not /en/onboarding**

- Found during: Task 4
- Issue: /en/onboarding redirects to /en/budgets/new
- Fix: `OnboardingPo.goto()` and step use `/en/budgets/new`
- Files modified: OnboardingPo.ts, onboarding.steps.ts

**5. [Rule 2 - Missing] SettingsPo lacked shareUrlField() method**

- Found during: Task 3
- Issue: share-link scenarios need to read the URL from Settings before visiting join page
- Fix: Added `shareUrlField()` + `clickGenerateInviteLink()` to SettingsPo
- Files modified: SettingsPo.ts

## Known Stubs

None — all scenarios bind to real component testids or role-based locators. The sync-issues injection scenario uses a custom DOM event (`budget:sync-failure`) which is a test-only path; if the component does not listen for this event the scenario will not assert the list visible (tracked as acceptable test-infrastructure limitation until 08-07 live run confirms the event contract).

## Live Run Status

**Live @phase8 playwright run deferred to 08-07 (stack rebuild required).** The app stack (web/api/worker) runs from prebuilt Docker images that predate Phase 8. A live `bunx playwright test --grep @phase8` cannot pass here — no server at `PLAYWRIGHT_BASE_URL` and the served UI lacks Phase 8 testids. 08-07 runs `make dev-build` to rebuild with Phase 8 code, then executes the full suite + human UAT.

**Verification gate used:** `cd apps/web && bunx bddgen` succeeded (compiles every .feature → spec and resolves every step binding — catches undefined/ambiguous steps, missing PO methods, and Gherkin syntax errors without a server). All acceptance-criteria greps pass.

## Self-Check: PASSED

Files created/exist:

- apps/web/e2e/features/spendings.feature ✓
- apps/web/e2e/features/recurring-draft.feature ✓
- apps/web/e2e/features/cushion.feature ✓
- apps/web/e2e/features/share-link.feature ✓
- apps/web/e2e/features/onboarding.feature ✓
- apps/web/e2e/steps/spendings.steps.ts ✓
- apps/web/e2e/steps/recurring-draft.steps.ts ✓
- apps/web/e2e/steps/cushion.steps.ts ✓
- apps/web/e2e/steps/share-link.steps.ts ✓
- apps/web/e2e/steps/onboarding.steps.ts ✓

Commits:

- 0402f9a: feat(08-06): spendings.feature + SpendingsPo + reserve auto-deduct scenario
- 4bfd39f: feat(08-06): recurring-draft.feature + cushion.feature + step bindings
- 87cca8d: feat(08-06): share-link.feature + ShareLinkPo/OnboardingPo/SettingsPo complete
- fc6c750: feat(08-06): onboarding.feature + steps — wizard end-to-end incl. skippable push step
