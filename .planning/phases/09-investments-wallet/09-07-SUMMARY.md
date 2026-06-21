---
phase: 09-investments-wallet
plan: 07
subsystem: web/investments
tags: [frontend, react-query, dnd, i18n, feature-flag]
requires: [09-06]
provides: [investments-web-surface]
affects: [wallets-tab, settings, onboarding]
tech-stack:
  patterns:
    - "React-Query optimistic hooks on [budget, id, investments] via clientApiWrite"
    - "@dnd-kit DndContext + SortableContext (drag handle only) with group droppables"
    - "next-intl budget.investments.* namespace (EN/PL/UK)"
key-files:
  created:
    - apps/web/src/hooks/use-investments.ts
    - apps/web/src/hooks/use-create-holding.ts
    - apps/web/src/hooks/use-update-holding.ts
    - apps/web/src/hooks/use-archive-holding.ts
    - apps/web/src/hooks/use-reorder-holdings.ts
    - apps/web/src/components/budgeting/wallets-tab/investments-section.tsx
    - apps/web/src/components/budgeting/wallets-tab/investment-row.tsx
    - apps/web/src/components/budgeting/wallets-tab/investment-row-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/investment-group-header.tsx
    - apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx
    - apps/web/src/components/budgeting/wallets-tab/holding-delete-confirm.tsx
    - apps/web/src/components/budgeting/wallets-tab/instrument-search-input.tsx
    - apps/web/src/components/budgeting/wallets-tab/asset-class-chip.tsx
    - apps/web/src/components/budgeting/wallets-tab/type-dropdown.tsx
    - apps/web/src/components/budgeting/wallets-tab/group-combobox.tsx
    - apps/web/src/components/budgeting/wallets-tab/price-blocked-banner.tsx
    - apps/web/src/components/settings/investments-section.tsx
    - apps/web/test/investments/investment-row.test.tsx
    - apps/web/test/investments/holding-sheet.test.tsx
    - apps/web/test/investments/group-combobox.test.tsx
  modified:
    - apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
    - apps/web/src/components/settings/settings-accordion.tsx
    - apps/web/src/components/settings/settings-tab-client.tsx
    - apps/web/src/components/onboarding/steps/step-features.tsx
    - apps/web/src/components/onboarding/wizard-page.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/worker/src/worker.ts
    - apps/web/e2e/features/investments-wallet.feature
    - apps/web/e2e/steps/investments.steps.ts
key-decisions:
  - "Swipe Edit+Delete lives in the dedicated investment-row-sheet.tsx (per UI-SPEC component decomposition), NOT by parameterizing wallet-row.tsx — avoids regressing the shipped wallet swipe/inline-edit."
  - "Investments client calls are budget-scoped (/budgets/:id/investments…), matching the API mount (app.ts:108) — NOT wallets-style root. UAT found the original /investments paths 404'd; the optimistic insert masked it."
  - "Drag-into-group e2e scenario stays @skip-phase-09-debt: @dnd-kit uses pointer sensors (not HTML5 DnD) and a group header cannot exist before a holding has that group — covered by the human-verify checkpoint."
  - "Crypto display names carry the ticker ('Bitcoin (BTC)') so the trigram search matches by ticker; CoinGecko ids are slugs."
requirements-completed:
  [INV-01, INV-02, INV-05, INV-06, INV-09, INV-10, INV-11, INV-16]
duration: ~2h
completed: 2026-06-21
---

# Phase 09 Plan 07: Investments Web Surface Summary

Built the full Investments section on the Wallets tab: 5 React-Query hooks
(`use-investments` + 4 optimistic mutation hooks keyed on
`["budget", id, "investments"]` through `clientApiWrite`), the
`InvestmentsSection` client island (DndContext + collapsible localStorage-backed
groups + flat ungrouped tail + dashed add), the read-only `InvestmentRow` (P/L
text-only green/red, cash "—", delisted dimming, mobile tap-expand) wrapped by
`InvestmentRowSheet` (drag handle + swipe Edit/Delete), the `HoldingSheet` add/edit
form (tracked/custom/cash variants with debounced local instrument search, type
dropdown, group combobox, price-blocked banner, dirty discard-confirm), the
`investments_enabled` toggles in Settings + the onboarding features step, and the
EN/PL/UK `budget.investments.*` copy. Section renders LAST only when the flag is on.

## Tasks

4 tasks (3 auto + 1 human-verify checkpoint). 23 files created/modified.

## Deviations from Plan

**[Rule 2 — Missing critical] Budget-scoped API path.** Found during UAT: the
plan/PATTERNS assumed wallets-style root paths (`/investments`), but the API
mounts the route budget-scoped at `/budgets/:budgetId/investments`. All hooks +
search + price fetch repointed. The optimistic insert had masked the 404 in the
first e2e pass.

**[Rule 1 — Bug] Four UAT defects.** Settings toggle now invalidates the
budget-detail query (no reload); instrument search closes on blur (no Type
overlay); crypto searchable by ticker + instruments universe seeded; ICU
single-quote placeholders switched to double quotes.

**[Decision] Swipe in investment-row-sheet.tsx**, not by parameterizing
wallet-row.tsx (UI-SPEC decomposition; avoids wallet regression).

## Verification

- Vitest: 11/11 (investment-row, holding-sheet, group-combobox)
- typecheck: 0 · eslint --max-warnings=0: clean · check:i18n: PASS
- E2E `@investments-wallet`: 6 passed (chromium + mobile), incl. reload-persistence guard
- Live browser (Playwright MCP): flag toggle reactivity (both directions, no reload),
  search "BTC" → Bitcoin (BTC), custom→Type select, group `Create "Test"`, create
  persists after reload with +20.0% P/L grouped under "Test · 100% of portfolio",
  onboarding investments toggle end-to-end

## Issues Encountered

Live tracked-instrument price fetch on add depends on provider API keys
(TwelveData/CoinGecko/metals.dev) — not exercised in dev; custom/manual path works,
tracked price degrades to the price-blocked banner. The instruments universe is
seeded into dev DB directly because the daily-seed pg-boss job is cron-scheduled
and had not yet run; the worker `DEFAULT_INVESTMENT_UNIVERSE` keeps future seeds
consistent.

## Human Verification (deferred to UAT)

See `09-HUMAN-UAT.md` — visual/interaction polish (DnD reorder/group-reassign feel,
mobile three-gesture coexistence, delisted/price-blocked chrome, tabular-num
rendering, single-yellow scarcity) deferred to UAT-phase testing per owner.

## Self-Check: PASSED

- key-files.created exist on disk
- commits present: feat/test/fix(09-07) — f2f6758, bcdf7ed, d5a5c0e, 96d1abd, 5c83ddf, b723cf1
- acceptance criteria + plan verification re-run green

Phase 09 complete — ready for next step.
