---
status: testing
phase: 13-investments-type-based-groups-sell-convert-flow-realized-p-l
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md, 13-04-SUMMARY.md, 13-05-SUMMARY.md, 13-06-SUMMARY.md, 13-07-SUMMARY.md, 13-08-SUMMARY.md, 13-09-SUMMARY.md, 13-10-SUMMARY.md, 13-11-SUMMARY.md, 13-12-SUMMARY.md, 13-13-SUMMARY.md]
started: 2026-10-26T12:43:57Z
updated: 2026-10-27T10:05:00Z
---

## Current Test

number: 7
name: Sell part of a deposit
expected: |
  Sell a deposit leaving part of it. The deposit stays with the value left as its new principal, starting today (keeps the same rate); the Deposit header shows realized = all interest earned so far.
awaiting: paused — user stopped UAT at test 7 to redesign investments as assets with transactions (lots); tests 7-15 not run

## Tests

### 1. Cold Start Smoke Test
expected: Open https://budget-dev.madonzy.com on your phone (fresh load / pull to refresh). The app loads, you stay signed in, and Wallets → Investments shows your holdings with values — no error screen.
result: pass
note: app loaded with holdings; visual feedback logged under test 2

### 2. One group per investment type
expected: Wallets → Investments shows one header per type you hold (e.g. Stocks & ETFs, Crypto, Broker, Deposit, Cash…). Stocks and ETFs sit together under "Stocks & ETFs". A type with a single holding still has a header. Each header shows value and total P/L amount + %. Opening Add or Edit has no "Group" field.
result: issue
reported: "Visually it looks not fine because: have indentation before group name and showing p/l without tapping. When tapping, I like the amount of data, but I don't like how it's rendered. It's too messy and share is missing"
severity: major

### 3. Type block order
expected: Drag a type header (by its grip) above another. The order sticks after reload, and is the same for another member of the budget.
result: pass

### 4. Sell part of a holding → Out of investments
expected: Swipe a hand-valued holding (e.g. a broker) → Sell. Enter a "Value left" below the current value, choose "Out of investments", adjust "Amount received", "Record withdrawal". The row drops to the value left with the SAME P/L %; the type header gets a small "incl. realized +X" line.
result: issue
reported: "1. make \"sell everything\" more actionable, currently it's not very visible as action, but more like header. 2. I don't like the overview of \"row after sale\". Instead, I'd like to have a sum-up above the submit button that will show me what will happen before I submit, meaning how the current row will be reduced and how some other increased or created 3. Amount received and currency are on separate lines, I'd like those to be in one line"
severity: minor

### 5. Sell into a new investment (conversion)
expected: Sell → "Sell everything" → "New investment" → pick a type (e.g. Cash) and name it, set Amount received → "Record sale". The sold holding disappears, the new holding appears with that amount and 0 P/L; the realized gain stays visible (on the source type header, or under the Investments total if that type has no holdings left).
result: issue
reported: "I selected Crypto (Bitcon) as a destination. I can select quantity. At the same time I have amount received fileds. What is the reason o having those fields there? Aren't those are only suitable for cash/deposit transformation? You were suppose to analyze fields per type, not general"
severity: major

### 6. Sell into an existing investment
expected: Sell part of a holding → "Existing investment" → pick another holding in the same currency → "Record sale". The destination's value rises by the amount received, its P/L doesn't jump; the source header shows "incl. realized".
result: issue
reported: "when I select to sell to existing investment or to new investment, there must be buy price as field (disabled for existing investment, because it should be same as it was to support old items of that row), so user can see that he is converting with that price. For new investment user should be able to change quantity and price (changing one will change another one because the sold amount is locked by selecting how much of old row left. One more bug, when I'm trying in investment edit page edit the quantity, it adds to the history, but quantity actually doesn't change"
severity: major

### 7. Sell part of a deposit
expected: Sell a deposit leaving part of it. The deposit stays with the value left as its new principal, starting today (keeps the same rate); the Deposit header shows realized = all interest earned so far.
result: [pending]

### 8. Edit asks "What happened?"
expected: Edit a broker/savings holding and change its current value. A "What happened?" choice appears: Value changed (default) / Added money (on an increase) / Withdrew money (on a decrease, with Amount received + Date). The buy/deposited field is read-only. Saving books it: Added money keeps P/L the same; Withdrew money shows realized on the header like a sale.
result: [pending]

### 9. Bought more / Sold some
expected: Edit a crypto/stock holding and raise the quantity → "Bought more" with a prefilled "paid" amount; save raises quantity. Lower the quantity → button says "Sold some" and the Sell sheet opens with that quantity left.
result: [pending]

### 10. History with full undo
expected: Edit sheet → "History (n)" lists dated entries (Start · Automatic, Added, Withdrew, Converted out "to X"…), realized shown on sales. Deleting a sale (after the confirm) puts the holding back exactly as before and removes the realized line; deleting a conversion also takes the money back out of the other holding.
result: [pending]

### 11. Add with a past date
expected: Add investment shows a Date field (today by default, no future). Adding a holding with an old date lists "Added" on that date in its History.
result: [pending]

### 12. Delete a holding
expected: Swipe Delete → the confirm says it erases the holding and its entire history → confirm → gone after reload.
result: [pending]

### 13. Overview "without contributions"
expected: Overview → Investments with contributions excluded: moving money between investments (a sale into another holding) does not create a jump in the line; withdrawals reduce contributions.
result: [pending]

### 14. Real-data backfill (24 Oct broker → Erste)
expected: After entering the archived brokers with real dates and booking the 24 Oct move as Sell → New/Existing (and deleting the old fresh-money Erste entry), realized ≈ +182k zł shows (Broker header or Investments total) and the Overview "without contributions" line no longer jumps +275k on 24 Oct.
result: [pending]

### 15. Polish and Ukrainian
expected: Switch language to PL, then UK: Sell sheet, "What happened?", History and type headers read naturally, nothing cut off on the phone.
result: [pending]

## Summary

total: 15
passed: 2
issues: 4
pending: 9
skipped: 0

## Gaps

- truth: "Type group header reads like a holding row: no indent before the type name, P/L shown only on tap (like rows), and the tap sum-up is tidy and includes the type's share of the portfolio"
  status: failed
  reason: "User reported: Visually it looks not fine because: have indentation before group name and showing p/l without tapping. When tapping, I like the amount of data, but I don't like how it's rendered. It's too messy and share is missing"
  severity: major
  test: 2
  artifacts: []
  missing: []

- truth: "Sell sheet: 'Sell everything' reads as a clear action (not a header); a pre-submit sum-up above the submit button shows what will happen (source row reduced from → to, destination increased from → to or created with X) replacing the 'row after sale' preview; Amount received and its currency sit on one line"
  status: failed
  reason: "User reported: 1. make \"sell everything\" more actionable, currently it's not very visible as action, but more like header. 2. I don't like the overview of \"row after sale\". Instead, I'd like to have a sum-up above the submit button that will show me what will happen before I submit, meaning how the current row will be reduced and how some other increased or created 3. Amount received and currency are on separate lines, I'd like those to be in one line"
  severity: minor
  test: 4
  artifacts: []
  missing: []

- truth: "Sell destination fields are per destination type: a quantity destination (crypto/stocks/gold) asks 'Quantity bought' + 'Paid for it' (cost of the new units, = proceeds, prefilled with sold value); an amount destination (cash/broker/savings/deposit) asks one 'Amount received' — no generic 'Amount received' block duplicated alongside type fields"
  status: failed
  reason: "User reported: I selected Crypto (Bitcon) as a destination. I can select quantity. At the same time I have amount received fileds. What is the reason o having those fields there? Aren't those are only suitable for cash/deposit transformation? You were suppose to analyze fields per type, not general"
  severity: major
  test: 5
  artifacts: [apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx, apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx]
  missing: []

- truth: "Sell → New/Existing quantity destination shows a buy price field: Existing = destination's price, read-only, quantity derived from the locked sold amount; New = quantity and price both editable and linked (price × quantity = sold amount, locked by Value/Quantity left)"
  status: failed
  reason: "User reported: when I select to sell to existing investment or to new investment, there must be buy price as field (disabled for existing investment, because it should be same as it was to support old items of that row), so user can see that he is converting with that price. For new investment user should be able to change quantity and price (changing one will change another one because the sold amount is locked by selecting how much of old row left."
  severity: major
  test: 6
  artifacts: [apps/web/src/components/budgeting/wallets-tab/sell-sheet.tsx, apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx]
  missing: []

- truth: "Edit → change quantity → save: the holding's quantity actually changes, and the History entry matches it"
  status: failed
  reason: "User reported: when I'm trying in investment edit page edit the quantity, it adds to the history, but quantity actually doesn't change"
  severity: blocker
  test: 6
  artifacts: [apps/web/src/components/budgeting/wallets-tab/holding-sheet.tsx, apps/web/src/hooks/use-adjust-holding.ts, packages/investments/src/application/adjust-holding.ts]
  missing: []
  note: "suspect CR-01 (PATCH + /adjust fired concurrently; PATCH can overwrite quantity booked by adjust)"
