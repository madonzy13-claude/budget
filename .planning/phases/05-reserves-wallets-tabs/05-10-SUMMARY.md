# 05-10 Summary — Multi-month, accrual, retroactive, disable (GREEN)

**Status:** ✅ Complete. Tests lock decisions G/I/K; the keystone engine needed **no change**.
**Date:** 2026-06-05

## What was built

Two domain test suites exercising the parts the single-open-month golden fixture can't:

- `reserve-engine-multimonth.test.ts` — decision G (closed-month `left` accrues into running R; later months draw it; accrual accumulates across months) + decision I (raising reserve covers outstanding overspent oldest-first; per-month `used` split oldest-first).
- `reserve-engine-disable.test.ts` — decision K (disable = read-transform: used→overspent, internal 0, underlying state untouched; re-enable replays byte-identical → idempotent round-trip).

## Verification

- `bun test test/domain/reserve-engine*.test.ts` → **14 pass, 0 fail, 405 asserts** across 3 suites (golden + multimonth + disable).
- Engine stayed pure (no Drizzle/platform/persistence); golden fixture still green (no regression).

The keystone engine (05-09) already implemented accrual (op4), the oldest-first retroactive split, and the pure per-call fold with the disable output transform — so 05-10 is a behavior-lock, committed as a single `test(05-10)` commit.

## Commit

- `test(05-10): lock multi-month accrual, retroactive coverage, disable idempotency`

## Downstream

The full DOMAIN model is now proven. Wave 1+ (05-11) wires it into persistence: a Drizzle migration drops `reserve_actual_cents` + the `category_reserve_balance` VIEW and adds a reserve-event-loader that assembles `ReserveEngineEvent[]` from real tables for the 05-12 replay orchestrator.
