---
id: 260825-pdp
slug: pending-drafts-in-projection
date: 2026-08-25
mode: quick
status: complete
---

# Summary

"Free to move" offered money the household had already committed.

## What was wrong

The cash-flow simulator received unconfirmed past-due occurrences as
`pendingDrafts` and used the input in exactly one place — `pendingPoints`, the
tooltip list. It never reduced cash and never consumed a plan.

The loader's comment defended this: the money "still rides inside the category's
daily burn". True only for a start-month occurrence in a category that HAS a
limit with room left. Private Budget's two unconfirmed **House** occurrences
(3,899.83 + 162.88 = 4,062.71 zł) sit in a category whose limit row carries
`no_limit = true` → `budgetAt` returns 0 → no burn → nothing represented them,
and the card offered **3,473 zł** as free to move.

## The fix

In the simulator, where the input already arrived:

1. Cash opens at `startCashCents − Σ pendingDrafts`. Wallet balances are
   hand-maintained (`setBalance`; no ledger trigger), so the money is still
   counted as held — and it is still owed.
2. Start-month occurrences add to the `spent` figure `discByMonth` and
   `rollLimitsTo` subtract, so the plan they already consumed is not charged a
   second time.

An occurrence dated in an earlier month is owed in full: that month's plan is
behind us. One with no category is owed in full too — the same reading
`applyOutflow` already gives an uncategorised bill.

Budgets that were already right do not move: for `B − S − D ≥ 0` the arithmetic
is `(start−D) − (B−S−D)` = `start − (B−S)`, exactly what it was.

## Evidence

| Step                          | Result                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tests written first           | RED 3/5 — no-limit, beyond-plan and earlier-month all showed a 0 delta                                           |
| Two that passed at RED        | the no-double-count guard and the tooltip guard — those already held                                             |
| After implementation          | 32 pass, 0 fail in the file                                                                                      |
| Full backend suite            | **1679 pass, 1 skip, 0 fail, `make test` exit 0**                                                                |
| eslint --max-warnings=0 / tsc | clean                                                                                                            |
| Web component tests           | 33 pass                                                                                                          |
| E2E, live, solo               | **1 passed** — wallet $1,000, one unanswered $400 in an unbounded category → card reads **$600**                 |
| E2E discriminates             | same scenario asserting the pre-fix 1000 → `Expected: "1000" Received: "600"`                                    |
| E2E, `@overview\|@projection` | **11 passed, 0 failed**, 2 flaky (`browser.newContext: … has been closed` — runner contention, not an assertion) |

## Also changed

One existing test asserted the bug — "pending unconfirmed drafts ride along
without moving cash", on an uncategorised draft it claimed was "already inside
the discretionary burn". It never was. Rewritten to assert the money is owed on
top, with the reason recorded.

`pendingHint` reworded in EN/PL/UK: "Still counted in your plan…" → "Already
taken off what you have, until you confirm or reject it".

## E2E added

`overview-projection.feature` — "Money owed on an unanswered occurrence is not
free to move", with steps in `overview-free-to-move.steps.ts` and
`OverviewPo.freeToMove()`. Seeds a SPENDINGS wallet, an unbounded category and
one unanswered occurrence over SQL under app_role, then reads the card.

It turns amount privacy off for the budget first: `SlotAmount` keeps the real
digits OUT of the DOM until a figure is tapped, and the scenario is about the
number rather than the reveal gesture.

## Outstanding

**The user's own budget is unverified from the outside.** Private Budget's two
unanswered House occurrences total 4,062.71 zł against 3,473 zł free to move, so
the card should now show the balanced note instead of a figure — predicted from
the arithmetic, not observed, since reading it would mean signing in as them.

## Follow-up — the balanced note is gone too (user, 260825)

With `freeToMove` clamped at zero the card fell to a third branch printing
"Plan looks solid". The user asked for it not to render. It read as praise the
card had not earned, and it read identically whether the forecast cleared zero
comfortably or by one złoty.

The branch now returns `null` **explicitly** rather than being deleted: falling
through to the branch below would answer a question about spare money with the
unrelated "Upcoming" figure. `cards.spendBalanced` removed from EN/PL/UK (the
4-key en-vs-pl/uk gap that remains is the pre-existing `_machineTranslated`
markers, untouched).

| Step                          | Result                                          |
| ----------------------------- | ----------------------------------------------- |
| Test rewritten first          | RED: `expected <div><dd></dd></div> to be null` |
| After the change              | overview-cards 33 pass                          |
| Full web suite                | **2318 passed, 34 skipped, 0 failed**           |
| eslint --max-warnings=0 / tsc | clean                                           |

## Follow-up — the two card rows now share a height (user, 260825)

The 2x2 summary grid sized its rows independently, so the Cushion note wrapping
to a second line left the top row visibly shorter. One class on the grid —
`auto-rows-fr` — sizes both rows together.

Finding a RED took three attempts, and that is the point: a fresh user's cards
are equal by accident (all four 121.39px, every note one line), so the first two
versions of the scenario passed against the broken build and proved nothing. The
wrap only appears with a long note in a narrow column, so the scenario now states
both: a 320px viewport and a cushion surplus large enough to wrap.

| Step                 | Result                                                 |
| -------------------- | ------------------------------------------------------ |
| Measured, unfixed    | `[138.19, 138.19, 154.98, 154.98]` — a **16.80px** gap |
| Scenario RED         | `Expected: 0  Received: 16.796875`                     |
| After `auto-rows-fr` | E2E `@overview\|@projection` **15 passed, 0 failed**   |
| Full web suite / tsc | 2318 passed, tsc clean                                 |
