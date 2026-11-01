---
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
plan: 02
subsystem: investments-domain, budgeting-overview
tags: [tdd, contributions, overview, fx]
key-files:
  created:
    - packages/investments/src/domain/contributions.ts
    - packages/investments/test/domain/contributions.test.ts
  modified:
    - packages/budgeting/src/application/get-overview-wealth.ts
    - packages/budgeting/test/overview/get-overview-wealth.test.ts
requirements-completed: [D-08, D-19]
---

# 13-02 Summary: Contributions reader + Overview hybrid

- `makeContributionsReader(entries, budgetCcy, rateFor)`: Σ flows ≤ date, converted at the POINT date's rate, memoized per (ccy,date); rate failure → `null` for that date.
- `get-overview-wealth`: optional `contributionsHistory` dep. When net+investments and firstDate set, distinct UTC dates (rows, opening, now) ≥ boundary are pre-resolved; `costOf(r, date)` uses history, else (pre-boundary / null / dep rejects) the stored snapshot cost. Live point uses today's date. `computeWealthNow` call moved above cost resolution (no behavior change).
- Production wiring deferred to 13-07 (boot.ts) per plan.

## Commits
test(13-02) ×2 RED, feat(13-02) ×2 GREEN.

## Verification
contributions 7/7; overview suite 170 pass / 3 fail — the 3 fails (`getOverviewPlanned` / planned averages) fail identically on HEAD before this plan (date-dependent, out of scope; see deferred-items.md).

## Deviations
None.

## Self-Check: PASSED
