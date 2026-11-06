---
quick_id: 261106-9g9
status: complete
---
# Quick 261106-9g9: summary

- **The amount opens the sheet.** `InvestmentRow`: every amount (`holding-amount-{id}`, and `asset-value-amount-{id}` on an opened phone row) is `editable-dots` with role=button. A tap or Enter opens the asset's sheet and does not toggle the row. Automatic amounts keep their hover tip.
- **Inline value editor removed.** Its replacement is the Details tab. The typed-total-for-a-multi-unit-asset convenience (261023) goes with it: Details edits the unit price of a quantity asset. The two E2E scenarios for it were removed.
- **Sheet tabs.** `SwapSheet` tabs are now Details · Buy · Sell · Transfer, and the sheet opens on Details. A deposit gets Details · Sell. The title is the asset's name; `swap.sellTitle` is removed. On a phone the tabs size to their labels, so pl/uk fit at 360px.
- **Edit form.** `EditAssetSheet` became `EditAssetForm` (no Sheet wrapper; `onDone` closes the parent sheet).
- **Row actions.** Swipe and the desktop toolbar drop Edit and ↕; `ACTION_W` is now 68. The section lost its edit state, the inline save and the `EditAssetSheet` render.
- **i18n.** Added `swap.tab.details`: Details / Szczegóły / Деталі.
- **Tests.**
  - RED: 13 failing on the old code. Commits 75eb6ac8 (RED), 2acc77a4 (GREEN), then the tab-fit fix.
  - Web Vitest 3100/0; investments 416/0. tsc and eslint clean.
  - E2E steps, page object and features were updated, and bddgen passes. The E2E suite was not run.
- **Live on budget-dev (Playwright):**
  - Phone 390 and desktop 1280: the amount is dotted (`dotted/underline`); a tap opens the sheet on Details; saving value 1200 shows 1,200.
  - The opened phone row's amount opens the sheet.
  - The removed buttons are absent.
  - At 360px, all four tab labels fit in pl, uk and en.
