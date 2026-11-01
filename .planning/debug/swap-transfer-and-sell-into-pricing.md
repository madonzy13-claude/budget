---
status: diagnosed
trigger: "swap-transfer-and-sell-into-pricing: Transfer shows price 1000 instead of source average cost; Sell into another investment overwrites destination buy price from amount/qty and shows two quantity fields + Amount received field"
created: 2026-10-28T12:00:00Z
updated: 2026-10-28T12:30:00Z
---

## Current Focus

hypothesis: CONFIRMED — both defects share one root: Sell → New/Existing (convert_in) derives destination buy price = received ÷ qty. The "1000" is that derived price (500 USD ÷ 0.5 BTC) stored as Bitcoin buy_price_cents; Transfer then correctly moves cost at that (wrong) stored average.
test: done (dev DB read-only + code trace)
expecting: n/a
next_action: return diagnosis to orchestrator (find_root_cause_only)

## Symptoms

expected: |
(1) Transfer entries carry source average cost per unit (moved cost / moved qty); D-10: cost moves proportionally, no realized.
(2) Sell -> New/Existing investment: one destination quantity field; destination buy price not derived from amount (USDT stays ~1 USD); qty<->amount auto-link only while neither field hand-edited; once hand-edited, never overwritten. No "Amount received" field — received = destination qty x price.
actual: |
(1) Ledger shows "Converted in +0.5 @ 1,000 from Test (+500 USD)" on Bitcoin; transfer "at price 1000".
(2) BTC -> new Tether: "Quantity bought 1000" AND "Quantity 1000" + "Linked"; Buy price auto 16.2846 (=16284.6/1000); separate "Amount received 16284.6 USD".
errors: none
reproduction: UAT tests 10 and 11
started: Phase 13.1 UAT, 2026-10-28

## Eliminated

- hypothesis: 1000 is a cents-vs-units scale bug or placeholder in the ledger renderer
  evidence: list-entries.ts:132 priceCents = amountCents / |qtyDelta|; transfer_out row amount 30000 / 0.3 = 100000 cents = 1,000.00 USD, convert_in 50000 / 0.5 = 100000. Scale is correct; the value is real.
  timestamp: 2026-10-28T12:15:00Z
- hypothesis: transfer-asset.ts computes cost moved wrongly
  evidence: costMoved = src.buyPriceCents (100000) x 0.3 = 30000 — matches stored row exactly; transfer math per D-10 is right given its input.
  timestamp: 2026-10-28T12:15:00Z

## Evidence

- timestamp: 2026-10-28T12:10:00Z
  checked: dev DB budgeting.investment_history (transfer*/convert* rows)
  found: "Converted in +0.5 @ 1,000" row is kind=convert_in (a SELL-into, not a transfer) from amount asset "Test" (broker) into NEW Bitcoin cdc271c4, amount 50000 USD, qty 0.5. Bitcoin row buy_price_cents=100000 (1000.00 USD), current_price_cents=7973900. Only transfer row ever written: transfer_out -0.3 amount 30000 (soft-deleted 11:38).
  implication: 1000 is STORED buy price written by sell-into (500 / 0.5), then inherited by transfer.
- timestamp: 2026-10-28T12:12:00Z
  checked: sell-holding.ts:330-342 (new quantity destination)
  found: unit = dest.priceCents ?? received / qty; newHolding.buyPriceCents = unit AND currentPriceCents = unit. Convert_in leg costDeltaCents = received regardless of priceCents. intoExisting (263-277) also books paid=received via buyMore -> dest avg cost shifts by received/qty.
  implication: server makes buy price a function of amount received; also clobbers live current price.
- timestamp: 2026-10-28T12:14:00Z
  checked: list-entries.ts:132, ledger-row.tsx
  found: "@ price" is render-side amountCents / |qtyDelta|; for transfer legs amount = costMoved so price = src average cost (correct formula).
  implication: transfer display will be right once source buy_price is right.
- timestamp: 2026-10-28T12:18:00Z
  checked: swap-sell-tab.tsx 172-400, 505-560; holding-sheet.tsx 288, 678-725, 1118-1146
  found: |
  Two qty inputs: HoldingFormFields (embedded HoldingSheet, dest mode) renders "Quantity bought" (holding-sheet-quantity, destQuantity = tracked|metals) emitting newHolding.quantity; swap-sell-tab ALSO renders its own "Quantity" (swap-dest-qty) + "Buy price" pair with "Linked" caption. Payload spreads newHolding then overrides quantity with derivedQty — the sheet's field is dead-but-required (qtyOk gates onChange(null)).
  Price derivation: lastEdited defaults "qty"; derivedPrice = receivedCents/100 / destQty -> 16284.6/1000 = 16.2846. Single lastEdited flag (no per-field touched) means editing qty always recomputes and overwrites a hand-typed price, and vice versa.
  Amount received: own field, prefilled by effect from calc.soldValue x rate (receivedTouched) — it is the master quantity both dest fields derive from. Dest-mode sheet hides buy/current price (`!dest &&`), so the instrument's fetched live price (USDT ~1) is never used as the default buy price.
  implication: UI model is amount-first (received drives price), the inverse of the expected qty x price model.
- timestamp: 2026-10-28T12:22:00Z
  checked: Bitcoin cdc271c4 ledger vs row
  found: live buy rows +0.1 @79739 and +1.5 @79739 (09:46-09:47) yet holding quantity=0.5, buy=1000. No audit rows. buy-into-asset.ts (committed 18:28 same day) patches qty+buy correctly.
  implication: separate holding/ledger drift (overlaps .planning/debug/ledger-vs-asset-totals-mismatch.md); not the cause of 1000 but means transfer avg would still be wrong for this asset after fixing sell-into.

## Resolution

root_cause: |
Sell into New/Existing investment (convert_in) treats "Amount received" as the source of truth and derives the destination unit price from it: client derivedPrice = received / qty (swap-sell-tab.tsx:276-279, sent as destination.priceCents), server unit = priceCents ?? received / qty and writes it to BOTH buy_price_cents and current_price_cents (sell-holding.ts:334-342); Existing path books paid=received via buyMore. Selling 500 USD of "Test" into 0.5 BTC thus stored Bitcoin buy_price = 1000 USD. (1) Transfer is not miscomputing: transfer-asset.ts moves cost = src.buyPriceCents x qty, and the ledger renders amount/qty, so it faithfully shows the bad stored 1000. (2) The form duplicates quantity because the embedded HoldingFormFields (holding-sheet.tsx:1136, "Quantity bought") and swap-sell-tab's own linked Quantity/Buy-price pair (swap-sell-tab.tsx:520-552) both render; linking uses a single lastEdited flag so a hand-edited field gets overwritten.
fix:
verification:
files_changed: []
