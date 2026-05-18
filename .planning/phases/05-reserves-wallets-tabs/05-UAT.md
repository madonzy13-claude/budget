---
status: testing
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

number: 2
name: Wallets tab loads with three sections (WALT-01)
expected: |
Click Wallets pill → /budgets/[id]/wallets. Page shows three section
headers: Spendings, Reserve, Cushion. Seeded Checking wallet appears in
Spendings, seeded Savings wallet appears in Reserve. Section totals
render in EUR.
awaiting: user response

## Tests

### 1. Cold Start — Sign in and reach a budget

expected: Sign in with UAT credentials, reach a workspace, open or create a budget, see BDP tab strip (Spendings + Wallets, plus Reserves if reservesEnabled). Test verifies the Phase 5 frame loads without errors after fresh login.
result: pass
verified_by: claude-playwright
notes: Initially blocked by PH5-REGRESSION-01 (/budgets/active routed to /:id, switcher showed "No budgets yet"). Fixed and verified — switcher lists both UAT budgets; opening the seeded budget loads BDP with Spendings + Reserves + Wallets + Settings pills and the two seeded categories.

### 2. Wallets tab loads with three sections (WALT-01)

expected: Click Wallets pill → /budgets/[id]/wallets. Page shows three section headers: Spendings, Reserve, Cushion. Each section can be empty or hold rows; section totals render with budget currency.
result: [pending]

### 3. Add a Spendings wallet via staged-add (WALT-02, D-PH5-W9)

expected: Click +Add row in Spendings → an empty draft row appears inline with focused Name input. NO POST fires while typing. Type a name (e.g., "Checking"), blur the Name field → POST /wallets fires, the draft row promotes to a persisted row with the new id. Amount can be set in-line afterwards.
result: [pending]

### 4. Inline-edit wallet name and amount (WALT-03)

expected: Click any wallet's Name cell → input becomes editable, value editable. Blur or press Enter → PATCH /wallets/:id fires, value persists. Same for the Amount cell — type a number, blur, value persists.
result: [pending]

### 5. Drag a wallet across sections (WALT-05)

expected: Drag a Spendings wallet by its drag handle into Cushion. The row visibly moves between sections; PATCH /wallets/:id { walletType: 'CUSHION' } fires; section totals recalculate.
result: [pending]

### 6. Reserve-currency rejected snap-back (WALT-04, D-PH5-W8)

expected: On a non-USD budget (or whatever budget-currency this UAT user has), create a wallet with a DIFFERENT currency (e.g., USD wallet on a EUR budget), then drag it into the Reserve section. The drop is rejected: the wallet snaps back to its previous section and a toast appears saying the move was rejected because the reserve currency must match the budget currency.
result: [pending]

### 7. Delete a wallet with confirm (WALT-07)

expected: Click the wallet row's delete icon → AlertDialog asks "Are you sure?". Confirm → wallet removed from the list (POST /wallets/:id/archive); cancel → wallet stays.
result: [pending]

### 8. Reserves tab renders Active + Excluded sections (RSRV-01, W-3)

expected: Click Reserves pill → /budgets/[id]/reserves. Two sections: Active reserves and Excluded reserves. Each row shows category name, current reserve balance, share %, optional mismatch chip. Page uses a SINGLE GET /reserves call (no separate /categories fetch).
result: [pending]

### 9. Inline-edit a reserve balance (RSRV-03)

expected: Click an active reserve row's Balance cell, change the number, blur. POST /reserves/:categoryId/adjust fires with the delta (newBalance − currentBalance). The row updates; share column recalculates.
result: [pending]

### 10. Drag a category to Excluded (RSRV-05, D-PH5-R10)

expected: Drag an Active reserve category row into the Excluded section. PATCH /budgets/:id/categories/:id/reserve-excluded { reserveExcluded: true } fires; the row appears in Excluded with opacity-50 and em-dash share; totals (in non-excluded section) recalculate WITHOUT that category's balance.
result: [pending]

### 11. Restore a category from Excluded (RSRV-05)

expected: Drag a row from Excluded back to Active. PATCH reserve-excluded { reserveExcluded: false }; row appears in Active with its frozen balance restored to the live totals.
result: [pending]

### 12. Mismatch chip flips with edits (RSRV-04)

expected: When share math diverges (sum of reserve balances ≠ sum of reserve-wallet amounts), each row's mismatch chip is visible with variant indicating direction (over/under). Editing reserves or wallet amounts shifts the chip variant accordingly.
result: [pending]

### 13. Cross-tab invalidation: wallet edit updates Reserves totals (D-PH5-E1)

expected: With both Wallets and Reserves tabs explored, edit a RESERVE-type wallet's amount in the Wallets tab. Switch to Reserves tab — the Totals row reflects the new wallet amount without a manual refresh.
result: [pending]

### 14. Cascading hide when Reserves disabled (D-PH5-CH1, surfaces 1+2)

expected: Toggle reserves_enabled=false for this budget (via settings UI if available, or expect this is already false on a second test budget). Verify: (a) Reserves pill disappears from the BDP tab strip; (b) On the Spendings grid, the Reserves column header row (row 4) is hidden; (c) Direct navigation to /budgets/[id]/reserves shows a "Reserves disabled" notice.
result: [pending]

### 15. Em-dash zero state when no reserve wallets (RSRV-06, D-PH5-R4)

expected: On a budget with reserves enabled but ZERO reserve wallets, the Reserves tab shows share column rendered as "—" (em-dash) instead of percentages, since 0 share has no meaning. No crashes; rows still listed.
result: [pending]

## Summary

total: 15
passed: 1
issues: 0
pending: 14
skipped: 0
blocked: 0

## Gaps

[none yet]
