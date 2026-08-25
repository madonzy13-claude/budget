---
id: 260825-pdp
slug: pending-drafts-in-projection
date: 2026-08-25
mode: quick
---

# "Free to move" ignores unconfirmed past occurrences

## The report

Overview shows **3,473 zł free to move** on Private Budget while two unconfirmed
occurrences dated today sit in the ledger (3,899.83 + 162.88 = **4,062.71 zł**).
The household has not confirmed them yet; the money is spoken for, and the card
offers it as withdrawable.

## Root cause

`compute-cashflow-projection.ts:221` loads them (`pendingRows`) and passes them
to the simulator as `pendingDrafts`. `simulate-cashflow-projection.ts` uses that
input in exactly ONE place — line 414, `pendingPoints`, which the tooltip prints.
**It never touches cash and never consumes a plan.**

The comment at the loader defends this: the money "still rides inside the
category's daily burn (the plan hasn't been consumed)". That holds only when all
three are true:

1. the occurrence is dated in the CURRENT month, and
2. its category has a limit, and
3. it fits inside what is left of that limit.

Private Budget fails (2): the drafts are in **House**, whose limit row carries
`no_limit = true`, so `budgetAt` returns 0, `disc` is 0 and the burn is 0. The
4,062.71 zł is represented nowhere in the run.

The other two holes are real too: an occurrence dated in a PREVIOUS month is not
covered by this month's plan, and one larger than the remaining limit is only
covered up to it.

## The fix — in the simulator, where the input already arrives

A pending occurrence is money **still in the wallet but already committed**.
Wallet balances are user-maintained (`setBalance`; no ledger trigger), so the
złoty is still counted in `startCashCents`, and the household still owes it.

1. `cash` opens at `startCashCents − Σ pendingDrafts`.
2. Occurrences dated in the START month add to the `spent` figure that
   `discByMonth` and `rollLimitsTo` subtract from the plan — the plan they have
   already consumed must not be charged a second time.

Arithmetic, limited category, budget B, confirmed S, draft D, `immediate` run:

|                | today           | with fix                          |
| -------------- | --------------- | --------------------------------- |
| B−S−D ≥ 0      | `start − (B−S)` | `(start−D) − (B−S−D)` = **same**  |
| B−S−D < 0      | `start − (B−S)` | `start − D` (**lower — correct**) |
| `no_limit`     | `start`         | `start − D` (**the bug**)         |
| previous month | `start`         | `start − D` (**the bug**)         |

So budgets that were already right do not move.

## TDD — failing tests first

`packages/budgeting/test/application/simulate-cashflow-projection.test.ts`:

1. **no-limit category** — a pending draft drops `safeToWithdraw` by its amount.
   RED today: unchanged.
2. **inside the plan** — a pending draft on a limited category with room leaves
   `safeToWithdraw` exactly where it was. Guards the double-count.
3. **beyond the plan** — only the excess bites further.
4. **previous month** — drops cash, does not touch this month's plan.
5. `pendingPoints` still carries every draft (the tooltip must not lose them).

## Verify

- `make test`
- rebuild api, Playwright live against `https://budget-dev.madonzy.com`
- read the card on Private Budget: 3,473 zł must fall to 0 (4,062.71 owed
  against 3,473 free → nothing is free to move)
