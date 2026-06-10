---
status: complete
phase: 04-spendings-grid
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md]
started: 2026-05-14T08:55:00Z
updated: 2026-05-16T21:30:00Z
---

## Current Test

[testing complete — 16/17 pass, 1 skipped (Test 4 retry blocked by shared-stack)]

## Tests

### 1. Cold Start Smoke Test
expected: Kill stack, restart from scratch. db healthy, migrator runs migrations + exits 0, api healthy, web serves /en (307→locale). Spendings page renders grid with live data, no console/server errors.
result: pass

### 2. Spendings Grid Renders
expected: Open a budget's Spendings tab. Grid shows one column per category, each column header has a 5-row stack (name, planned, used, balance color-coded), QuickEntryInput at bottom. An "Add Category" dashed column sits at the end. Binance dark canvas, single yellow accent.
result: pass

### 3. Quick-Entry Transaction (GRID-05)
expected: Type an amount into a category's quick-entry input and press Enter. A transaction row appears at the top of that column immediately (optimistic), the column's used/balance figures update, and the input clears. Row settles (loses "unsent" state) once the API confirms.
result: pass

### 4. Quick-Entry Retry on Failure (D-PH4-Q1)
expected: If a quick-entry POST fails, the row shows a retry icon instead of silently dropping. Clicking retry re-sends; on success the row settles normally.
result: skipped
reason: Live UAT blocked by shared-stack concurrent process — query invalidations from another process refetch server state and wipe the optimistic-unsent row before the retry icon is observable. Retry path is covered by use-create-transaction onError logic, transaction-row unsent→RotateCcw retry handler, quick-entry-retry.feature E2E, and unsent-state unit tests. Retest live in a clean environment.

### 5. Drag-Reorder Category Columns (GRID-09)
expected: Grab a column header's grip handle and drag it to a new position. Columns reorder visually; the new order persists after a page reload (sort_index saved server-side).
result: pass
note: User found a bug — drag worked visually but order reset on reload. Root-caused + fixed (see Gaps). Confirmed working after fix.

### 6. Create Category (GRID-08)
expected: Click the "Add Category" column. A CategorySlider opens (480px desktop / full-width mobile) with name, icon picker, color picker, and optional limit fields. Saving adds a new category column to the grid.
result: pass
note: User found 5 bugs during UAT — all root-caused + fixed (see Gaps). Final tweak per user: a newly created category lands last (rightmost). Confirmed working after fixes.

### 7. Edit Category (GRID-03/04)
expected: Single-click the pen icon in a column header. The CategorySlider opens in edit mode pre-filled with that category's name/icon/color/limit. Saving updates the column header; setting a new limit creates an SCD-2 limit version.
result: pass
note: Self-test found a bug — edit-mode save silently did nothing (form schema rejected the decimal-prefilled amount fields). Root-caused + fixed (see Gaps). Re-verified live: opened Pets edit slider (prefilled name/planned/cushion), renamed to "Pets & Vet" + changed planned 60→75, saved → header renamed and planned row shows 75. User confirmed.

### 8. Month Navigation (GRID-10)
expected: Prev/Next buttons in the sticky month bar change the displayed month; the URL ?month param updates. Cmd/Ctrl+Arrow does the same. A "Today" button appears when not on the current month and returns to it.
result: pass
note: Self-tested via Playwright — Next May→June (?month=2026-06, Today button appeared); Prev June→May→April (URL updates each step); Cmd+ArrowRight April→May; Today June→May with Today button hidden on current month. No bugs. User confirmed.

### 9. Past-Month Entry (GRID-11)
expected: Navigate to a prior month and add a transaction via quick-entry. It saves with a date inside that month (not today), and appears under the correct month when navigating back and forth.
result: pass
note: Self-tested via Playwright — navigated to ?month=2026-04, added a 33.00 quick-entry expense to a category. Row appeared in April; absent in May view; persisted after navigating May→April. DB confirms transaction_date=2026-04-30 (last day of the viewed month, NOT today 2026-05-14). No bugs. User confirmed.

### 10. No Hover Reveal — Click-Only Actions (D-PH4-INT1)
expected: Hovering a transaction row does NOT reveal action chips. A single click on the row reveals pen/trash chips. Clicking elsewhere or pressing Escape collapses them. (Regression guard — hover reveal was a v1.0 bug.)
result: pass
note: Original click-only behaviour self-tested + confirmed by user. User then requested a deliberate interaction redesign for transaction rows (T16) — see ## Improvements. Re-verified live after T16.

### 11. Edit / Delete Transaction via Slider (GRID-06/07)
expected: Clicking the pen chip on a transaction opens TransactionSlider in edit mode (amount, date, FX preview). Saving updates the row. The trash chip / delete in the slider shows an AlertDialog confirmation before removing the transaction.
result: pass
note: Self-test surfaced 3 separate slider bugs (form prefill never populated, save sent the wrong body shape so the server silently no-op'd, no cache invalidation after save/delete) — all root-caused + fixed (see Gaps). Re-verified live: pen on the 42.50 row opens the slider prefilled (date 2026-05-14 / amount 42.50); changing amount → 50 and saving updated the row in place (txn-row-4250 → txn-row-5000); pen on 50, Delete in the slider shows the AlertDialog ("Delete transaction? This will permanently remove the transaction from 2026-05. This action cannot be undone."), Delete confirms → row removed, slider + dialog close.

### 12. Recurring Draft Confirm (RECR-03/04)
expected: A recurring rule's pending draft shows as a highlighted row with [Confirm][Edit][Dismiss] chips. Clicking Confirm transitions the draft into a normal confirmed transaction; the dashed highlight disappears.
result: pass
note: Multiple UX iterations during UAT — text chips → icon-only (yellow check, grey pen, red trash) so all three fit inside the narrow column; row opacity replaced with darker-than-column bg (#181c22) + grey text for the "tentative" cue; yellow dashed border removed; "To confirm" section label added above the drafts group (en/pl/uk). Self-tested + user confirmed.

### 13. Recurring Draft Edit + Promote (RECR-05)
expected: Double-clicking a draft row's amount (or using the Edit chip) opens an editor; changing the amount and confirming promotes the draft to a confirmed transaction with the new amount.
result: pass
note: Self-test found 1 backend bug + 2 UX gaps — all TDD-fixed (see Gaps). Inline edit now commits on Enter OR on blur; Escape cancels; unchanged value is a no-op (draft stays pending). User confirmed.

### 14. Recurring Draft Dismiss (RECR-06)
expected: Clicking Dismiss on a draft row removes that occurrence's row from the grid, but the underlying recurring rule stays active (future occurrences still generate).
result: pass
note: Self-test found 2 separate bugs blocking dismiss end-to-end (use-dismiss-draft res.json() on 204; listForMonth missing dismissed_at filter) — both TDD-fixed (see Gaps). Confirmed live: dismiss removes row immediately, recurring rule stays active=true.

### 15. Reserve Deduction Display (RSCM-03)
expected: When spending in a category exceeds its limit, the overflow draws from the reserve balance, and the column header reflects the reserve being drawn down in real time as transactions are added.
result: pass
note: Header row "reserves used" exists with a stable testid and updates in real-time via the same react-query invalidation as balance/overspent. Full live UAT of the reserve being drawn down requires Phase 5 reserves UI to seed an accumulated underspend balance — out of Phase 4 scope. Self-test + user confirmed real-time update path.

### 16. Overflow Cascade — Overspent Row (RSCM-04)
expected: When spending overflows past both the limit and available reserve, the column header shows an "overspent" state (color-coded balance row goes negative/red).
result: pass
note: UAT-Overflow planned 100, spent 120 → balance clamped 0, overspent row 20 in destructive red. Subsequent +30 cumulated overspent to 50 in real time. User confirmed.

### 17. Mobile Horizontal Scroll (GRID-13)
expected: On a 390px-wide viewport with many categories (8+), the grid scrolls horizontally; column widths stay readable and the layout does not break or wrap.
result: pass
note: 390×844 viewport — grid scrollWidth 1916 > clientWidth 390. Scroll-to-end reveals Add-category column at rightmost. Page body itself does not scroll horizontally. Self-test + user confirmed.

## Summary

total: 17
passed: 16
issues: 0
pending: 0
skipped: 1
blocked: 0

## Improvements

UI improvement workstream requested by the user during UAT. Each task: TDD
(red→green where logic), Playwright self-test on the Tailscale URL, then user
confirmation before the next. T1-T15 completed + confirmed; T16 self-tested,
awaiting confirmation. Full suite green (250/250 Vitest, typecheck clean).

- T1 — Spendings grid + month navigator centered; column header width = column width (was hardcoded 160px). Confirmed.
- T2 — `centsToBare()` formatter: all grid amounts bare (no currency symbol), `.00` dropped, non-zero fractions padded to 2dp. 6 callers swapped; `budgetCurrency` prop removed from ColumnHeader. Confirmed.
- T3 — QuickEntryInput moved above the transaction rows; separator + "expenses" title added above input; loader/retry icons given right margin. Confirmed.
- T4 — "balance" row relabelled "Left" (en/pl/uk). Confirmed.
- T5 — "Left" clamps to 0 when overspent (negative balance); overage stays on the overspent row. Confirmed.
- T6 — Add-category column responsive: width matches columns (`w-[140px] sm:w-[160px]`), stretches to column height. Confirmed.
- T7 — Hover tooltip on expense rows: locale-formatted date + note. Does NOT break D-PH4-INT1 (no hover-reveal of action chips). Confirmed.
- T10 — Top margin added between month bar and grid. Confirmed.
- T11 — "Saves as {date}" past-month note removed; `isPastMonth` prop chain cleaned up. Confirmed.
- T13 — Add-expense submits on blur as well as Enter (silent on invalid blur). Confirmed.
- T14 — Logout button is icon-only (text label removed; aria-label kept). Confirmed.
- T12 — Locale URL behaviour: `budget-locale` cookie carries the account locale; middleware redirects logged-in users to their account locale, logged-out users keep the URL locale. Language dropdown removed from logged-in header + sign-up form; `PublicLocaleSwitcher` (flags) added to public-page headers. URLs keep `/[locale]/` — no route restructure. Confirmed.
- T15 — BDP tabs (Spendings / Reserves / Wallets / Settings) centered (`bdp-tabs.tsx` — was left-aligned). Confirmed.
- T16 — Transaction-row interaction redesign requested during Test 10. (a) Reveal model changed from single-click to hover (hover-capable devices) / tap (touch) — `transaction-row.tsx` now manages `hovered`+`revealed` locally instead of `useRevealActions`; `useRevealActions` itself untouched (still used by column-header/draft-row). (b) Pen/trash chips get `cursor-pointer`. (c) Amount cell gets `cursor-text` while revealed. (d) Inline edit: desktop is a single click on the amount while hovering; touch is a double-tap on the amount (single tap toggles reveal only, no edit). (e) `commitEdit` only fires the PATCH when the amount actually changed; clearing the field or setting it to 0 deletes the row instead. (f) The pending/unsent status icon renders inline before the amount, only while in flight (user opted against a permanent placeholder slot — amount shifting right during pending is acceptable). (g) "balance" row label lowercased "Left" → "left" (en/pl/uk). TDD: `transaction-row.test.tsx` rewritten (hover reveals / mouseLeave hides / touch tap reveals / click-amount-when-revealed edits / double-click removed / commit-same=no-update / commit-changed=update / chips cursor-pointer), 32/32 in the row+reveal+header group, full suite 250/250, typecheck clean. Self-tested live via Playwright: hover shows chips (cursor pointer) + amount cursor text; mouseLeave hides; click amount → inline edit; 33→40 saved + grid updated; committing 40 unchanged fired no second PATCH; all 12 "left" labels lowercase. Touch tap-path covered by Vitest (MCP can't emulate no-hover). 2 follow-up defects (loader half-outside the column; row flickering out-and-back on save) root-caused + fixed (see Gaps). 2 follow-up tweaks: clearing or zeroing the inline-edit amount deletes the row; on touch, edit is reached via double-tap (single tap only toggles reveal). User confirmed.

Files touched: spendings-grid-client, month-navigator, column-header,
category-column, add-category-column, transaction-row, draft-row,
quick-entry-input, cents-format, sign-in-form, sign-up-form, sign-out-button,
locale-select, top-nav, middleware, (app)/layout, sign-in/page, sign-up/page,
en/pl/uk.json + new locale-cookie-sync, public-locale-switcher + test updates.
NOT yet committed.

## Gaps

- truth: "Editing/deleting a transaction via the slider works end-to-end — values are prefilled, save persists the change, delete asks for confirmation, the grid updates without a reload"
  status: fixed
  reason: "Self-test (Test 11): the pen chip opened the slider but date/amount/note were empty (date=today, amount blank). Editing and saving returned 200 OK but the underlying txn was unchanged. After dismissing the slider, the grid still showed the old amount."
  severity: major
  test: 11
  root_cause: "Three separate defects in TransactionSlider. (1) RHF defaultValues only run on first mount; the slider stays mounted with `open` toggled, so when the pen click set `initial` the form kept its first-mount defaults (today / empty). CategorySlider had the same bug and was already fixed; TransactionSlider had no equivalent reset(). (2) onSubmit built the PATCH/POST body in camelCase (`categoryId`, `date`, `amountOrig`, `currencyOrig`) but createSchema/patchSchema in apps/api/src/routes/transactions.ts expect snake_case with `amount_original_cents` as an integer. Zod `.optional()` silently dropped every unmatched key — the server received only `date` (which happened to be unchanged) and returned 200 OK without writing anything. (3) On success neither save nor delete invalidated the transactions/spendings-summary queries, so the cache kept showing the pre-edit row even when the server had been updated."
  artifacts:
    - path: "apps/web/src/components/budgeting/transaction-slider.tsx"
      issue: "no form.reset on open/initial change; onSubmit body in camelCase + decimal string; no query invalidation post-save/post-delete"
  fix: "(1) Added a useEffect on [open, initial?.txId] that calls form.reset(...) with current `initial` values. (2) Rewrote the onSubmit body to snake_case with `amount_original_cents` = Math.round(parseFloat(amountOrig) * 100). (3) Added `invalidateGrid()` (transactions + spendings-summary + drafts) and called it after both save and delete. TDD: apps/web/test/components/budgeting/transaction-slider.test.tsx — three new tests (prefill assertions, re-open-with-different-initial resets, save body shape is snake_case with integer cents). Red on the body-shape and reset tests → green after fixes. Self-tested live: edit 42.50→50 persisted (row testid 4250→5000), delete via the slider's AlertDialog removed the 50 row + closed both dialogs."

- truth: \"TransactionSlider works cleanly on a mobile (390px) viewport — fields don't overflow, iOS doesn't viewport-zoom, amount matches grid formatting, buttons are tappable, closing with unsaved edits asks for confirmation\"
  status: fixed
  reason: \"User reported (screenshot, iPhone 390px): date row too wide; currency picker overflowed (`U... US Dollar`); amount prefilled '36.00' instead of '36' (grid uses bare format); bottom buttons too short; AlertDialog cancel needed to keep the slider open; the close X stayed highlighted after programmatic focus; closing with dirty form discarded changes silently; tapping any field zoomed the iPhone viewport (same in CategorySlider).\"
  severity: minor
  test: 11
  root_cause: \"Several independent mobile-UX defects. (1) Date FormItem had no max-width → stretched across the form. (2) CurrencyPicker's SelectItem rendered code + localized name + symbol; Radix's auto-ItemText reflected all of it into the narrow w-32 trigger. (3) TransactionSlider used a centsToDecimal prefill helper (always two-decimal toFixed) — mismatched the grid's bare formatter. (4) Save/Delete buttons used `flex-1` inside a `flex-col-reverse` SheetFooter — flex-basis collapsed their vertical size on mobile (same issue we hit on CategorySlider). (5) ui/sheet.tsx SheetClose used `focus:*` not `focus-visible:*`, so the close X showed a ring whenever Radix programmatically focused it on open. (6) No discard-changes guard — Sheet's onOpenChange went straight to props.onOpenChange. (7) ui/input.tsx and ui/select.tsx triggers used `text-sm` (14px); iOS Safari force-zooms the viewport on focus when the input font-size is < 16px.\"
  artifacts:
    - path: \"apps/web/src/components/ui/input.tsx\"
      issue: \"text-sm (14px) triggers iOS Safari viewport zoom on focus\"
    - path: \"apps/web/src/components/ui/select.tsx\"
      issue: \"SelectTrigger text-sm — same iOS zoom\"
    - path: \"apps/web/src/components/ui/sheet.tsx\"
      issue: \"SheetClose used focus:* not focus-visible:* and a spurious data-[state=open]:bg-secondary highlight\"
    - path: \"apps/web/src/components/common/currency-picker.tsx\"
      issue: \"SelectValue reflected the full SelectItem (code + name + symbol) into the trigger\"
    - path: \"apps/web/src/components/budgeting/transaction-slider.tsx\"
      issue: \"centsToDecimal prefill; flex-1 buttons in flex-col-reverse footer; no discard-changes guard; no max-width on date row\"
  fix: \"Input + SelectTrigger now `text-base sm:text-sm` (16px on mobile, 14px on desktop) — fixes iOS zoom for every form in the app. SheetClose switched to `focus-visible:*` and dropped the data-state highlight. CurrencyPicker's SelectValue passes its own children (just the code) so the trigger shows only `USD`/`UAH` while the dropdown keeps the full name + symbol. transaction-slider gained a local centsToInputValue helper matching centsToBare (drops `.00`, pads non-zero fractions to 2dp); the date FormItem is capped at `max-w-[12rem]`; buttons are `h-12 w-full sm:flex-1` (matches CategorySlider). A `handleOpenChange` wrapper intercepts Sheet close and prompts via window.confirm(`grid.confirm.discardChanges`) when `form.formState.isDirty` and the close isn't already part of a submit/delete flow; Save/Delete bypass the prompt because they call props.onOpenChange directly. Self-tested live at 390×844: date width 192px; currency trigger 'USD'; amount prefilled '36'; save/delete buttons 48px tall; input font-size 16px; typing in the note then Escape with stubbed confirm() returning false kept the slider open, returning true closed it.\"

- truth: \"Cancelling the delete confirmation keeps the slider open; the trash chip on a transaction row asks for confirmation before deleting; the category slider's amount/cushion follow the grid's bare formatting rules\"
  status: fixed
  reason: \"User follow-up: (1) Clicking Cancel on the slider's Delete AlertDialog also closed the slider. (2) The trash chip on a transaction row (quick-edit) deleted immediately without confirmation. (3) The category slider's planned/cushion fields still showed `.00` instead of matching the grid's bare formatting.\"
  severity: minor
  test: 11
  root_cause: \"(1) The AlertDialog renders in its own portal. Radix Sheet's outside-detection treats clicks/escape inside the AlertDialog as 'outside the Sheet content', firing the Sheet's onOpenChange too — so the slider closed alongside the alert. (2) The trash chip on transaction-row called deleteMutation.mutate directly with no confirmation step. (3) category-slider still used the old toFixed-2 centsToDecimal helper for planned/cushion prefill — already replaced in transaction-slider but missed in category-slider.\"
  artifacts:
    - path: \"apps/web/src/components/budgeting/transaction-slider.tsx\"
      issue: \"SheetContent didn't guard outside-detection while AlertDialog was open\"
    - path: \"apps/web/src/components/budgeting/category-slider.tsx\"
      issue: \"same Sheet-vs-AlertDialog issue; bare-format prefill missing\"
    - path: \"apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx\"
      issue: \"trash chip deleted directly with no AlertDialog\"
  fix: \"(1) Both sliders' SheetContent now intercept onPointerDownOutside / onInteractOutside / onFocusOutside / onEscapeKeyDown while `deleteOpenRef.current`. The ref+useEffect pattern avoids stale-closure races; both sliders also gate `onOpenChange` itself with the same ref so any close attempt that bubbles up while the AlertDialog owns the interaction is rejected. (2) transaction-row now owns its own AlertDialog (same translation keys as the slider, `grid.confirm.deleteTxn.*`); the trash chip sets `deleteOpen=true`; the confirm action (testid `txn-row-delete-confirm`) calls deleteMutation. (3) category-slider's centsToDecimal helper rewritten to the same bare-format rules as transaction-slider (drops `.00`, pads non-zero fractions to two digits). (4) AlertDialog body now reads `grid.confirm.deleteTxn.body` = `\\\"This will permanently remove {amount} on {date}. This action cannot be undone.\\\"`; both sliders + transaction-row pass formatted amount-with-currency (centsToDisplay) and locale-formatted long date. (5) AlertDialogContent has `onOpenAutoFocus` that focuses the destructive Action button — Enter immediately confirms the delete. (6) quick-entry-input bumped to `text-base sm:text-sm` for the same iOS-zoom fix as the base Input. (7) public/manifest.json — `start_url` changed from the deleted `/en/workspaces` to `/`; the middleware redirects `/` to the user's locale, which lands on the budgets list (or sign-in if logged out) — fixes the 404 the user saw on iOS Add-to-Home-Screen. TDD: 46 slider+row tests pass; live-verified at 390×844: pen→Delete→Cancel kept the slider open; trash chip on 56.77 row showed `Delete transaction? This will permanently remove $56.77 on May 14, 2026.`, Enter on the AlertDialog deleted the row; quick-entry-travel input reads 16px font-size; manifest.json served at the root with the new start_url.\"

- truth: "After an inline amount edit the row updates in place — no flicker, status icon stays inside the column"
  status: fixed
  reason: "User reported (T16 follow-up): the pending loader sat half-outside the column; on save the row showed the loader, then visibly disappeared, then reappeared."
  severity: major
  test: 10
  root_cause: "Two defects. (1) The first no-jump attempt positioned the status icon `absolute right-full` — that placed it fully left of the amount span, which sits at the column's left edge, so the icon overflowed the column. (2) use-update-transaction.ts onSuccess spliced the raw API row into the cache as `{ ...serverRow, pending: false }`. The API serializes transactions to snake_case (serializeRow → amount_converted_cents, category_id, date), but the grid reads camelCase TxnDTO keys. The row object became pure snake_case, so TransactionRow read txn.amountConvertedCents === undefined and rendered blank ('disappeared'); the onSettled invalidation refetch then restored the proper camelCase DTO ('reappeared'). use-create-transaction already mapped via mapTxnRowToDTO — use-update-transaction did not."
  artifacts:
    - path: "apps/web/src/components/budgeting/spendings-grid/transaction-row.tsx"
      issue: "status icon positioned `absolute right-full` — overflows the column's left edge"
    - path: "apps/web/src/hooks/use-update-transaction.ts"
      issue: "onSuccess writes the raw snake_case API row into the camelCase-keyed cache"
  fix: "(1) transaction-row.tsx — status icon renders inline before the amount, conditionally (only while pending/unsent). The fixed-width leading slot from the first pass was removed per user feedback: a permanent placeholder was not wanted, the amount shifting right only while in flight is acceptable. Icon is part of the amount span so it stays inside the column. (2) use-update-transaction.ts onSuccess now maps serverRow through mapTxnRowToDTO before writing to the cache, matching use-create-transaction. TDD: new apps/web/test/hooks/use-update-transaction.test.tsx asserts the post-success cache row carries camelCase keys (amountConvertedCents/transactionDate) and not snake_case — red → green. Self-tested live: edited 55→62, sampled through the pending phase — row never went blank, the loader rendered inline inside the column during pending and cleared on settle."

- truth: "Signing in lands the user on a working page from which the budget / Spendings tab is reachable"
  status: fixed
  reason: "User reported: login to this account redirects to http://...:3000/uk/budgets with 404"
  severity: major
  test: 2
  root_cause: "sign-in-form.tsx:75 pushed to /${locale}/budgets — no page.tsx exists at app/[locale]/(app)/budgets/ (only [id]/ and new/ subroutes). Introduced by commit 61625c9 (Phase 01-04 workspace→budget rename). Correct post-sign-in target is /${locale}, the (app)/page.tsx home which is the budget-list landing."
  artifacts:
    - path: "apps/web/src/components/auth/sign-in-form.tsx"
      issue: "line 75 router.push to non-existent /budgets route"
  fix: "Changed router.push(`/${locale}/budgets`) → router.push(`/${locale}`). TDD: failing test added in apps/web/test/sign-in-form.test.tsx ('redirects to the locale home ... not the non-existent /budgets route'), red → green. Pre-existing Phase-01 auth bug, not Phase 4 code."
  note: "Account locale 'uk' is a separate observation — sign-up Display-language combobox default; not the reported 404 and not blocking. Flagged for user."

- truth: "Drag-reordering category columns persists — the new order survives a page reload"
  status: fixed
  reason: "User reported: drag-and-drop works but order resets (isn't saving)"
  severity: major
  test: 5
  root_cause: "use-reorder-categories.ts mutationFn called res.json() on the PUT /categories/sort-order response, which is 204 No Content. res.json() on an empty body throws — the mutation rejected, onError fired, and the optimistic order was rolled back. The reorder DID persist server-side (PUT returns 204, re-GET returns the new order); the client just treated success as failure."
  artifacts:
    - path: "apps/web/src/hooks/use-reorder-categories.ts"
      issue: "res.json() on a 204 No Content response throws"
  fix: "204 → return null (no body to parse). TDD: apps/web/test/hooks/use-reorder-categories.test.tsx — failing test for the 204-as-success case, red → green (2 tests). Verified end-to-end: persisted order survives reload."

- truth: "Saving the CategorySlider adds a new category column to the grid (correct planned amount, lands last)"
  status: fixed
  reason: "User reported during Test 6 UAT: create returned 422; new category didn't appear / planned showed 0; create button 20px tall on mobile; new category should land last (rightmost)."
  severity: major
  test: 6
  root_cause: "Five distinct defects: (1) decimalToCents returned a number but setLimitSchema requires z.string().regex(/^\\d+$/) — limits POST 422'd. (2) effectiveFrom was set to today's date; mid-month limits are invisible in the current month's as-of-month-start summary. (3) localCategoryOrder is useState-seeded and React Query initialData hydrates once — router.refresh() re-ran the RSC but neither state nor query cache updated, so the new column + its planned figure never showed. (4) footer buttons used flex-1 inside a flex-col-reverse container, making flex-basis the height → 20px-tall button on mobile. (5) create() INSERT omitted sort_index, so new categories defaulted to 0 and sorted first instead of last."
  artifacts:
    - path: "apps/web/src/components/budgeting/category-slider.tsx"
      issue: "decimalToCents returned number not string; effectiveFrom = today; missing router.refresh(); footer buttons flex-1 → collapsed height"
    - path: "apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx"
      issue: "localCategoryOrder + React Query caches hydrate once — not synced when RSC props change after router.refresh()"
    - path: "packages/budgeting/src/adapters/persistence/category-repo.ts"
      issue: "create() INSERT omitted sort_index — new categories sorted first, not last"
  fix: "(1) decimalToCents → returns String(...). (2) effectiveFrom → `${YYYY-MM}-01` month-start. (3) slider calls router.refresh() after close; grid useEffect syncs localCategoryOrder AND qc.setQueryData for spendings-summary/transactions/drafts from props. (4) buttons → h-12 w-full sm:flex-1. (5) create() INSERT now sets sort_index = (SELECT COALESCE(MAX(sort_index),-1)+1 ... WHERE tenant_id). TDD: category-slider.test.tsx, use-reorder-categories.test.tsx, categories-sort-order.test.ts ('create() assigns an incrementing sort_index') — all red → green. Self-tested via Playwright: created 'Pets' → appears rightmost, planned correct."

- truth: "Editing a category via the slider saves — the column header updates and a new SCD-2 limit version is created"
  status: fixed
  reason: "Self-test (Test 7): clicking Save in edit mode silently did nothing — slider stayed open, no PATCH/limits request fired."
  severity: major
  test: 7
  root_cause: "category-slider.tsx schema validated plannedCents/cushionCents with /^\\d+$/ (integer-only). The form fields actually hold the raw DECIMAL-string input — centsToDecimal prefills edit mode as e.g. '60.00'/'0.00'. The dot fails the integer-only regex, so zodResolver marks the form invalid and form.handleSubmit() never invokes onSubmit. Create mode happened to pass only because its default is '0' and integer typing stays dot-free; edit mode (and any decimal entry) was broken. Edit-mode submit was never covered by a test — only prefill assertions existed — so it slipped through."
  artifacts:
    - path: "apps/web/src/components/budgeting/category-slider.tsx"
      issue: "schema plannedCents/cushionCents regex /^\\d+$/ rejects the decimal strings the fields actually carry"
  fix: "Regex → /^\\d+(\\.\\d{1,2})?$/ (shared amountField), accepting both '60' and '60.00'. decimalToCents still converts to integer cents at submit. TDD: apps/web/test/components/budgeting/category-slider.test.tsx — new failing test 'edit mode: saving with prefilled decimal amounts submits PATCH + limits', red → green (16/16). Self-tested live via Playwright: renamed Pets→'Pets & Vet' + planned 60→75, saved → header renamed, planned row shows 75."

- truth: "Inline edit-and-promote on a draft persists the new amount (RECR-05 / D-PH4-INT5)"
  status: fixed
  reason: "Self-test (Test 13): typing a new amount in the inline editor and pressing Enter confirmed the draft at the ORIGINAL amount, not the typed value. Backend silently ignored amount_override_cents."
  severity: major
  test: 13
  root_cause: "Three-layer drop. (1) apps/api/src/routes/recurring-rules.ts confirm-draft handler never read the request body — called confirmDraft({tenantId, draftId, actorUserId}) only. (2) packages/budgeting/src/application/confirm-draft.ts ConfirmDraftInput interface had no amountOverrideCents field. (3) packages/budgeting/src/ports/expense-ledger-draft-port-repo.ts confirm() signature took no override; persistence adapter set confirmed_at = now() but left amount_original_cents / amount_converted_cents at the draft's seeded values. The frontend (use-confirm-draft + draft-row) was already wired to send {amount_override_cents}; the path stopped at the API edge."
  artifacts:
    - path: "apps/api/src/routes/recurring-rules.ts"
      issue: "POST /drafts/:draftId/confirm discarded request body; never read amount_override_cents"
    - path: "packages/budgeting/src/application/confirm-draft.ts"
      issue: "ConfirmDraftInput missing amountOverrideCents"
    - path: "packages/budgeting/src/ports/expense-ledger-draft-port-repo.ts"
      issue: "confirm() signature took only (tenantId, draftId, actorUserId)"
    - path: "packages/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo.ts"
      issue: "UPDATE only set confirmed_at; never touched amount columns"
  fix: "Threaded amountOverrideCents through the full chain: route parses body, validates (422 on negative/non-integer/non-finite), passes to confirmDraft → repo.confirm; persistence UPDATE conditionally sets amount_original_cents + amount_converted_cents in the same SQL when an override is supplied. TDD: apps/api/test/routes/recurring-drafts-confirm.test.ts — two new failing tests (with override → promotes at new amount; negative override → 422), red → green (7/7). Self-tested live + user confirmed: draft of 45 → typed 70 → DB row amount_original_cents=7000, balance dropped by 70 not 45."

- truth: "Inline draft edit commits on blur and ignores unchanged values (Test 13 follow-up)"
  status: fixed
  reason: "User feedback on first pass: blur on the inline editor was a no-op (had to press Enter explicitly), and submitting an unchanged value still confirmed the draft."
  severity: minor
  test: 13
  root_cause: "draft-row.tsx onKeyDown handled only Enter/Escape; the input had no onBlur. There was also no guard against the typed value matching draft.amountConvertedCents — a confirm always fired regardless."
  artifacts:
    - path: "apps/web/src/components/budgeting/spendings-grid/draft-row.tsx"
      issue: "no onBlur commit; no unchanged-value guard; risk of double-fire on Enter→blur"
  fix: "Extracted commitEdit() helper. Wired onBlur=commitEdit; Enter calls commitEdit; Escape sets cancelledRef → onBlur skips commit. committedRef guards against Enter→blur double-fire. commitEdit no-ops when parseDecimal(editValue) === parseInt(draft.amountConvertedCents,10) — closes the editor, leaves the draft pending. TDD: 3 new tests in apps/web/test/components/spendings-grid/draft-row.test.tsx (blur commits; Escape+blur does NOT commit; Enter+blur fires exactly once; unchanged value via Enter/blur does NOT confirm), 12/12 green."

- truth: "Dismissing a draft removes the row from the grid and the row stays gone after refetch"
  status: fixed
  reason: "User reported: clicking the trash chip had no visible effect."
  severity: major
  test: 14
  root_cause: "Two independent defects both producing the same symptom. (1) apps/web/src/hooks/use-dismiss-draft.ts (and use-confirm-draft.ts) called res.json() on the server's 204 No Content response; an empty body throws SyntaxError, the mutation rejected, and react-query silently rolled the cache back. Identical pattern to the use-reorder-categories bug fixed in Test 5. (2) Even when the API ran successfully (dismissed_at = now() in DB), the next GET /transactions?confirmed=false response still included the row — packages/budgeting/src/adapters/persistence/transaction-repo.ts listForMonth() filtered deleted_at IS NULL but NOT dismissed_at IS NULL — so the refetched drafts query brought the dismissed draft right back."
  artifacts:
    - path: "apps/web/src/hooks/use-dismiss-draft.ts"
      issue: "res.json() on a 204 No Content body throws → mutation rejected silently"
    - path: "apps/web/src/hooks/use-confirm-draft.ts"
      issue: "same 204→res.json() defect"
    - path: "packages/budgeting/src/adapters/persistence/transaction-repo.ts"
      issue: "listForMonth WHERE clause missing AND dismissed_at IS NULL"
  fix: "Both client hooks return null on success instead of parsing JSON (matches the route's 204 contract). listForMonth SQL gained AND dismissed_at IS NULL; the dismissed draft now disappears on refetch and stays gone across reloads. Self-tested live (Playwright MCP): tapped trash on a draft → row count dropped 3→2 immediately; refresh confirmed persistence."

- truth: "Draft visual cue reads as 'tentative / not yet confirmed' inside the column"
  status: fixed
  reason: "User UX feedback over several iterations: (a) action chips overflowed the column on mobile, with Dismiss obstructed by the adjacent column; (b) original opacity-60 cue made the row LIGHTER against the dark page rather than darker than the column; (c) the dashed yellow left border felt noisy once other cues were in place; (d) draft rows had no in-column section title to make their meaning explicit; (e) chips were unclear (text + colored bg); (f) draft amount font reused body color instead of muted."
  severity: minor
  test: 12
  root_cause: "Pure visual / IA polish — original D-PH4-R1/R2 contract over-indexed on the dashed border + text chips before the column-width constraint and dark-canvas contrast were considered."
  artifacts:
    - path: "apps/web/src/components/budgeting/spendings-grid/draft-row.tsx"
      issue: "text chips, full opacity reduction, yellow border, body-color amount"
    - path: "apps/web/src/components/budgeting/spendings-grid/category-column.tsx"
      issue: "drafts rendered above transactions; no section label; no top-shadow separator"
    - path: "apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx"
      issue: "grid wrapper used px-[var(--spacing-xl)] sm:px-[var(--spacing-md)] — both CSS vars undefined → 0 padding → columns flush against screen edges"
    - path: "apps/web/messages/en.json / pl.json / uk.json"
      issue: "missing draft.action.edit + draft.sectionTitle keys"
  fix: "(1) Chips → icon-only — Check (yellow var(--primary), h-5 w-5, strokeWidth=3), Pencil grey, Trash red var(--destructive); aria-label + title carry the words. All three fit inside the 160px column. (2) Opacity dropped; row bg = #181c22 (a step darker than column #1e2329, lighter than canvas #0b0e11) so the row reads as 'carved out' of the column. (3) Dashed yellow border removed entirely. (4) New 'To confirm' section header above the drafts group (en/pl/uk translated); first draft gets inset top shadow so the group sits visually beneath the confirmed rows; last confirmed row gets rounded-b-md when drafts follow. (5) Drafts always sorted oldest-due first and rendered at the bottom of the column. (6) Draft amount uses muted-foreground color; inline note alongside (truncated, hidden when chips revealed). (7) TransactionRow gained the same inline-note pattern next to amount (hidden on hover/tap reveal; tooltip still renders the note on hover). (8) Grid wrapper padding fixed: px-3 sm:px-6 (12px mobile, 24px desktop). TDD: draft-row.test.tsx updated (12/12 green including 'darker bg cue' assertion that replaced the dashed-border test); category-column.test.tsx still green (5/5)."
