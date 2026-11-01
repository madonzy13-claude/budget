---
status: diagnosed
trigger: "edit-currency-no-convert + cash-shows-profit (13.1 UAT tests 6 and 3)"
created: 2026-10-28T12:00:00Z
updated: 2026-10-28T12:10:00Z
---

## Current Focus

hypothesis: both confirmed (see Resolution)
next_action: hand off to plan-phase --gaps

## Symptoms

expected: (1) D-36 — changing currency on a hand-valued asset converts the value at today's FX; form field updates live and shows "amount x rate (date)" like the spendings transaction edit sheet. (2) Cash type header shows no P/L (rows already show none).
actual: (1) Value field keeps the old number, only the label suffix changes; no rate line. (2) Cash type header tap shows a P/L line + "unrealized · realized · share" caption.
errors: none
reproduction: UAT tests 6 and 3
started: Phase 13.1 UAT, 2026-10-28

## Eliminated

- hypothesis: server ignores displayCurrency on save (D-36 not implemented)
  evidence: packages/investments/src/application/edit-asset.ts converts currentPriceCents via makeRate(fxProvider, today) when instrumentId === null; unit test "display currency on a hand-valued asset converts the value at today's rate; cost untouched" (packages/investments/test/application/edit-asset.test.ts:87) asserts 100000 PLN -> 25000 EUR.
  timestamp: 2026-10-28T12:05:00Z
- hypothesis: cash header profit comes from realized (withdraw/convert_out) booked against the cash type
  evidence: dev DB — only cash holding "Money for diamonds" has a single convert_in entry, no realized; realizedByType for the budget returns broker + collectibles only.
  timestamp: 2026-10-28T12:08:00Z
- hypothesis: server returns non-null profitLossPct for cash
  evidence: portfolio-metrics.ts profitLossPct/profitLossCents return null when h.isCash(); typeGroupPL skips null-basis holdings.
  timestamp: 2026-10-28T12:08:00Z

## Evidence

- timestamp: 2026-10-28T12:02:00Z
  checked: apps/web/src/components/budgeting/wallets-tab/edit-asset-sheet.tsx
  found: CurrencyPicker onSelect={setCcy} only. `price` state never recomputed; label becomes `currentValue (${ccy})`. No /fx/rate fetch, no FxPreviewLine. Payload when only ccy changes = { displayCurrency } (web test asserts exactly that, edit-asset-sheet.test.tsx:103).
  implication: form shows old-currency number under new-currency label; conversion happens only server-side after save, invisible to user.
- timestamp: 2026-10-28T12:03:00Z
  checked: transaction-slider.tsx (spendings edit) 236-267, 512-534; fields/fx-preview-line.tsx; swap-sell-tab.tsx 205-221
  found: pattern = debounced clientApiFetch(`/fx/rate?from&to&date`) -> FxQuote {rate, fxRateDate, provider} -> <FxPreviewLine original converted rate asOf/> (+ FxFreshnessBadge when stale). swap-sell-tab has a simpler useEffect rate fetch at today().
  implication: reusable pieces exist; no shared hook — logic is inline in each sheet.
- timestamp: 2026-10-28T12:05:00Z
  checked: packages/investments/src/application/edit-asset.ts
  found: if both displayCurrency and currentValueCents are sent, the typed value wins (written as-is in new ccy). So if the form converts client-side and sends the converted value, server books a value_change entry instead of a silent re-denomination.
  implication: fix must keep sending ONLY displayCurrency when the user hasn't edited the value (send preview for display only), or the conversion becomes a fake "Value updated" ledger entry.
- timestamp: 2026-10-28T12:08:00Z
  checked: investment-type-header.tsx + lib/investment-type-groups.ts typeGroupPL; ran typeGroupPL on cash-only group
  found: result {totalPLCents:0, unrealized:0, realized:0, pct:null}. Header renders the split block unconditionally: pct null -> "—", then signed(0) amount, then caption "unrealized 0 · realized 0 · share X%". No uiType/basis gate.
  implication: header always presents P/L for every type; cash row suppresses because row gates on pct == null (investment-row.tsx plNode), header has no equivalent.
- timestamp: 2026-10-28T12:09:00Z
  checked: sell-booking.ts / sell-holding.ts for cash special-case
  found: none — a withdraw/convert_out of foreign-currency cash would book realized FX drift into the cash type, making the header non-zero.
  implication: gate should be by type (no-basis type), not by "value is zero".

## Resolution

root_cause: (1) EditAssetSheet treats currency as a label-only change client-side: no FX fetch, no recompute of the value field, no FxPreviewLine. Server DOES convert on save (D-36, edit-asset.ts, unit-tested), so the stored result is right but the form lies until after save. (2) InvestmentTypeHeader renders the P/L line and unrealized/realized caption for every type; typeGroupPL returns pct null + 0 amounts for cash, and the header prints "— 0" + caption instead of suppressing. Row suppresses via `pct == null -> plNode = null`; header has no matching gate.
fix:
verification:
files_changed: []
