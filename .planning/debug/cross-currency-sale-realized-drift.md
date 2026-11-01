---
status: diagnosed
trigger: "cross-currency-sale-realized-drift: Selling a PLN asset into a EUR cash asset shows the Converted-out entry in PLN at today's rate and a non-zero realized gain that appears to be recomputed from FX instead of fixed at deal time."
created: 2026-10-28T08:00:00Z
updated: 2026-10-28T12:06:00Z
---

## Current Focus

hypothesis: sell use case converts EUR proceeds into PLN via FX (latest rate), stores source-currency proceeds; realized = converted proceeds - cost
test: read sell-holding.ts, sell-booking.ts, asset-ledger.ts; query dev DB rows
expecting: FX conversion at deal time with rate != form-implied rate
next_action: read packages/investments/src/application/sell-holding.ts and domain/sell-booking.ts

## Symptoms

expected: Converted-out entry shows proceeds in the received currency (690 EUR). Realized gain computed once at deal time and stored; never recomputed from later FX. Selling 3,000 PLN of diamonds for its 690 EUR equivalent -> realized 0.
actual: Diamonds (PLN) ledger: Oct 27 Added +3,000 PLN; Oct 28 Converted out -2,980.80 PLN "to Money for diamonds", realized -19.20; Oct 28 Added +100 PLN. Destination Money for diamonds (Cash, EUR 690): Converted in +690 EUR. Cash header 2,980.80 PLN.
errors: none
reproduction: UAT test 14 - Swap -> Sell PLN hand-valued asset into New investment (Cash, EUR), entering EUR amount.
started: Phase 13.1 UAT 2026-10-28

## Eliminated

- hypothesis: realized is recomputed on read from later FX
  evidence: investment_history row 895138e3 stores realized_budget_cents=-1920, sold_cost_budget_cents=300000; list-entries.ts passes e.realizedBudgetCents through unchanged. Realized IS frozen at deal time; it was wrong at deal time.
  timestamp: 2026-10-28T12:05:00Z

## Evidence

- timestamp: 2026-10-28T12:00:00Z
  checked: budgeting.investment_history for the diamonds sale
  found: convert_out amount_cents=69000 EUR, cost_delta=-300000 PLN, sold_cost_budget=300000 PLN, realized_budget=-1920 PLN, budget_currency PLN. convert_in leg 69000 EUR.
  implication: 690 EUR stored correctly; realized -19.20 = 690*4.32 - 3000.

- timestamp: 2026-10-28T12:02:00Z
  checked: budgeting.fx_rates for 2026-10-28
  found: EUR->PLN 4.32 and PLN->EUR 0.23 both provider 'e2e-seed' (fetched 00:03). 1/0.23=4.3478, not 4.32. Real frankfurter 10-27: EUR->PLN 4.4059, PLN->EUR 0.22688.
  implication: dev FX cache for today is fake E2E data; the two directions are non-reciprocal.

- timestamp: 2026-10-28T12:03:00Z
  checked: apps/web/e2e/steps/budgets-aggregate.steps.ts seedFxRates (L200-232)
  found: inserts hardcoded pairs incl EUR/PLN 4.32 + PLN/EUR 0.23 for today AND yesterday into the shared budgeting.fx_rates, ON CONFLICT DO NOTHING, as worker role. Runs against the dev DB; wins whenever it runs before the daily Frankfurter fetch for that pair.
  implication: E2E pollutes the live dev rates (CNY-style poisoning of real user data).

- timestamp: 2026-10-28T12:04:00Z
  checked: swap-sell-tab.tsx L204-260
  found: form fetches /fx/rate from=srcCcy(PLN) to=receivedCcy(EUR) -> 0.23; prefills received = 3000*0.23 = 690 EUR; preview realized = received - soldCost*rate = 0 (computed in received ccy with SAME rate).
  implication: user did not type a wrong number; prefill + preview said 0 realized.

- timestamp: 2026-10-28T12:04:30Z
  checked: sell-holding.ts realizedInBudget call
  found: server converts received with rate(receivedCcy->budgetCcy) = EUR->PLN 4.32 and cost with rate(PLN->PLN)=1. Different FX direction/row than the form used.
  implication: any non-reciprocal pair (fake seed: 0.6%; real frankfurter rows fetched independently: ~0.04%) books non-zero realized on a fair swap.

- timestamp: 2026-10-28T12:05:00Z
  checked: list-entries.ts toDisplay + ledger-row.tsx L90-91
  found: server returns amountCents=-69000 EUR plus displayAmountCents = 690*rate(EUR->PLN @ entry date) in asset display ccy PLN; ledger-row renders `displayAmountCents ?? amountCents` with `displayCurrency ?? amountCurrency`, so the stored 690 EUR is never shown. Display figure is re-derived on every read from fx_rates (stable only while that date's row is unchanged).
  implication: "-2,980.80 PLN" is a read-time conversion of 690 EUR, not stored proceeds; nothing records "3,000 PLN given".

## Resolution

root_cause: Two FX lookups that disagree. The sell form prefills/previews with rate(PLN->EUR) (0.23 -> 690 EUR, realized 0) while sell-holding.ts books realized with the independently stored rate(EUR->PLN) (4.32 -> 2980.80 PLN, realized -19.20). On dev the rows are fake, non-reciprocal 'e2e-seed' values injected into the shared fx_rates by budgets-aggregate.steps.ts seedFxRates, which magnifies the gap; with real Frankfurter rows the same code still drifts (~0.04%). Separately, the ledger row always renders displayAmountCents (690 EUR re-converted to PLN at the entry-date rate on read) instead of the stored 690 EUR, and no source-currency proceeds are stored for the convert_out leg.
fix:
verification:
files_changed: []
