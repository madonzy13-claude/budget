---
status: complete
phase: 05-reserves-wallets-tabs
discovered_regressions:
  - id: PH5-REGRESSION-01
    summary: /budgets/active routed to GET /budgets/:id because the latter (D-PH5-R11) was registered first; switcher always showed "No budgets yet"
    fix_commit: HEAD~1
    test_added: apps/api/test/routes/budgets.test.ts (GET /budgets/active priority guard)
discovered_polish_during_test2:
  - id: UAT-PH5-T2-01
    severity: cosmetic
    summary: DashedAddButton default border was 2px; user wants 1px (match add-category-column)
    fix: apps/web/src/components/common/dashed-add-button.tsx — `border` + plain muted-foreground
    test_added: apps/web/test/components/dashed-add-button.test.tsx (1px-not-2px guard)
  - id: UAT-PH5-T2-02
    severity: major
    summary: Wallets pill is now first; /budgets/[id] redirects to /wallets so it's the default landing tab; budget-card and budget-switcher route targets follow
    fix: apps/web/src/components/budgeting/bdp-tabs.tsx, .../budgets/[id]/page.tsx, budget-card.tsx, budget-switcher.tsx
    test_updated: bdp-tabs.test.tsx, budget-switcher.test.tsx
  - id: UAT-PH5-T2-03
    severity: major
    summary: Header "+" New budget button removed; "Create budget" item added at end of switcher dropdown; switcher hidden entirely when 0 budgets
    fix: apps/web/src/components/budgeting/top-nav.tsx, budget-switcher.tsx, deleted new-budget-button.tsx + test
    test_updated: budget-switcher.test.tsx (empty-state returns null, trailing CTA)
discovered_polish_during_test3:
  - id: UAT-PH5-T3-04
    severity: major
    summary: Wallets and Reserves tabs full-bleed on desktop; constrain to mx-auto max-w-[1280px] like Settings (Spendings keeps full width because it's a horizontally scrolling grid)
    fix: apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx, .../reserves/page.tsx — wrap client island in centered max-w container
  - id: UAT-PH5-T3-05
    severity: minor
    summary: Switcher dropdown Personal/Shared heading is noise when only one kind exists; suppress it
    fix: apps/web/src/components/budgeting/budget-switcher.tsx — pass heading={null} when single-kind; BudgetGroup omits the heading div on null
    test_added: budget-switcher.test.tsx — only-PRIVATE and only-SHARED single-kind suppression + mixed mode still shows both headings
  - id: UAT-PH5-T3-06
    severity: minor
    summary: Lock glyph removed from PRIVATE budgets in switcher trigger and rows; Users glyph still marks SHARED so the social affordance reads at a glance
    fix: apps/web/src/components/budgeting/budget-switcher.tsx — drop Lock import + conditional renders only Users on SHARED
    test_added: budget-switcher.test.tsx — no .lucide-lock anywhere in trigger or popover; SHARED rows still carry .lucide-users
  - id: UAT-PH5-T3-11
    severity: cosmetic
    summary: Editable cells now use cursor-text (I-beam) on hover instead of cursor-pointer
    fix: apps/web/src/components/common/inline-edit-cell.tsx
    test_added: inline-edit-cell.test.tsx — cursor-text on enabled cells, cursor-default when disabled
  - id: UAT-PH5-T3-12
    severity: minor
    summary: Wallet row no longer jumps width on hover — trash slot reserved in layout with invisible/group-hover:visible
    fix: apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx
    test_added: wallet-row.test.tsx — invisible + group-hover:visible, never `hidden`
  - id: UAT-PH5-T3-13
    severity: minor
    summary: Switcher polish — no leading spacer column on rows; checkmark only on selected; chevron-only trigger when no active budget; 20-char no-truncate label; active id derived client-side via usePathname
    fix: apps/web/src/components/budgeting/budget-switcher.tsx
    test_added: budget-switcher.test.tsx — chevron-only trigger, no Check anywhere when activeBudgetId null, path-derived active match for UUID budget, no leading spacer on inactive rows
  - id: UAT-PH5-T3-14
    severity: minor
    summary: Share column added per wallet — % of section total or em-dash when section sum is 0
    fix: apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx, wallet-section.tsx
    test_added: wallet-row.test.tsx — percent and em-dash branches
  - id: UAT-PH5-T3-15
    severity: major
    summary: Intra-section wallet reorder via drag (UAT-T3 sort within type)
    fix: drizzle/0021_phase05_uat_wallet_polish.sql (sort_order column); packages/budgeting/* (port, repo, contract, use case, factory wiring); apps/api/src/routes/wallets.ts (POST /wallets/reorder); apps/web/src/hooks/use-reorder-wallets.ts; wallet-row.tsx adds row-level droppable; wallets-sectioned-list.tsx detects row drops and calls reorder vs cross-section update
  - id: UAT-PH5-T3-16
    severity: major
    summary: Per-wallet color + icon picker (popover with 8 colors + 12 curated lucide icons); default null/null renders a dashed placeholder circle; selected icon renders in selected color
    fix: drizzle/0021_phase05_uat_wallet_polish.sql (color + icon columns); domain/repo/contract/use-case + factory; apps/web/src/components/budgeting/wallets-tab/wallet-customizer.tsx; hook + row integration
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
  - 05-06-SUMMARY.md
  - 05-07-SUMMARY.md
  - 05-08-SUMMARY.md
started: 2026-05-17T21:10:00Z
updated: 2026-05-17T21:10:00Z
test_user:
  email: uat-1779053383257@example.com
  password: TestPass123!
  app_url: http://claude-code.tail4b2401.ts.net:3000
  budget_id: fe588d41-2df3-4251-a0ec-84f8e513969c
  budget_name: UAT Phase5 EUR
  budget_currency: EUR
  wallets_url: http://claude-code.tail4b2401.ts.net:3000/budgets/fe588d41-2df3-4251-a0ec-84f8e513969c/wallets
  reserves_url: http://claude-code.tail4b2401.ts.net:3000/budgets/fe588d41-2df3-4251-a0ec-84f8e513969c/reserves
  seeded_categories: ["Groceries", "Housing"]
  seeded_wallets: ["Checking (SPENDINGS, EUR)", "Savings (RESERVE, EUR)"]
pre_uat_verification:
  e2e_phase5: 7/7 pass
  backend_phase5: 263/263 pass
  ci_gate_tenant_leak: 36/36 pass
  fixes_applied:
    - apps/web/test/hooks/use-update-wallet.test.tsx (stale toast assertion → component owns translated toast per D-PH5-W8)
    - packages/budgeting/test/account-domain.test.ts (canChangeCurrency rescinded per D-PH5-W12 — invariant moved to use-case layer)
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start — Sign in and reach a budget

expected: Sign in with UAT credentials, reach a workspace, open or create a budget, see BDP tab strip (Spendings + Wallets, plus Reserves if reservesEnabled). Test verifies the Phase 5 frame loads without errors after fresh login.
result: pass
verified_by: claude-playwright
notes: Initially blocked by PH5-REGRESSION-01 (/budgets/active routed to /:id, switcher showed "No budgets yet"). Fixed and verified — switcher lists both UAT budgets; opening the seeded budget loads BDP with Spendings + Reserves + Wallets + Settings pills and the two seeded categories.

### 2. Wallets tab loads with three sections (WALT-01)

expected: Click Wallets pill → /budgets/[id]/wallets. Page shows three section headers: Spendings, Reserve, Cushion. Each section can be empty or hold rows; section totals render with budget currency.
result: pass
verified_by: claude-playwright+user
notes: Surfaced 3 polish items (UAT-PH5-T2-01..03) — DashedAddButton 2px→1px, Wallets pill default, header "+" replaced by switcher CTA + null-when-empty. All shipped at HEAD; Vitest 36/36 across affected suites.

### 3. Add a Spendings wallet via staged-add (WALT-02, D-PH5-W9)

expected: Click +Add row in Spendings → an empty draft row appears inline with focused Name input. NO POST fires while typing. Type a name (e.g., "Checking"), blur the Name field → POST /wallets fires, the draft row promotes to a persisted row with the new id. Amount can be set in-line afterwards.
result: pass
verified_by: claude-playwright+user
notes: Staged-add verified live (POST 201 on blur). Wallet-tab polish converged through T3-04 → T3-23 covering pill order, max-width, switcher polish, color/icon picker, intra-section reorder, share column, cursor affordances, amount formatting, DragOverlay, section highlight, animation smoothness.

### 4. Inline-edit wallet name and amount (WALT-03)

expected: Click any wallet's Name cell → input becomes editable, value editable. Blur or press Enter → PATCH /wallets/:id fires, value persists. Same for the Amount cell — type a number, blur, value persists.
result: pass
verified_by: claude-playwright+user
notes: |
Verified live (PATCH /wallets/:id on blur+Enter). Polish loop landed
T3-23..T3-32: spendings-grid-style drag, cross-section ghost via
DragOverlay, mobile alignment with truncating name + dynamic
amount-column min-width (sectional `maxAmountChars`), comma decimal
separator (PL/UK locales, three-layer NaN guard in lib/cents-format

- use-update-wallet + amount editor), iPhone client-side exception
  resolved, switcher polish (no preselected row, yellow-dot active
  marker), iOS swipe-left → red Delete on mobile, rounded corners on
  every row at exactly wrapper width.

### 5. Drag a wallet across sections (WALT-05)

expected: Drag a Spendings wallet by its drag handle into Cushion. The row visibly moves between sections; PATCH /wallets/:id { walletType: 'CUSHION' } fires; section totals recalculate.
result: pass
verified_by: claude-playwright+user
notes: |
Pre-verified via Playwright pointer-event dispatch (dnd-kit
PointerSensor, activationConstraint distance 4). PATCH
/wallets/:id body {"walletType":"CUSHION"} → 200, row moved DOM
section, restore drag back worked. User polish item T3-33 raised
during this test: move toast was reading raw enum ("CUSHION");
fixed by wiring `bdp.tab.wallets.section.*` translation through
the toast {sectionLabel} interpolation. Now reads "Moved {name}
to Cushion wallets". reserve_currency_mismatch toast updated to
use the same humanized label.

### 6. Reserve-currency rejected snap-back (WALT-04, D-PH5-W8)

expected: On a non-USD budget (or whatever budget-currency this UAT user has), create a wallet with a DIFFERENT currency (e.g., USD wallet on a EUR budget), then drag it into the Reserve section. The drop is rejected: the wallet snaps back to its previous section and a toast appears saying the move was rejected because the reserve currency must match the budget currency.
result: pass
verified_by: claude-playwright+user
notes: |
USDTest wallet created in SPENDINGS with currency switched EUR→USD
via Radix Select (pointerdown/pointerup dispatch). Drag handle →
RESERVE: snap-back to SPENDINGS, no DB write, toast
"Reserve wallets must be in EUR. USDTest stayed in Spendings
wallets." — uses both budget currency + humanized
originalSectionLabel via T3-33 wiring.

### 7. Delete a wallet with confirm (WALT-07)

expected: Click the wallet row's delete icon → AlertDialog asks "Are you sure?". Confirm → wallet removed from the list (POST /wallets/:id/archive); cancel → wallet stays.
result: pass
verified_by: claude-playwright+user
notes: |
Core confirm/cancel/archive flow verified. Surfaced and shipped a
dense polish stack while iterating on the mobile swipe:
T3-31 — Popover no auto-focus, yellow dot vs Check glyph
T3-32 — initial mobile swipe-to-delete (CSS scroll-snap)
T3-33 — humanize section name in move toast
T3-34 — escape ICU apostrophes around {name}
T3-35 — translate raw i18n keys in 5 hooks; snap-back on cancel
T3-36 — :has(data-editing) overflow override + InlineEditCell blur
defers around Radix portals
T3-37 — yellow focus rings (replaced --info)
T3-38 — touch-action pan-y on cells; focus: not focus-visible
T3-39 — JS pointer swipe (replaced CSS scroll-snap)
T3-40 — native <select> on touch via CurrencyPicker; native pointer
listeners with passive:false; suppress click after swipe;
focus:shadow-none on QuickEntryInput
T3-41 — global iOS focus suppression in global.css (!important);
lazy useState detect + maxTouchPoints fallback
T3-42 — currency cell renders CurrencyPicker directly (no
InlineEditCell wrapper) for single-tap iOS picker open;
swipe-Delete opacity gated by |offset|
T3-43 — strip native select chrome to bare text; widen cell 36→44px
T3-44 — native option text = 3-letter code only (trigger mirrors it)

### 8. Reserves tab renders Active + Excluded sections (RSRV-01, W-3)

expected: Click Reserves pill → /budgets/[id]/reserves. Two sections: Active reserves and Excluded reserves. Each row shows category name, current reserve balance, share %, optional mismatch chip. Page uses a SINGLE GET /reserves call (no separate /categories fetch).
result: pass
verified_by: claude-playwright+user
notes: |
Polish stack landed alongside the core verification:
T3-45 — mobile column visibility, bare-number formatting via
centsToBare, floating footer card inset from edges,
extra pb-6 on mobile for home-indicator clearance
T3-46 — server-side FX enrichment: GET /wallets returns
currentBalanceInBudgetCurrencyCents (Frankfurter daily
cache, BigInt arithmetic scale 1e6). Share % now sums
to 100% across mixed-currency wallets in a single budget
currency
T3-47 — drop column header row, padding on MismatchChip,
currency rendered alongside footer totals
T3-48 — amount-first order ("17 EUR" not "EUR 17"); chip
whitespace-nowrap keeps "17 EUR" on one line

### 9. Inline-edit a reserve balance (RSRV-03)

expected: Click an active reserve row's Balance cell, change the number, blur. POST /budgets/:id/reserves/:categoryId/adjust fires with new target expectedCents (UAT-PH5-T3-54). Row updates; share + mismatch recompute.
result: pass
verified_by: claude-vitest+claude-playwright+user
notes: |
Pre-verification fixes applied to stale tests: - apps/api/test/routes/reserves-adjust.test.ts: added budgetCurrencyOf to adjustCategoryReserve deps (use case fails closed → 422 without it) - apps/web/test/hooks/use-update-reserve-adjustment.test.tsx: mocked next-intl useTranslations to namespace keys; replaced stale "invalidateQueries on success" assertion with "snap cache to server summary, no refetch" per UAT-PH5-T3-54 - tests/e2e/features/reserves/rebalance-via-inline-edit.feature: "EUR 200.00" → "200 EUR" per UAT-PH5-T3-48 amount-first order
Results: backend 8/8, frontend hook 5/5, e2e chromium + mobile pass. User confirmed live.

### 10. Drag a category to Excluded (RSRV-05, D-PH5-R10)

expected: Drag an Active reserve category row into the Excluded section. PATCH /budgets/:id/categories/:id/reserve-excluded { reserveExcluded: true } fires; row appears in Excluded with opacity-50 and em-dash share; totals recalculate without that balance.
result: pass
verified_by: claude-bun-test+claude-playwright+user
notes: |
Backend 4/4 (apps/api/test/routes/category-reserve-excluded.test.ts).
E2E tests/e2e/features/reserves/exclude-category.feature passes chromium —
feature amount strings updated to UAT-PH5-T3-48 amount-first order
("1,000 EUR", "700 EUR") and balance cell to bare "300" per centsToBare.

### 11. Restore a category from Excluded (RSRV-05)

expected: Drag a row from Excluded back to Active. PATCH reserve-excluded { reserveExcluded: false }; row appears in Active with frozen balance restored to live totals.
result: pass
verified_by: claude-playwright+user
notes: |
Covered by same e2e as test 10 (exclude-category.feature exercises
Active → Excluded → Active round-trip). User confirmed live in same
session as test 10.

### 12. Mismatch chip flips with edits (RSRV-04)

expected: When share math diverges (sum of reserve balances ≠ sum of reserve-wallet amounts), each row's mismatch chip is visible with variant indicating direction (over/under). Editing reserves or wallet amounts shifts the chip variant accordingly.
result: pass
verified_by: claude-vitest+claude-playwright+user
notes: |
Component 18/18 + e2e rebalance-via-inline-edit (chromium+mobile)
confirm reconciled → overfunded → underfunded variants flip on edit.
Surfaced polish stack UAT-PH5-T3-55 during live verification: - Dropped Actions column entirely from reserves table (header + row cell) - Removed "Active" section caption; moved column headers into Active
section as the first row above the rows - Excluded rows now render NAME ONLY — no balance cell, no em-dash
share (was "—" placeholder) - Mobile swipe-left action added per row: red "Exclude" on active
rows, info-blue "Restore" on excluded rows; DnD still works
(drag handle opts out of swipe pointer capture, mirrors wallet
swipe-delete pattern) - i18n: dropped column.actions; added row.{dragHandleAria,
swipeExcludeCta, swipeRestoreCta, excludeAria, restoreAria} - Tests: reserves-table-row 9/9, reserves-table-client-excluded
6/6, mismatch-chip + footer 18/18 (32 total reserves component) - E2E: exclude-category, rebalance-via-inline-edit,
share-math-and-zero-state, cross-tab-invalidation pass chromium
(feature strings updated to amount-first "300 (30%)", "500 EUR")
followup_polish:
UAT-PH5-T3-56:
severity: minor
summary: MismatchChip variants visually distinct so suggested action reads at a glance — overfunded uses --warning (amber) + ArrowUpFromLine + "+" prefix, underfunded uses --destructive (red) + ArrowDownToLine + "−" prefix, helper copy expanded ("Wallet has more money than reserves need…" / "Wallet doesn't have enough to cover reserves…").
fix: apps/web/src/components/budgeting/reserves-tab/mismatch-chip.tsx, apps/web/messages/en.json
test_updated: apps/web/test/components/mismatch-chip.test.tsx (sign prefix + per-variant color assertions)
UAT-PH5-T3-57:
severity: major
summary: Inline-edit reserve balance refused to save when user typed digits matching the raw cents string (e.g. 8 EUR → 800 EUR). Root cause - reserves-table-row passed row.reserveBalanceCents (cents string "800") as InlineEditCell value; the cell's Object.is equality check then collided with the user's draft "800" and short-circuited onCommit as no-op. Fixed by passing centsToBare(row.reserveBalanceCents) instead (mirrors the wallet-row pattern).
fix: apps/web/src/components/budgeting/reserves-tab/reserves-table-row.tsx
test_added: apps/web/test/components/reserves-table-row.test.tsx (8 EUR → 800 EUR regression — fireEvent change + Enter; asserts onUpdate(80000n) called once)

### 13. Cross-tab invalidation: wallet edit updates Reserves totals (D-PH5-E1)

expected: With both Wallets and Reserves tabs explored, edit a RESERVE-type wallet's amount in the Wallets tab. Switch to Reserves tab — Totals row reflects new wallet amount without manual refresh.
result: pass
verified_by: claude-playwright+user
notes: e2e tests/e2e/features/wallets/cross-tab-invalidation.feature chromium pass (feature strings updated to "500 EUR" / "1,000 EUR" amount-first order).

### 14. Cascading hide when Reserves disabled (D-PH5-CH1, surfaces 1+2+3+4)

expected: Toggle reserves_enabled=false. Verify: (a) Reserves pill gone from BDP tab strip; (b) Spendings grid Reserves-used column-header row hidden; (c) /reserves shows "Reserves disabled" notice; (d) Wallets tab Reserve section + add-reserve button hidden.
result: pass
verified_by: claude-vitest+claude-sql+user
notes: |
Pre-verification — 37/37 component tests across 4 surfaces: - Surface 1 (BDP tab strip): bdp-tabs.test.tsx existing reservesEnabled-true/false coverage - Surface 2 (Spendings grid Reserves row): column-header.test.tsx 3 new assertions added - Surface 3 (/reserves disabled notice): reserves-table-client-excluded.test.tsx existing - Surface 4 (Wallets Reserve section): NEW gap caught live by user — was rendering Reserve wallets even when reservesEnabled=false. Added prop threading: wallets page.tsx reads budget.reservesEnabled from /budgets/:id and passes to WalletsSectionedList; component filters the section types array to drop RESERVE when prop is false. wallets-sectioned-list.test.tsx +3 surface-4 assertions; existing test mock topped up with DragOverlay export.
Live verification — SQL flipped tenancy.budgets.reserves_enabled to false on UAT budget; user confirmed all 4 surfaces cascade-hide correctly; SQL flipped back to true.
followup_polish:
UAT-PH5-T3-58:
severity: major
summary: Cascading hide surface 4 — Reserve wallet section was visible on the Wallets tab even when reserves_enabled=false. Added the prop threading + filter.
fix: apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx, apps/web/src/components/budgeting/wallets-tab/wallets-sectioned-list.tsx
test_added: apps/web/test/components/wallets-sectioned-list.test.tsx (3 surface-4 assertions + DragOverlay mock)

### 15. Zero-state when no reserve wallets (RSRV-06, D-PH5-R4 — superseded by T3-61)

expected: On a budget with reserves enabled but ZERO reserve wallets, Reserves tab actual column renders "0" and share column renders "0%" (T3-61 superseded the em-dash zero-state — numeric baseline reads better). Zero actual is red when expected > 0 (underfunded signal) and white when expected = 0.
result: pass
verified_by: claude-vitest+claude-playwright+user
notes: |
Pre-verification: row tests 12/12 + e2e share-math-and-zero-state
chromium pass (feature strings updated to split-column + zero-state).
Heavy polish stack surfaced during this test (UAT-PH5-T3-59..T3-64):
followup_polish:
UAT-PH5-T3-59:
severity: major
summary: Archiving a RESERVE wallet did NOT recalc category reserve_actual_cents — last-wallet archive left lingering allocations and broke the share math. Fixed by mirroring setWalletBalance: archive-wallet now redistributes via applyWalletDelta(oldPool, oldPool - walletCents) when wallet.walletType=RESERVE.
fix: packages/budgeting/src/application/archive-wallet.ts, packages/budgeting/src/contracts/factory.ts (wired categoriesRepo + reserveBalanceRepo + reservesSummaryRepo deps)
test_added: packages/budgeting/test/application/reserves-use-cases.test.ts +3 archiveWallet describe scenarios (zero-out on last archive; bottom-up deduction on partial; SPENDINGS bypass) — 19/19 use-case tests pass.
UAT-PH5-T3-60:
severity: minor
summary: Actual column split into Actual + Share. Actual shows bare amount; Share shows percent. Both em-dash when sharePct null. i18n column.share="Share" added.
fix: apps/web/src/components/budgeting/reserves-tab/reserves-table-client.tsx (column headers), .../reserves-table-row.tsx (cells), apps/web/messages/en.json
test_updated: reserves-table-row.test.tsx (No actual / No share labels)
UAT-PH5-T3-61:
severity: minor
summary: Zero-wallet-pool branch now renders literal 0 and 0% instead of em-dash so user sees a numeric baseline (em-dash hid the deficit signal).
fix: reserves-table-row.tsx (sharePct===null → render 0 / 0% with Zero actual / Zero share aria labels)
test_updated: reserves-table-row.test.tsx (12/12 pass)
docs: tests/e2e/features/reserves/share-math-and-zero-state.feature scenario 2 updated to assert "0%" instead of "—"
UAT-PH5-T3-62:
severity: cosmetic
summary: Share column hidden on < sm viewports (mobile) — Actual amount already conveys relative weight at smaller widths.
fix: reserves-table-client.tsx column header (hidden sm:block sm:w-[80px]); reserves-table-row.tsx share cell same classes
UAT-PH5-T3-63:
severity: major
summary: Dragged reserve row was occluded by sibling rows during cross-section drag. First attempt put z-50 on the wrapper, but that created a parent stacking context that included the absolute swipe button and made dnd-kit's pointer-capture + auto-scroll laggy. Revised — z-index lives on the draggable inner div via inline style { position:relative, zIndex:50 } gated by isDragging, leaving the wrapper untouched.
fix: reserves-table-row.tsx
UAT-PH5-T3-64:
severity: minor
summary: Zero actual cell colours: red --destructive when expected > 0 (underfunded), --foreground (white) when expected = 0. Mirrors the populated-branch underfunded rule.
fix: reserves-table-row.tsx
test_added: reserves-table-row.test.tsx +2 zero-colour assertions

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
