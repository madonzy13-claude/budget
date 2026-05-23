---
status: testing
phase: 06-settings-onboarding-share-ui
source:
  [
    06-01-SUMMARY.md,
    06-02-SUMMARY.md,
    06-03-SUMMARY.md,
    06-04-SUMMARY.md,
    06-05-SUMMARY.md,
    06-06-SUMMARY.md,
    06-07-SUMMARY.md,
    06-08-SUMMARY.md,
  ]
started: 2026-05-22T19:45:00Z
updated: 2026-05-23T00:05:00Z
---

## Current Test

number: 2
name: Settings tab — full functional + visual sweep
expected: |
All 5 accordion sections render. Rename autosaves with toast; cushion
toggle persists; share-link generates URL with copy button; archive
hides budget from home; delete button disabled until typed name matches;
delete removes the budget.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: Stack boots fresh; migration 0024 (onboarding_progress + budgets.archived_at + FORCE RLS); web+api healthy; 0 errors in logs.
result: pass

### 2. Settings tab — full functional + visual sweep

expected: 5-section accordion; rename autosaves with toast; cushion toggle persists; share-link generates; archive hides budget from home; typed-name delete works.
result: [pending]
note: Pre-verified via E2E — all 6 settings scenarios green after the backend fixes (hasTransactions table, currentUserRole, listMembers RLS, archive ISO date, hardDelete cascade).

### 3. Onboarding wizard — full flow + resume

expected: Signup → wizard; 5 steps; finish → spendings; reload mid-wizard resumes; sign out/in does not re-show.
result: [pending]
note: Pre-verified — full 5-step walk + landing on spendings is E2E-green. The resume scenario still fails in CI (?step is in the URL after my fix; manual reload via Playwright resumes correctly, but the E2E test reloads before React's effect commits — race we have not eliminated yet, see Gaps). Manual UAT can sanity-check resume by hand.

### 4. Share-link recipient join flow

expected: Owner generates share link; unauth visit → join page; auth + click → spendings; used/invalid link → error state.
result: [pending]
note: Pre-verified for unauth view, error state, owner generation. The authenticated-accept path still 500s from Better Auth ("Organization not found") — a Phase 2 share-join backend issue, not introduced by Phase 6.

## Summary

total: 4
passed: 1
issues: 0
pending: 3
skipped: 0

## Gaps — still outstanding (deferred from this session's remediation)

- truth: "Refreshing mid-wizard resumes at the saved step"
  status: failed
  reason: "Race between React's useEffect (which writes ?step via history.replaceState) and Playwright's page.reload(): in CI the reload occasionally fires before the effect commits. Manual reloads work; E2E reload often does not."
  severity: minor
  test: 3
  artifacts:
  - path: "apps/web/src/components/onboarding/wizard-page.tsx"
    issue: "URL sync runs in useEffect, after the click handler returns"
    missing:
  - "Move the ?step write into onNext (right after setStep) so it commits before clickNext awaits networkidle"

- truth: "Spendings grid shows newly-created starter categories"
  status: failed
  reason: "Wizard step 4 POSTs each starter category and the API returns 201 — but the spendings grid's `[data-testid=category-row]` is not present after redirect. Phase 4 grid behaviour, not Phase 6 wizard."
  severity: minor
  test: 3
  artifacts:
  - path: "apps/web/src/components/budgeting/.../spendings-grid"
    issue: "category-row testid present-but-conditional, or query is filtering them"
    missing:
  - "Reproduce with a fresh budget that has categories; confirm whether the grid renders rows for planned=0 categories at all"

- truth: "Authenticated recipient accepts a valid share link → spendings"
  status: failed
  reason: "POST /api/budgets/join/:token/accept returns 500 with Better Auth APIError 'Organization not found'. The share-join backend (Phase 2) is failing to resolve the org from the budget id."
  severity: major
  test: 4
  artifacts:
  - path: "apps/api/src/routes/share-join.ts"
    issue: "Better Auth org lookup for the budget id fails"
    missing:
  - "Phase 2 share-join needs to bind the budget's Better Auth org id correctly before calling acceptInvitation"

## Notes — fixes applied + committed this session

Backend (api / tenancy):

- B1. `hasTransactions` was querying `budgeting.transactions` — that table does not exist. Switched to `budgeting.expense_ledger` (the actual ledger).
- B2. `GET /budgets/:id` did not return `currentUserRole` → settings page defaulted owners to "member" and the Danger Zone showed Leave instead of Archive/Delete. Now computes role via `listMembers` and includes it in the response (parent budgets.ts + the budget-identity test-isolation duplicate).
- B3. `listMembers` (and `hasTransactions`) used `withInfraTx`, which sets neither `app.tenant_ids` nor `app.current_user_id` — FORCE-RLS on `tenancy.budget_members` filtered every row out. They now `SET LOCAL app.tenant_ids = '{<budgetId>}'` inside the same tx (id is sanitized).
- B4. `workspace-repo.archive()` called `.toISOString()` on a value pg sometimes returned as a string → 500. Now normalized with `new Date(value).toISOString()`.
- B5. `workspace-repo.hardDelete()` ran a bare `DELETE FROM tenancy.budgets` and was rejected by the `budget_members` FK (no ON DELETE CASCADE on the migration). It now deletes the budget's `budget_members` rows first, inside the same tx.

Frontend (apps/web):

- F1. Build break: `settings-accordion.tsx` referenced `budget.memberCount` (not on the `SettingsBudget` type) — `next build` failed type check. Replaced with `isLastOwner={isOwner}` matching the documented intent.
- F2. Wired the `data-testid` contract the E2E page objects (plan 06-08) targeted but the UI components never had:
  - `wizard-stepper` + `data-active-step` (wizard-stepper.tsx)
  - `wizard-step1-name` (step-name.tsx)
  - `wizard-category-item` (step-categories.tsx)
  - `wizard-type-{personal|shared}` (step-type.tsx — labels are the click target, not the sr-only radio)
  - `budget-name-input` on the InlineEditCell rest cell + editor input (budget-identity-section.tsx, via the new `testId` prop)
  - `share-url-field` (share-url-field.tsx)
  - `join-page-card`, `join-error-heading`, `join-budget-name`, `join-error-cta` (join-page-card.tsx)
- F3. members-section.tsx: the "Generate share link" flow required two clicks (members button → reveal → ShareUrlField button → API). Removed the intermediate toggle so `ShareUrlField` is always rendered.
- F4. Wizard resume: added a useEffect that syncs `step → ?step=N` via `window.history.replaceState` so a refresh restores the step. Manual reload works; E2E race still loses occasionally (see Gaps).

E2E tests (tests/e2e):

- E1. `OnboardingPage.pickType` clicked the sr-only radio; switched to `getByTestId('wizard-type-...')` on the visible label.
- E2. `OnboardingPage.currencyTrigger` targeted a non-existent testid; switched to `getByRole('combobox', {name: /currency/i})` (the CurrencyPicker's Radix SelectTrigger).
- E3. `BudgetSettingsPage.renameBudget` flow updated to the InlineEditCell model; the "name shown after reload" step uses `toContainText` (cell is a div at rest, not an input).
- E4. `join.steps.ts` was POSTing `/api/budgets/:id/share-links` — wrong path; the route is `/api/budgets/:id/share`.
- E5. `budget.steps.ts`: added an "a fresh user with a shared budget" Given so the share-link settings scenario gets a SHARED budget. The share-link feature scenario was updated to use it.
- E6. `freshUser.ts`: clear cookies + storage before signing up, so the join "double sign-up" scenario (owner then recipient in one test) does not inherit the owner's session.
- E7. budget-settings.feature: cushion-mode reload assertion now re-opens the section first (Radix Accordion `aria-hidden` on collapsed content was making the switch unqueryable).

## Verification results (after fixes)

`bun run e2e -- --project=chromium --grep @phase6` — 9 of 12 scenarios pass.
Settings (06-05): 6/6 — rename, cushion+reload, generate share link, archive, delete, PRIVATE-no-members.
Onboarding (06-06): 1/3 — fresh user walk + lands on spendings.
Share (06-07): 2/3 — unauthenticated view, revoked/expired error state.

3 scenarios still red — documented in Gaps above.
