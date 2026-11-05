---
quick_id: 261105-rse
status: complete
---

# Investments Buy/Sell fixes

- Hidden = `archived_at`. `investments-section` now passes visible + hidden holdings to SwapSheet and NewTransactionSheet. HoldingSheet adds `useHiddenHoldings` to its list, so a hidden pick turns Add into that asset's Buy and can act as a money source. The sale-destination combobox no longer drops archived names; the server already unhides a hidden destination.
- `field.quantity` and `swap.buy.quantity` → "Quantity bought" / "Kupiona ilość" / "Куплена кількість". Both keys are used only on buy surfaces.
- `useBuySource.priceFor(qtyBought)`: from a counted source, the buy price is the value of the sold units ÷ the quantity bought, converted to the buy currency at the sale date's rate. It is null while either quantity is missing. The Buy tab and Add form apply it through an effect until the price is typed; clearing the price hands it back. A failed FX lookup on a counted source now only means no fill, not an error line.
- Sell tab: an untyped destination price is always sold value ÷ quantity in the received currency, in any typing order and after later edits. This drops the one-shot `autoPrice` state. A price typed first still fills the quantity once.

## Verification

- 7 new tests failed on the old code and pass on the new.
- Full web Vitest: 3104 pass / 0 fail. tsc and eslint clean.
- Live on budget-dev after `make build-web`, Playwright on a seeded budget:
  - The "Quantity bought" label shows.
  - The hidden "Old Coin" is offered as a Buy source and as a Sell destination ("This reopens Old Coin").
  - Buy from AAA (1 of 2 units, 3,000 PLN total) with 3 bought gives a price of 500.
  - Sell 0.5 BBB into 2 units gives 25; changing the sold amount to 1 refills it to 50.

## Follow-up (user, same day)

- "You hold" (under Quantity sold) and "Total" (under Buy price) are now grouped with their field (`space-y-2`, as in Sell).
- Quantity bought ↔ buy price fill each other: the field you haven't typed follows sold value ÷ the one you typed, in the Buy tab, the Add form and Sell into investments. Once both are typed, neither changes; clearing a field hands it back. Sell's one-shot filler is gone.
- Two new tests failed on the old code and now pass; web Vitest 3107/0. Live on budget-dev:
  - Price 750 with 1 AAA sold gives quantity 2, and selling 2 instead gives 4.
  - "You hold" now sits about 10px under its field, the same as Sell.
