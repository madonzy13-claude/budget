---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 08
subsystem: investments, api
tags: [adjust, undo, history, type-summary, delete, tdd]
key-files:
  created:
    - packages/investments/src/application/adjust-holding.ts
    - packages/investments/src/application/reverse-history-entry.ts
    - packages/investments/src/application/history-queries.ts
    - packages/investments/test/application/adjust-holding.test.ts
    - packages/investments/test/application/reverse-history-entry.test.ts
    - packages/investments/test/application/memory-world.ts
  modified:
    - packages/investments/src/ports/history-repo.ts
    - packages/investments/src/adapters/persistence/history-repo.ts
    - packages/investments/src/application/update-holding.ts
    - packages/investments/src/contracts/api.ts
    - packages/investments/src/contracts/factory.ts
    - apps/api/src/routes/investments.ts
    - apps/api/test/routes/investments-history.test.ts
requirements-completed: [D-03, D-05, D-06, D-09, D-12, D-14, D-15, D-16, D-18, D-20]
---

# 13-08 Summary: Edit bookings, full undo, type summary, delete

- `adjustHolding`: value_change (value only), add (cost + flow), withdraw (delegates to `sellHolding` Out — one rule, D-03), buy (qty + cost + flow). `nothing_added`, `wrong_shape`.
- PATCH guard: non-possession holdings refuse a changed buy price or quantity with `use_adjust` (numeric compare, so re-sent "1.00000000" passes).
- `reverseHistoryEntry` (D-06): per-leg `planLegUndo` — deposit sale restores prior principal + start (latest entry only, else `undo_later_first`); a convert_in that was its holding's only live entry AND whose undo leaves nothing → holding deleted; otherwise `reverseEntry` deltas from current state; sale of an archived holding un-archives it; all legs soft-deleted in ONE commit.
- `history-queries`: `listHistory` (newest first, counterparty name), `typeSummary` (per current ui_type incl. archived holdings, older budget currency at today's rate, + saved order), `setTypeOrder`, `deleteHolding` (undo partner legs via the same path, then hard delete).
- Adapter: `findLegs`, `listForHolding`, `realizedByType`, `get/setTypeOrder`; commit handles `softDeleteEntryIds` + `deleteHoldingIds` (scoped by budget, miss → not_found).
- Routes: GET /type-summary, PUT /type-order, DELETE /history/:entryId, GET /:id/history, POST /:id/adjust, DELETE /:id. PATCH already maps `use_adjust` → 422.
- Test infra: `memory-world.ts` — stateful in-memory HoldingRepo + HistoryRepo applying BookingPlans like the adapter, so sell → undo → re-sell is asserted on real state.

## Verification
- Unit: investments application/domain/contracts 150/0 (reversal 10 cases incl. user-requested sale-into-existing-cash undo, later-sale survives, delete-then-re-enter equality, deposit restore, undo_later_first).
- Real PG: investments-history + investments 27/0 (two-leg undo in DB, delete+re-enter equality, cross-tenant 404s, use_adjust, sold-out type realized 41,000 / sold cost 55,000, type-order 200/422, destination delete restores source).
- api 06:06:18Z / worker 06:06:33Z rebuilt healthy; served routes file has the new paths.

## Deviations
- [Rule 1 bug, caught by RED test] "created by this conversion" first keyed only on "no other live entry", which deleted an existing cash holding that simply had no history (null-buy holdings get no Start row). Now also requires that undoing the leg leaves the holding empty.
- `StoredEntry` gained `soldCostBudgetCents` (needed by the world fake's type summary; harmless for the adapter).
- RED for the route task was the unit layer; integration tests passed on first run.

## Interim
Deployed web is still pre-13-09: its form re-sends buy price/quantity, so changing either in the OLD edit sheet now returns use_adjust until the web plans ship.

## Self-Check: PASSED
