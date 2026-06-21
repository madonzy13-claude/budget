---
status: partial
phase: 09-investments-wallet
source: [09-07-PLAN.md]
started: 2026-06-21
updated: 2026-06-21
---

## Current Test

[awaiting human testing — owner deferred to UAT phase]

## Tests

Automated + Playwright-driven checks already passed (flag toggle reactivity, BTC
search, custom→Type select, group create label, optimistic create persists after
reload, P/L compute, onboarding toggle). The items below are visual/interaction
polish deferred to UAT-phase testing.

### 1. Drag-and-drop feel

expected: Reorder within a group persists; drag onto another group header reassigns;
drag onto a holding in another group reassigns; cross-wallet-section drop is rejected
with the toast "Holdings can only be in Investments."
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

expected: P/L is text-only green/red (not a filled badge); dashed add button is NOT
yellow; the ONLY yellow is the sheet Save CTA + the Wallets pill; all numbers use the
tabular numeric font (IBM Plex Sans), never Inter.
result: [pending]

### 6. Live tracked-instrument price (needs provider API keys)

expected: selecting a tracked instrument (e.g. AAPL) fetches a live current price
shown read-only with "Last updated …"; P/L computes against it. Requires
TwelveData/CoinGecko/metals.dev keys in the environment.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
