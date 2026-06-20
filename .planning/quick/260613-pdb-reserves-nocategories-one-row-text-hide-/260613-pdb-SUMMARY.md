---
quick_id: 260613-pdb
type: execute
mode: quick
status: awaiting-human-verify
date: 2026-06-13
subsystem: web/budgeting-bdp + web/settings-cushion + web/i18n
tags: [bdp, reserves, cushion, i18n, suspense, skeleton]
commits:
  - c51d36d: "fix(260613-pdb): shorten reserves noCategories copy + suppress empty cushion preview"
  - 93df19f: "fix(260613-pdb): non-suspending BDP layout to kill double skeleton"
key-files:
  created:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx
  modified:
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/src/components/settings/cushion-section.tsx
    - apps/web/test/components/settings/cushion-section.test.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
  deleted:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/loading.tsx
---

# Quick 260613-pdb: Reserves noCategories one-row + cushion empty-preview hide + BDP single-skeleton Summary

Three BDP/UI papercuts fixed: shortened reserves "No categories" copy (EN/PL/UK) to fit one row; cushion preview returns null when `required_cents===0` (kills "Have 0 of 0 — target met"); BDP layout made non-suspending (data moved into a `Suspense fallback={null}` server child + generic `loading.tsx` deleted) so home→tab nav shows ONLY the tab skeleton.

## What changed

### Issue 1 — Reserves noCategories one-row (i18n only)

- `bdp.tab.reserves.section.noCategories` shortened in all 3 locales:
  - EN: "No categories yet — add one in Spendings"
  - PL: "Brak kategorii — dodaj w Wydatkach"
  - UK: "Немає категорій — додайте у Витратах"
- Siblings (`includedEmpty`/`excludedEmpty`/etc.) untouched. `bun run check:i18n` (repo root) → `I18N_GATE_PASS` (3 locales in sync).

### Issue 2 — Cushion empty-preview guard (TDD)

- `cushion-section.tsx` `renderPreview()`: added `if (BigInt(cushionSummary.required_cents) === 0n) return null;` immediately after the `!cushionSummary` guard, before computing shortfall. Covers both "feature off" (zero DTO) and "on but no cushion category limits" (Σ × months = 0).
- RED→GREEN: added Vitest case `required_cents="0" → no preview line`; ran it RED (rendered `previewMet` with $0/$0), added guard, GREEN. Met (`required>0, shortfall<=0`) and shortfall (`>0`) cases untouched. 10/10 cushion tests pass.

### Issue 3 — BDP single skeleton (Option A, non-suspending layout)

- Created `budget-shell-data.tsx` — `async` server component holding the membership gate (`/budgets/active` → `redirect(/${locale})` on miss, SECURITY-CRITICAL), `reservesEnabled` read, `initialTasks` fetch, the sticky band + `BdpTabs`, and the `<Suspense fallback={null}>` `ActivePillTaskSlider` strip.
- Rewrote `layout.tsx` to NOT top-level-await any `serverApiFetch` (only `await params`); renders `<Suspense fallback={null}><BudgetShellData/></Suspense>` then `<div className="pb-shell-safe">{children}</div>`.
- Deleted `budgets/[id]/loading.tsx` (the generic skeleton; dead once the layout commits synchronously).
- Preserved: membership redirect, `reservesEnabled` cascading-hide → `BdpTabs`, `initialTasks` → badges + slider, `?task=` deep-link Suspense, `data-testid="bdp-sticky-wrapper"`, `data-bdp-tabs`, z-40 stack, `pb-shell-safe`.

## CAUTION confirm — loading.tsx boundary (deleted, not kept-minimal)

Route fallback reasoning: on home→`/budgets/[id]/wallets` nav, the `(app)` segment is already committed so `(app)/loading.tsx` does NOT re-fire for a child segment. The nearest Suspense boundary wrapping the newly-entered subtree was `budgets/[id]/loading.tsx`. With the layout now committing synchronously and that file deleted, the nearest fallback for the suspending page slot is the tab's own `loading.tsx` (wallets/reserves/spendings/settings) → single skeleton. Deleting (not keeping a minimal chrome-only loading.tsx) is correct: a kept boundary would reintroduce a fallback the synchronous layout no longer needs and could re-flash. CONFIRMED: built bundle has NO standalone `budgets/[id]/loading.js`; tab page bundles retain their skeletons.

## Verification (automated — all green)

- `bun run check:i18n` → I18N_GATE_PASS (3 locales).
- `bun run test -- cushion-section` → 10/10; `cushion-section reserves-table` → 28/28.
- `bun run typecheck` → clean.
- Structural guards: layout has no top-level `await serverApiFetch`; `redirect(` lives in `budget-shell-data.tsx`; `Suspense fallback={null}` in layout; `loading.tsx` deleted.
- Rebuilt web (`docker compose build web && make restart-web`), web healthy. SERVED bundle verified (`/app/apps/web/.next`):
  - new EN/PL/UK noCategories strings present (1 each); old strings absent (0).
  - cushion `shortfall_cents`/`required_cents` logic present; `bdp-sticky-wrapper` + `/budgets/active` gate compiled.
  - NO standalone `budgets/[id]/loading.js` entry.
- Live E2E (https://budget-dev.madonzy.com, geom-390 representative subset, 5/5 pass, 45.5s): redirect-to-wallets (gate), pill nav, deep-link to /spendings, banner-below-band geometry, bottom clearance. Timeboxed: full 78-test matrix (3 viewports × fresh-user-per-scenario) exceeds the budget; ran the layout-touching + geometry-critical subset on the phone viewport.

## Deviations from Plan

- Test file path: plan listed `apps/web/test/components/cushion-section.test.tsx`; the existing file is at `apps/web/test/components/settings/cushion-section.test.tsx`. Extended the existing file in place (reused its harness) rather than creating a duplicate. [Rule 3 - blocking: wrong path would have orphaned the test]
- i18n command: plan/notes referenced `bun run scripts/check-i18n-completeness.ts` / `bun run check:i18n` from `apps/web`; the script lives at repo ROOT (`scripts/check-i18n-completeness.ts`) and the root `check:i18n` npm script runs it. Ran `bun run check:i18n` from repo root. [Rule 3]
- E2E scope timeboxed to a representative subset on one viewport (see Verification) rather than the full 78-test matrix, to respect the timebox. The subset covers every code path this diff touches (gate/redirect, band, deep-link, shell geometry, clearance).

## Manual checks remaining (human-verify checkpoint — on device, https://budget-dev.madonzy.com)

- A. Reserves tab, INCLUDED empty slot on ~360px → one row in EN/PL/UK.
- B. Settings → Cushion OFF / no cushion categories → preview shows NOTHING; configure a requirement → preview reappears (met/short).
- C. Home → tap a budget → ONLY one skeleton (the tab's), no chrome-then-tab double flash (try wallets + reserves).
- D. Non-member note: deep-link to a budget you are NOT a member of → still redirected home, band/other-tenant data NOT shown. (No dedicated non-member E2E exists — fresh-user fixture has no second-user/addMember helper; gate is guarded structurally: redirect lives in `budget-shell-data.tsx` and throws before any UI commits, and the live redirect-to-wallets scenario exercises the same gate code path.)

## Self-Check: PASSED

- budget-shell-data.tsx: FOUND
- layout.tsx (Suspense, no top-level fetch): FOUND
- loading.tsx: DELETED (intentional)
- cushion-section.tsx guard + test: FOUND
- en/pl/uk noCategories shortened: FOUND
- commit c51d36d: FOUND
- commit 93df19f: FOUND
