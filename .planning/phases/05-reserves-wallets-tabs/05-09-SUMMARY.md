# 05-09 Summary — Keystone reserve-engine (GREEN)

**Status:** ✅ Complete. RED→GREEN, committed.
**Date:** 2026-06-05

## What was built

Pure-domain `packages/budgeting/src/domain/reserve-engine.ts` — the single source of truth for the new reserve model. A chronological event fold producing:

- per-category running `R` (available) + `U` (used) reserve;
- per-(category, month) `{overage, used, overspent, left}` cells;
- globals `internal = ΣR` (active cats), `surplus = userDefined − internal`.

No IO / Drizzle / Temporal — pure data→data. Replaces the greedy `reserve-allocator` (deleted in 05-16).

## Operations (verbatim from spec)

- op1 overage +Δ: `draw = min(Δ, R); R−=draw; U+=draw`
- op2 overage −Δ: cut overspent first; remainder `U→R`
- op3 set reserve to X: `d=X−R`; if `d≥0` cover overspent first (→U), rest→R; else `R+=d`
- op4 accrual: `reserve += left` (= op3 with X=R+left)
- Retroactive coverage (decision I): op3/op4 cover outstanding overspent across all months; per-month `used` projected oldest-first.

## Verification

- `bun test test/domain/reserve-engine.test.ts` → **7 pass, 0 fail, 333 asserts.**
  - Golden fixture: all 29 rows, every numeric cell (G/H overspent·used·left·reserve + internal + surplus).
  - 6 operation unit tests + `used + overspent == overage` invariant.
- Purity grep (drizzle/platform/persistence/temporal/fs) → empty.
- `tsc --noEmit` → no reserve-engine errors.

Golden fixture lives at `packages/budgeting/test/domain/reserve-engine.golden.csv` (parsed by the test) and mirrors `05-REWRITE-SPEC.md`.

## Commits

- `test(05-09): add failing golden-fixture reserve-engine test (RED)`
- `feat(05-09): implement pure reserve-engine — golden fixture + ops green (GREEN)`

## Notes for downstream

- Contracts (`ReserveEngineEvent`, `ReserveEngineResult`, `CategoryReserveState`, `CategoryMonthCell`) are what the 05-12 replay orchestrator assembles events into and reads results from.
- `reservesEnabled=false` output transform (decision K) is implemented (used→overspent, internal=0); idempotency + multi-month/accrual get dedicated tests in 05-10.
- `exclude`/`archive` events set flags affecting `internal` only (no sibling spill — categories independent); their full use-case behavior is refined in 05-13.
