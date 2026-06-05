# 05-15 Summary — Reserves UI + E2E (engine model)

**Status:** ✅ Code + component tests complete; E2E committed; web rebuilt; **awaiting visual human-verify**.
**Date:** 2026-06-05

## What was built (commit `4ddfa58` + E2E commit)

**Reserve tab reshaped to the engine model:**

- Per active category: ONE editable **Reserve** + read-only **Used** (+ overspent surfaced). Removed Expected/Actual/Share columns.
- New `surplus-banner.tsx`: TOPUP (internal > userDefined) / WITHDRAW (internal < userDefined) / reconciled (0), sourced from engine totals `{internalCents, userDefinedCents, surplusCents, direction}`.
- `reserves-totals-footer` shows Σ internal vs Σ wallets + the banner. **Deleted `mismatch-chip.tsx`** (+ its test).
- Spendings grid consumes `reserveUsedCents`/`overspentCents` (dropped `reserveAvailableCents`).

**Hooks reshaped:** `use-reserves-summary` (new rows/totals shape), `use-update-reserve-adjustment` (optimistic = set row reserve + recompute internal/surplus/direction; `{reserveCents, deltaCents}` wire), `use-toggle-category-reserve-excluded` (engine-shape row move), `use-create-transaction` + `use-spendings-summary` (no client-side reserve prediction / dropped field).

**Deleted dead web mirror:** `apps/web/src/lib/reserve-allocator.ts` (greedy refill/deduct/share — gone).

**i18n:** EN keys added (`reserves.column.reserve/.used`, `surplus.topup/.withdraw/.reconciled`, `totals.internalLabel`); PL/UK mirrored (05-16 finalizes translations).

## Verification

- Component + hook vitest: **45 pass / 0 fail** across 6 suites (surplus-banner, reserves-table-row, reserves-totals-footer, reserves-table-client-excluded, use-update-reserve-adjustment, use-create-transaction).
- E2E `apps/web/e2e/features/reserves.feature` (`@tasks-redesign`, 4 scenarios): Reserve+Used columns / no Share, surplus banner WITHDRAW, adjust→TOPUP, disabled notice. + `ReservesPo` page object + steps.
- Web image rebuilt + restarted (UI bundled at build time).

## Commits

- `feat(05-15): reshape reserves+spendings UI to new engine model; delete dead allocator+mismatch-chip`
- `test(05-15): @tasks-redesign reserves E2E — reserve/used columns, surplus banner, disable notice`

## Deferred to 05-16

- Delete the now-orphaned backend `reserve-balance-repo.ts` + port (dropped-VIEW reader, zero live call sites).
- Delete dead in-flight test files referencing the dropped VIEW: `packages/budgeting/test/reserve-view-accrual.test.ts`, `category-limit-per-month.test.ts`, `category-removal-modes.test.ts`; drop the dead `drizzle/0029_reserve_discarded_overspend.sql` (creates the VIEW that 0030 drops). Commit the `reserve-ledger.ts` deletion.
- Finalize PL/UK translations; full gates (make test, ci-gate, E2E, typecheck); dead-symbol grep → zero; `graphify update`.
