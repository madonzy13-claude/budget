---
phase: 05-reserves-wallets-tabs
plan: 05-19
subsystem: ui / i18n
tags:
  [
    reserves-tab,
    ui-only,
    i18n,
    available-column,
    totals-footer,
    surplus-banner-removed,
    TDD,
    e2e,
    tasks-redesign,
  ]

# Dependency graph
requires:
  - phase: 05-reserves-wallets-tabs
    plan: 05-15 # engine-model reshape (reserve/used/overspent rows; internal/userDefined/surplus totals)
provides:
  - Reserves tab UI: single "Available" value per category (no Used column)
  - Reserves totals footer: 3 stacked totals (TOTAL AVAILABLE / TOTAL IN WALLETS / TOTAL USED (THIS MONTH))
  - Surplus banner removed from the footer (RESERVE_TOPUP task card retained)
affects:
  - apps/web reserves-tab components
  - apps/web i18n (bdp.tab.reserves) EN/PL/UK
  - reserves E2E (@tasks-redesign) + ReservesPo

# Tech / patterns
tech-stack:
  added: []
  patterns:
    - Footer stays a dumb presentational primitive; the client island computes the Σ usedCents and passes it in (UI-only aggregate, no new DTO field).
    - BigInt reduce over serialized-cents strings for the TOTAL USED sum (active rows only).

key-files:
  created:
    - .planning/phases/05-reserves-wallets-tabs/artifacts/05-19-reserves-tab.png
  modified:
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
    - apps/web/src/components/budgeting/reserves-tab/reserves-totals-footer.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - apps/web/test/components/reserves-table-row.test.tsx
    - apps/web/test/components/reserves-totals-footer.test.tsx
    - apps/web/test/components/reserves-table-client-excluded.test.tsx
    - apps/web/e2e/features/reserves.feature
    - apps/web/e2e/page-objects/ReservesPo.ts
    - apps/web/e2e/steps/reserves.steps.ts
    - tests/e2e/features/wallets/cross-tab-invalidation.feature
    - .planning/phases/05-reserves-wallets-tabs/deferred-items.md
  deleted:
    - apps/web/src/components/budgeting/reserves-tab/surplus-banner.tsx
    - apps/web/test/components/surplus-banner.test.tsx

decisions:
  - Footer receives a pre-summed usedCents (computed in the client island) rather than the rows, keeping the footer a pure presentational primitive.
  - "(THIS MONTH)" is the product label for the running usedCents sum; the engine value may span months (data caveat below) — labeling, not a data change.

metrics:
  duration: ~25m
  completed: 2026-06-06
---

# Phase 05 Plan 19: Reserves Tab UI Relabel — Available Column, 3 Totals, No Surplus Banner Summary

UI-only reshape of the Reserves tab: the per-category column becomes "Available", the per-row "Used" column is removed, the redundant surplus banner is deleted from the totals footer, and the footer now stacks three totals (TOTAL AVAILABLE / TOTAL IN WALLETS / TOTAL USED (THIS MONTH)) — all driven by data already present in `ReservesSummaryDto`, with zero engine/API/DTO/use-case changes.

## What shipped (the 6 changes)

1. **Rename column header "Reserve" → "Available"** — i18n `bdp.tab.reserves.column.reserve` replaced by `column.available` (EN/PL/UK); header rendered in `reserves-table-client.tsx`.
2. **Remove the per-category "Used" column** — dropped the header in `reserves-table-client.tsx` and the per-row `reserves-used-<id>` cell in `reserves-table-row.tsx`. Active rows are now grip + name + editable Available value (kept `reserves-balance-<id>`, `reserves-row-<id>`, `data-category-id`; dropped `reserves-used-<id>` + `row.usedAria`).
3. **Remove the surplus banner** from `reserves-totals-footer.tsx`; deleted `surplus-banner.tsx` + `surplus-banner.test.tsx` and the dead `surplus.{topup,withdraw,reconciled}` i18n strings. The RESERVE_TOPUP **task card** ("1 task pending") is untouched.
4. **Rename totals label "Σ reserves" → "Total available"** (`totals.internalLabel`).
5. **Rename totals label "Σ reserve wallets" → "Total in wallets"** (`totals.walletsLabel`).
6. **Add totals line "Total used (this month)"** (`totals.usedLabel`) = Σ of the **active** rows' `usedCents`, summed in `reserves-table-client.tsx` (BigInt reduce) and passed to the footer as a new `usedCents` prop. The footer's `direction`/`surplusCents` props were dropped.

Footer now: 3 stacked totals, no banner. Verified visually (screenshot artifact): TOTAL AVAILABLE 420 USD, TOTAL IN WALLETS 250 USD, TOTAL USED (THIS MONTH) 0 USD, with the "1 task pending" card above.

## Data caveat (recorded, behavior unchanged)

`usedCents` is the engine's **running** used reserve (cumulative; can span months). The new "Total used (this month)" line sums those values — the "(THIS MONTH)" wording is the user's chosen label, not an open-month restriction. If a strictly open-month figure is later wanted, that is a separate engine/DTO change — **not** implemented here.

## TDD flow

- **RED** (`956f5d5`): reshaped the three reserves component tests to the new contract (no used cell, 3 totals, no banner) and deleted `surplus-banner.test.tsx`. Confirmed failing — row test found the still-present used cell; footer/client tests failed to resolve the deleted `surplus-banner` import.
- **GREEN** (`639ff76`): implemented the 3 component changes + i18n across EN/PL/UK. Reserves component Vitest **26/26 pass**; web `tsc --noEmit` clean (zero reserves-related type errors — the footer prop change is consistent end-to-end).
- **E2E** (`c70c120`): rewrote `reserves.feature` + `ReservesPo` + `reserves.steps` to the new shape; fixed one test-side regex bug (Rule 1) escaping metacharacters in the footer-label matcher so "Total used (this month)" matches literal parens. **12/12** reserves `@tasks-redesign` pass (chromium + mobile).

## Test results

- **Component (Vitest, reserves):** 26/26 pass — `reserves-table-row.test.tsx`, `reserves-totals-footer.test.tsx`, `reserves-table-client-excluded.test.tsx` (incl. a TOTAL USED sum test asserting excluded rows are NOT counted).
- **E2E (`@tasks-redesign`, reserves):** 12/12 pass across chromium + mobile (Available header present; no Used/Share columns; 3 totals visible; no surplus banner; adjust → Available cell shows the value; disabled notice).
- **Cross-tab (`@phase5`):** the wallets→reserves totals-update scenario passes against the new 3-totals footer (label relabeled in the Gherkin; the step matches the value, not the label).
- **i18n:** all three locale JSONs validated well-formed with identical reserves key shape; served web bundle confirmed to contain the new labels and to NOT contain the old `Σ reserves` / "Withdraw … from reserve wallet" strings.

## i18n keys touched (EN / PL / UK)

- Added: `bdp.tab.reserves.column.available` (Available / Dostępne / Доступно).
- Added: `bdp.tab.reserves.totals.usedLabel` (Total used (this month) / Razem wykorzystane (w tym miesiącu) / Усього використано (цього місяця)).
- Relabeled: `totals.internalLabel` → Total available / Razem dostępne / Усього доступно.
- Relabeled: `totals.walletsLabel` → Total in wallets / Razem w portfelach / Усього в гаманцях.
- Relabeled: `row.reserveAria` → "Available for {name}" / "Dostępne dla {name}" / "Доступно для {name}".
- Removed: `column.reserve`, `column.used`, `row.usedAria`, `surplus.{topup,withdraw,reconciled}` (in all 3 locales).

## Build / verify

- `docker compose build web` → image rebuilt; `make restart-web` → `budget-web-1` healthy (web is bundled at build time, so the i18n + component changes required a rebuild). Served bundle (`/app/apps/web/.next/server/chunks/368.js`) confirmed to carry the new labels and to have dropped the old surplus strings.
- Final-tab screenshot: `.planning/phases/05-reserves-wallets-tabs/artifacts/05-19-reserves-tab.png` (captured via a temporary spec that was deleted after capture).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] E2E footer-label step regex did not escape metacharacters**

- **Found during:** E2E rewrite verification (chromium + mobile both failed the "Total used (this month)" assertion).
- **Issue:** `new RegExp(label, "i")` read `(this month)` as a capture group, so the pattern required `Total used this month` (no parens) instead of the literal `Total used (this month)` rendered in the DOM. The implementation was correct — the footer rendered all three labels — but the test matcher was wrong.
- **Fix:** escape regex metacharacters in the step label before building the RegExp (`label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`).
- **Files modified:** apps/web/e2e/steps/reserves.steps.ts
- **Commit:** c70c120

**2. [Rule 1 - Doc] Stale Gherkin label in the cross-tab `@phase5` scenario**

- **Found during:** cross-context grep after the reserves E2E run.
- **Issue:** `tests/e2e/features/wallets/cross-tab-invalidation.feature` asserted `the "Σ reserve wallets" total shows "…"`, referencing a label removed in this plan. The step ignores the label (matches the formatted value in the footer), so it still passed — but the Gherkin text was misleading.
- **Fix:** relabeled to `the "Total in wallets" total shows "…"`; value assertions unchanged.
- **Files modified:** tests/e2e/features/wallets/cross-tab-invalidation.feature
- **Commit:** c70c120

## Deferred Issues (out of scope — pre-existing)

- `tests/e2e/features/reserves/share-math-and-zero-state.feature` (`@phase5`) — 6 scenarios fail (3 × chromium + mobile). They test the OLD Expected/Actual/**Share** model, removed in plan **05-15**, and have been red since then. Untouched by 05-19 (last commit `d435945`, pre-05-15) and reference none of 05-19's keys. Logged in `deferred-items.md`; belongs to the 05-15 Share-removal cleanup owner. Not fixed here per executor scope boundary.
- The broad pre-existing component-test debt (`wallet-row`, `wallets-sectioned-list`, `category-slider`, `month-navigator`, `cushion-section` — missing `useLocale` mock export, date drift, etc.) was confirmed red on the pre-change baseline (`956f5d5^`: 10 failed in the `wallet-row` + `month-navigator` pair alone) and references none of the changed symbols. Consistent with the known `make test` infra debt; out of scope.

## Known Stubs

None — all changes wire to existing `ReservesSummaryDto` data (`reserveCents`, `usedCents`, `internalCents`, `userDefinedCents`). The TOTAL USED line is computed from real per-row `usedCents`, not a placeholder.

## Self-Check: PASSED

- All created/modified files verified present on disk (components, 3 locale JSONs, E2E feature/PO/steps, screenshot artifact, this SUMMARY).
- Deleted files confirmed gone: `surplus-banner.tsx`, `surplus-banner.test.tsx`.
- All commits present: `956f5d5` (RED), `639ff76` (GREEN), `c70c120` (E2E).
