---
phase: 07
plan: 09
subsystem: cushion-ui
one_liner: "Settings cushion months input + live shortfall preview, onboarding wizard inline months field, CategorySlider silent cushion-mirror via linked useState"
tags: [cushion, settings, onboarding, category-slider, frontend, i18n, tdd]
requirements: [TASK-04]
status: complete
wave: 3
depends_on: [07-07, 07-08]
dependency_graph:
  requires:
    - "07-07 PATCH /budgets/:id schema field cushion_target_months (runtime)"
    - "07-07 GET /budgets/:id/cushion-summary endpoint (runtime)"
  provides:
    - "CushionSection months input + live cushion-summary preview"
    - "Onboarding StepFeatures inline cushion_target_months input"
    - "WizardPage commitWizard PATCH payload includes cushion_target_months"
    - "CategorySlider silent cushion-mirror via linked useState (no chain icon)"
  affects:
    - "apps/web/src/components/settings/settings-accordion.tsx (extended SettingsBudget shape)"
tech_stack:
  added: []
  patterns:
    - "@tanstack/react-query useQuery + useQueryClient invalidate-on-write"
    - "react-hook-form silent imperative form.setValue mirror"
    - "Intl.NumberFormat budget-currency formatting"
key_files:
  created:
    - "apps/web/test/components/settings/cushion-section.test.tsx"
  modified:
    - "apps/web/src/components/settings/cushion-section.tsx"
    - "apps/web/src/components/settings/settings-accordion.tsx"
    - "apps/web/src/components/onboarding/steps/step-features.tsx"
    - "apps/web/src/components/onboarding/wizard-page.tsx"
    - "apps/web/src/components/budgeting/category-slider.tsx"
    - "apps/web/test/components/budgeting/category-slider.test.tsx"
    - "apps/web/test/onboarding/wizard-page.test.tsx"
    - "apps/web/messages/en.json"
    - "apps/web/messages/pl.json"
    - "apps/web/messages/uk.json"
decisions:
  - "Use react-query useQuery for cushion-summary fetch (skipped when master off via `enabled` flag); invalidate on PATCH success to refresh the preview without page reload."
  - "Silent break model (D-PH7-36): typing cushion calls setLinked(false) with no visible chain/relink affordance. Discoverability tradeoff is intentional per CONTEXT.md."
  - "Onboarding always sends cushion_target_months in PATCH when cushion enabled (even at default 6) so server has truthy data; PATCH route is idempotent on equal values."
  - "Preview formatCurrency falls back to a plain two-decimal string + currency code if Intl.NumberFormat throws on unrecognized currency."
metrics:
  duration: "~12 min"
  tasks: 3
  files_created: 1
  files_modified: 10
  tests_added: 17 # 9 cushion-section + 6 category-slider mirror + 2 wizard
  completed: 2026-05-31
---

# Phase 07 Plan 09: Cushion UI (Settings, Onboarding, CategorySlider) Summary

Second frontend plan in Phase 07. Adds the cushion_target_months numeric
input (1..60) to Settings → Cushion (between master toggle and per-month
display-mode toggle) with a live cushion-summary preview, surfaces the
same input inline in the onboarding wizard cushion step (no new wizard
step), and makes CategorySlider silently mirror cushion = planned by
default with no chain-icon affordance.

The PATCH route extension for `cushion_target_months` and the
`GET /budgets/:id/cushion-summary` endpoint ship in plan 07-07; this plan
calls them from the UI. Vitest cases mock the api-client and react-query
so the FE work is independently verifiable ahead of the API plan landing
on the same branch.

## What Was Built

### Task 1 — CushionSection months input + live preview

**Commits:** `c40ac20` (RED) + `cd86cc5` (GREEN)

- Added `cushionTargetMonths?: number` (default 6) and `budgetCurrency?: string`
  props to `CushionSection`.
- New numeric `Input` `id="cushion-target-months"` (HTML5 min=1 max=60,
  client-side validation) rendered between the master toggle and the
  per-month display-mode toggle. Hidden entirely when master toggle off,
  same hiding policy as the mode sub-toggle.
- `handleTargetMonthsBlur` validates 1..60 integer, sets inline error
  - `aria-invalid="true"` on the input on failure (PATCH suppressed), and
    on success fires `api.budgets[":id"].$patch({ json: { cushion_target_months } })`
    in a single round-trip + `queryClient.invalidateQueries({ queryKey: ["cushion-summary", budgetId] })`.
- New `useQuery(["cushion-summary", budgetId])` (enabled-gated by master
  toggle) reads `GET /budgets/:id/cushion-summary` via `clientApiFetch`.
- Preview line rendered below the input with three states:
  - **loading:** shimmer (`animate-pulse` placeholder).
  - **success:** `Intl.NumberFormat` formatted amounts via
    `t("cushion.preview", {actual, required, shortfall})` when
    `shortfall_cents > 0` with `text-[var(--trading-down)]`; otherwise
    `t("cushion.previewMet", {actual, required})` with
    `text-[var(--trading-up)]`.
  - **error:** muted `previewError` fallback.
- `SettingsBudget` extended with `cushionTargetMonths?: number`;
  `settings-accordion.tsx` propagates it + `budgetCurrency`.
- i18n added in en/pl/uk: `settings.cushion.targetMonthsLabel`,
  `targetMonthsError`, `saved`, `preview`, `previewMet`, `previewError`.

### Task 2 — Onboarding StepFeatures + WizardPage cushion_target_months

**Commits:** `24871b6` (RED) + `e431871` (GREEN)

- `StepFeatures` extended with `cushionTargetMonths: number` +
  `onChangeCushionTargetMonths: (v) => void`. Inline `Input`
  `id="onboarding-cushion-target-months"` (min=1 max=60) rendered below the
  cushion FeatureRow only when `cushionEnabled === true`. No new wizard
  step. Inline trading-down error label when value outside 1..60.
- `WizardForm` extended with `cushionTargetMonths: number` defaulting to 6.
- `commitWizard` PATCH payload now includes `cushion_target_months` when
  cushion is enabled (always sent, idempotent server-side).
- StepFeatures receives both new props from WizardPage; default 6 flows
  through end-to-end and is observable in the PATCH JSON.
- i18n added in en/pl/uk:
  `onboarding.wizard.features.targetMonthsLabel` + `targetMonthsError`.

### Task 3 — CategorySlider silent cushion-mirror

**Commits:** `9e3b56f` (RED) + `c670010` (GREEN)

- Added `const [linked, setLinked] = useState<boolean>(...)` initialized
  from initial values:
  `c == null || c === "" || String(c) === String(p)`.
- Planned AmountInput onChange wrapper: `field.onChange(v)` + if linked,
  `form.setValue("cushionCents", v, { shouldValidate: true })`. Both
  state updates land in the same React batch — react-hook-form's
  imperative `setValue` is fully compatible with the existing useForm.
- Cushion AmountInput onChange wrapper: `field.onChange(v)` +
  `setLinked(false)`. Silent break per D-PH7-36 — **no chain icon, no
  unlink/relink button, no visible state indicator**. `grep -E
"Link2|Unlink|Chain|LinkOff"` over the file returns nothing.
- `useEffect` on slider reopen re-evaluates linked from the fresh
  initial values, so reopening with equal planned/cushion restores the
  mirror behavior automatically (test case covers this).
- No new i18n keys (the behavior is invisible).

## Verification

```bash
cd apps/web && bunx vitest run cushion-section category-slider wizard-page
# Test Files  3 passed (3)
# Tests       41 passed (41)

cd apps/web && bunx tsc --noEmit
# (clean, no output)
```

Per parallel executor mode, web container rebuild + Playwright E2E are
deferred to plan 07-10 (E2E coverage of the live UI).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Plan path correction] Import path `@/lib/client-api-fetch` does not exist**

- **Found during:** Task 1 — implementing the cushion-summary useQuery.
- **Issue:** Plan-action snippet imports `clientApiFetch` from
  `@/lib/client-api-fetch`; the actual export lives in `@/lib/budget-fetch`
  (Phase 4 helper used everywhere else, including category-slider.tsx).
- **Fix:** Imported `clientApiFetch` from `@/lib/budget-fetch` in
  `cushion-section.tsx`; the test mocks the same module path.
- **Files modified:** `apps/web/src/components/settings/cushion-section.tsx`,
  `apps/web/test/components/settings/cushion-section.test.tsx`.
- **Commit:** `cd86cc5`.

**2. [Rule 1 — Test mock alignment] next-intl mock returns bare key without namespace prefix**

- **Found during:** Task 1 GREEN run.
- **Issue:** Initial test regex expected `settings.cushion.preview` but
  the `vi.mock("next-intl")` translator returns just the key passed to
  `useTranslations(namespace)` callbacks, which is `cushion.preview`.
- **Fix:** Updated three test regex to drop the `settings.` prefix —
  `cushion.preview`, `cushion.previewMet`, `cushion.previewError`. Matches
  the existing settings-accordion test pattern.
- **Files modified:** `apps/web/test/components/settings/cushion-section.test.tsx`.
- **Commit:** rolled into `cd86cc5` (same GREEN cycle).

### Auth Gates

None — all writes mocked at the api-client boundary in Vitest.

### Threat Surface Scan

No new network endpoints or trust boundary surface. PATCH `cushion_target_months`
flows through the existing `api.budgets[":id"].$patch` (Zod-validated
server-side in 07-07); the cushion-summary GET is RLS-scoped (Plan 07).
Client-side validation (1..60 int) is UX scaffolding; server enforcement
remains the security boundary (T-07-09-01 in the plan's STRIDE register).

## Known Stubs

None.

## Files Created

- `apps/web/test/components/settings/cushion-section.test.tsx` (9 cases).

## Files Modified

- `apps/web/src/components/settings/cushion-section.tsx` (months input
  - live preview + new query).
- `apps/web/src/components/settings/settings-accordion.tsx` (extended
  SettingsBudget + prop wiring).
- `apps/web/src/components/onboarding/steps/step-features.tsx`
  (cushionTargetMonths inline input).
- `apps/web/src/components/onboarding/wizard-page.tsx` (WizardForm +
  PATCH payload extension).
- `apps/web/src/components/budgeting/category-slider.tsx` (silent
  linked state + onChange interceptors).
- `apps/web/test/components/budgeting/category-slider.test.tsx`
  (6 mirror behavior cases).
- `apps/web/test/onboarding/wizard-page.test.tsx` (2 cushion months cases).
- `apps/web/messages/en.json` + `pl.json` + `uk.json` (settings cushion
  - onboarding features keys).

## Commits

| Hash      | Type | Description                                                            |
| --------- | ---- | ---------------------------------------------------------------------- |
| `c40ac20` | test | RED — cushion months input + preview tests                             |
| `cd86cc5` | feat | GREEN — CushionSection months input + cushion-summary preview          |
| `24871b6` | test | RED — onboarding cushion_target_months input + commit tests            |
| `e431871` | feat | GREEN — StepFeatures months input + WizardPage PATCH payload extension |
| `9e3b56f` | test | RED — CategorySlider silent mirror tests                               |
| `c670010` | feat | GREEN — CategorySlider linked useState + onChange interceptors         |

## Self-Check: PASSED

- `apps/web/src/components/settings/cushion-section.tsx` exists with
  `cushion_target_months` + `cushion-summary` + `targetMonthsLabel` +
  `previewError` keys.
- `apps/web/src/components/onboarding/steps/step-features.tsx` contains
  `cushionTargetMonths` + `targetMonthsLabel`.
- `apps/web/src/components/onboarding/wizard-page.tsx` contains
  `cushionTargetMonths: 6` default + `cushion_target_months` in PATCH.
- `apps/web/src/components/budgeting/category-slider.tsx` contains
  `const [linked, setLinked]` + `form.setValue("cushionCents"` +
  `setLinked(false)` and zero `Link2|Unlink|Chain|LinkOff` matches.
- `apps/web/test/components/settings/cushion-section.test.tsx` exists
  with 9 cases.
- All 6 commits in `git log`: `c40ac20`, `cd86cc5`, `24871b6`, `e431871`,
  `9e3b56f`, `c670010`.
- Vitest run for cushion-section + category-slider + wizard-page:
  41 passed (3 files).
- `bunx tsc --noEmit` clean.
