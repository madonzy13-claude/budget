---
phase: 09-investments-wallet
plan: 02
subsystem: testing
tags: [domain, big.js, tdd, portfolio-metrics, holding, fx-conversion]

# Dependency graph
requires:
  - phase: 09-investments-wallet
    provides: "09-01 investments-schema column names/types the entity mirrors"
provides:
  - "Holding plain-class entity (9-value HoldingType union, isCash/isCustom/isArchived)"
  - "Pure portfolio-metrics: holdingValue, profitLossPct (FX-converted, cash null sentinel), portfolioWeights, groupWeights"
  - "RateMap type (value-ccy -> budget-ccy conversion)"
affects: [09-03, 09-06, 09-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Domain math via big.js directly (Big), cents bigint, quantity big.js string"
    - "FX-pure domain: caller passes plain rate strings, domain never imports FxProvider"
    - "Grouped holding weight = share of group total; ungrouped = share of portfolio total; denominator in budget default ccy"

key-files:
  created:
    - packages/investments/src/domain/holding.ts
    - packages/investments/src/domain/portfolio-metrics.ts
    - packages/investments/test/domain/holding.test.ts
    - packages/investments/test/domain/holding-metrics.test.ts
    - packages/investments/test/domain/portfolio-weights.test.ts
  modified: []

key-decisions:
  - "Used big.js (Big) directly rather than shared-kernel Money — Money's Currency union is too narrow for the 14 supported currencies; same underlying lib, dep-cruiser allows it"
  - "holdingValue returns exact cents as Big (no rounding); only display % values become JS numbers"
  - "cash_fx value = currentPriceCents (the cash amount), quantity ignored; profitLossPct returns null for cash / missing buy basis"
  - "profitLossPct converts current->buy currency only when currencies differ (rate arg, default 1)"

patterns-established:
  - "Test mk() helper uses `=== undefined` (not `??`) for nullable fields so explicit null is preserved"

requirements-completed: [INV-03, INV-04, INV-08, INV-09, INV-10]

# Metrics
duration: 8min
completed: 2026-06-21
---

# Phase 9 Plan 02: Investments Domain Core Summary

**Holding plain-class entity (9-value union, cash/custom helpers) + pure big.js portfolio metrics — value, FX-converted P/L %, within-group/whole-portfolio weights, and group-% — all denominated in the budget default currency.**

## Performance

- **Duration:** ~8 min
- **Tasks:** TDD feature (RED → GREEN; no REFACTOR needed)
- **Files modified:** 5 created
- **Tests:** 17 pass / 0 fail, domain coverage 99.3% (threshold 80%)

## Accomplishments

- `Holding` domain entity: locked 9-value `HoldingType` union + `isHoldingType` guard + `isCash`/`isCustom`/`isArchived`, zero drizzle/Hono/adapter imports (T-9-05).
- `portfolio-metrics.ts`: `holdingValue` (exact big.js cents), `profitLossPct` (FX conversion before comparison, cash/no-basis null sentinel), `portfolioWeights`, `groupWeights` (budget-ccy denominator, T-9-04 no-float).
- Mixed-currency weight test proves a USD holding's weight reflects its EUR-converted value, not its raw USD number.

## Task Commits

1. **RED: failing tests** — `8ed2ad5` (test)
2. **GREEN: holding entity + portfolio metrics** — `bfbe65b` (feat; also corrected the test `mk()` null-handling)

## Files Created/Modified

- `src/domain/holding.ts` — entity + union + guard + helpers
- `src/domain/portfolio-metrics.ts` — holdingValue / profitLossPct / portfolioWeights / groupWeights + RateMap
- `test/domain/{holding,holding-metrics,portfolio-weights}.test.ts` — 17 cases

## Decisions Made

See key-decisions frontmatter — notably big.js-direct (Money union too narrow), cash value-only, FX-pure domain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mk() helper collapsed explicit null via `??`**

- **Found during:** GREEN (first run, 2 fails)
- **Issue:** `o.instrumentId ?? "i1"` and `o.buyPriceCents ?? 10000n` turned an explicit `null` into the default, so `isCustom()` / null-buy-basis cases couldn't be expressed — failures were in the test helper, not the source.
- **Fix:** Switched nullable fields to `=== undefined ? default : value`.
- **Files modified:** test/domain/holding.test.ts
- **Verification:** 17/17 pass.
- **Committed in:** `bfbe65b`

---

**Total deviations:** 1 auto-fixed (1 bug, test-only)
**Impact on plan:** Test-helper correction only; source implemented as specified. No scope creep.

## Issues Encountered

None beyond the test-helper bug above.

## User Setup Required

None — pure domain, no external services.

## Next Phase Readiness

- 09-03 repos hydrate `Holding` from rows; 09-06 enrichment calls these metric functions with FX rates from FxProvider.
- The `Money` decision (big.js-direct) is the pattern adapters/use-cases should follow for investment math.

---

_Phase: 09-investments-wallet_
_Completed: 2026-06-21_
