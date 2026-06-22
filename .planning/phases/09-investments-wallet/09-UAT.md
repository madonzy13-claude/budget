---
status: testing
phase: 09-investments-wallet
source: [09-07-SUMMARY.md, 09-ADDENDUM-type-first.md, 09-HUMAN-UAT.md]
started: 2026-06-21
updated: 2026-06-21
---

## Current Test

number: 1
name: Drag-and-drop reorder + group reassign
expected: |
Reorder within a group persists; drag a row onto another group header (or a
row in another group) reassigns it; a cross-wallet-section drop is rejected
with the toast "Holdings can only be in Investments."
awaiting: user response

## Pre-flight verification (Claude, before human UAT)

Run on the live stack (budget-dev.madonzy.com) + full automated suites BEFORE
presenting any test, per owner instruction.

Automated (all green): domain 19/19 · adapters+ports+repo 23/23 · api routes 4/4
· worker 1/1 · web vitest 12/12 · E2E @investments-wallet 6/6 (0 flaky).

**Bug found + fixed during pre-flight** (see Gaps → fixed): "add holding → reload
→ row persists" E2E was ~50% flaky (measured 5/10 fail, both desktop+mobile). Not
a test artifact — a real client bug: on reload shortly after a create, the page
hydrated a stale-empty persisted React-Query snapshot and `staleTime:30s` treated
it as fresh, so the just-added holding rendered empty although the server (GET 200)

- DB had it. Fix = write-through persist on create (persistNow in onMutate/onSettled,
  query-persist.ts + use-create-holding.ts). Re-measured 20/20 pass, 0 flaky.

UAT account (live): see the message accompanying Test 1.

## Tests

### 1. Group redesign — interleaved sortable groups + group-as-row header

expected: |
Groups behave like first-class rows in ONE interleaved list:

- each group has its own drag handle; dragging it moves the whole block
  (all children) as a unit; a loose row can sit between two groups.
- drag a holding onto a group header / a row in another group → joins it;
  drag within a group → reorders inside it; drop on a wallet section → rejected.
- group header mirrors a row: DESKTOP shows name · budget-ccy · amount · P/L% ·
  portfolio% inline; MOBILE shows name · budget-ccy · amount, and tapping the
  group reveals P/L% + portfolio% (same as a row).
- group amount = Σ children value (budget ccy); group P/L = cost-basis blended.
- group children render indented (left rail).
  note: |
  Implemented in this UAT pass (group redesign, 4 owner requirements). Verified:
  pure interleave/reorder/aggregate logic 11/11 (investment-grouping.test); group
  header presentation 7/7 (investment-group-header.test); full web vitest 846 pass
  (1 unrelated pre-existing flake); typecheck + i18n gate pass; @investments-wallet
  E2E 6/6. Live (budget-dev, desktop + 390px mobile): group headers render with
  amount/P/L/portfolio + indented children; mobile collapsed = name·ccy·amount,
  tap → +25.2% · 82.9%; aggregates match (Brokerage +25.2%/313,000, Metals
  +20.0%/9,600). The drag GESTURE is human-only (Playwright can't drive @dnd-kit
  pointer sensors); the reorder + group-change data-paths are unit-proven + the
  PATCH/reorder endpoints verified live.
  result: [pending]

### 2. Mobile three-gesture coexistence (<768px)

expected: tap a row expands P/L%+weight%; swipe-left reveals Edit+Delete;
long-press the handle starts drag — the three gestures do not collide.
result: [pending]

### 3. Collapsible group persistence

expected: collapse/expand a group; reload → state persists (localStorage
inv-group-{budgetId}-{slug}); ungrouped rows always visible.
result: [pending]

### 4. Delisted + price-blocked chrome

expected: a delisted holding renders opacity-50, --muted-strong text, "Delisted"
chip, drag handle full opacity; an on-add price-fetch failure shows the
PriceBlockedBanner (role=alert, red left border) + disables Save + inline Retry.
result: [pending]

### 5. Visual contract (DESIGN.md authority)

expected: P/L is text-only green/red (not a filled badge); dashed add button is
NOT yellow; the ONLY yellow is the sheet Save CTA + the Wallets pill; all numbers
use the tabular numeric font (IBM Plex Sans), never Inter.
result: [pending]

### 6. Live tracked-instrument price (needs provider API keys)

expected: selecting a tracked instrument (e.g. AAPL) fetches a live current price
shown read-only with "Last updated …"; P/L computes against it. Requires
Finnhub / Twelve Data / CoinGecko keys in Infisical (\*\_API_KEYS). Until then the
price-blocked banner shows.
result: [pending]
note: expected to be BLOCKED on provider keys (none set yet).

### 7. Type-first form + precious metals (9.1)

expected: Type is the first field; choosing a type swaps the fields — tracked
(Asset autocomplete filtered to the type), manual (name + editable price), precious
metals (metal/kind/UoM + spot-fetched price converted by UoM), cash (currency +
amount). Metals value = spot/oz converted to the chosen unit × quantity.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

# Found + fixed during pre-flight (not an open gap — recorded for traceability).

- truth: "After adding a holding, a reload still shows the holding (it persists)."
  status: fixed
  reason: "~50% flaky E2E; reload hydrated a stale-empty persisted RQ snapshot treated as fresh (staleTime:30s) so the row rendered empty despite GET 200 + DB row."
  severity: major
  test: pre-flight (add-custom-holding persistence guard)
  root_cause: "Optimistic create wrote to memory cache; the 800ms-debounced IDB persister hadn't flushed, so a reload restored the pre-add empty snapshot and SWR never revalidated it."
  artifacts:
  - path: "apps/web/src/lib/query-persist.ts"
    issue: "no immediate write-through; only an 800ms debounced persister"
  - path: "apps/web/src/hooks/use-create-holding.ts"
    issue: "optimistic create did not durably persist before a possible reload"
    missing:
  - "persistNow() write-through; called in onMutate (await) + onSettled"
    resolution: "Implemented write-through persist; re-measured 20/20 pass, 0 flaky."
