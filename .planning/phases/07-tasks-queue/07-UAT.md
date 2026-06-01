---
status: testing
phase: 07-tasks-queue
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
  - 07-03-SUMMARY.md
  - 07-04-SUMMARY.md
  - 07-05-SUMMARY.md
  - 07-06-SUMMARY.md
  - 07-07-SUMMARY.md
  - 07-08-SUMMARY.md
  - 07-09-SUMMARY.md
  - 07-10-SUMMARY.md
started: 2026-05-31T17:25:00Z
updated: 2026-05-31T17:25:00Z
---

## Current Test

number: 2
name: RESERVE_TOPUP — emit → action → auto-resolve
expected: |
Wallets tab: change Savings balance to €60.00. Within ≤60 s a RESERVE_TOPUP
banner row appears at the top of the BDP with localized title
"Top up reserve by €60.00" and an active "Fix reserve" button. Clicking the
action button navigates to the Reserves tab with `?task=<id>` in the URL.
After increasing the category reserve in Reserves so Σ(category reserves)
matches Σ(wallet) (€60.00 across Groceries + Housing), the task disappears
from the banner within the next poll cycle (≤60 s).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test

expected: |
Docker stack starts cleanly; api/web/worker/db/mailpit all healthy;
/api/health returns 200; full @phase7 Playwright suite runs green against
the live stack.
result: pass
evidence: |

- `docker compose ps`: api/db/mailpit/web/worker all "Up (healthy)".
- `GET /api/health` → 200.
- 10/10 @phase7 chromium scenarios pass (27.9 s).
- No fatal errors in last 30 min of api/worker logs.

### 2. RESERVE_TOPUP — emit → action → auto-resolve

expected: |
Wallets tab: change Savings balance to €60.00. Within ≤60 s a RESERVE_TOPUP
banner row appears at the top of the BDP with localized title
"Top up reserve by €60.00" and an active "Fix reserve" button. Clicking the
action button navigates to the Reserves tab with `?task=<id>` in the URL.
After increasing the category reserve in Reserves so Σ(category reserves)
matches Σ(wallet) (€60.00 across Groceries + Housing), the task disappears
from the banner within the next poll cycle (≤60 s).
result: [pending]
machine_evidence: |
E2E scenarios PASS chromium (live stack):

- "RESERVE_TOPUP task shows correct title and routes to /reserves on action"
- "RESERVE_TOPUP task auto-resolves when reserve task is resolved server-side"

### 3. CUSHION_BELOW_TARGET — PATCH cushion_target_months + preview + deep-link

expected: |
Settings → Cushion: enable the master toggle if not already on, then change
`cushion_target_months` from 6 to 12. The preview line below the input
live-updates (required / actual / shortfall amounts) within a few seconds.
If shortfall > 0 a CUSHION_BELOW_TARGET banner row appears with localized
title "Cushion short by €<shortfall>" and an active "Top up cushion"
button. Clicking the action button navigates to the Wallets tab with the
cushion section visible and `focus=cushion` in the URL.
result: [pending]
machine_evidence: |
E2E scenarios PASS chromium (live stack):

- "CUSHION_BELOW_TARGET routes to /wallets with cushion focus on action"
- "CUSHION_BELOW_TARGET auto-resolves when resolved server-side"
- "Cushion target months input persists and is reflected in Settings"

### 4. CONFIRM_DRAFT — inline confirm UX

expected: |
Recurring rules: create a rule (e.g. "Rent", €1,000.00 monthly) and wait for
/ trigger the materialization worker. A CONFIRM_DRAFT banner row appears
with title containing "Rent" and "€1,000.00" and an active "Confirm draft"
button. Clicking the button shows an inline Loader2 spinner; on 200 the row
collapses optimistically and a success sonner toast appears; refreshing the
page confirms the draft is gone (i.e. the underlying expense_ledger draft
has `confirmed_at` set and the CONFIRM_DRAFT task is RESOLVED).
result: [pending]
machine_evidence: |
E2E scenarios PASS chromium (live stack):

- "CONFIRM_DRAFT task shows correct title and action label"
- "CONFIRM_DRAFT task auto-resolves when resolved server-side"

### 5. Full @phase7 E2E suite green

expected: |
`make test-e2e --grep @phase7` (or equivalent Playwright invocation against
the live dev stack) returns 10 passing / 0 failing.
result: pass
evidence: |
Ran `bunx playwright test --grep "@phase7" --project=chromium --reporter=list`
under `infisical run` against `PLAYWRIGHT_BASE_URL=http://claude-code.tail4b2401.ts.net:3000`.
Output:
10 passed (27.9s)

- Banner is absent from DOM when no pending tasks @phase7
- RESERVE_TOPUP shows correct title and routes to /reserves on action @phase7
- RESERVE_TOPUP auto-resolves when reserve task is resolved server-side @phase7
- CONFIRM_DRAFT shows correct title and action label @phase7
- CONFIRM_DRAFT auto-resolves when resolved server-side @phase7
- CUSHION_BELOW_TARGET routes to /wallets with cushion focus on action @phase7
- CUSHION_BELOW_TARGET auto-resolves when resolved server-side @phase7
- Two emit attempts for the same RESERVE_TOPUP shortfall produce one task @phase7 @skip-phase-07-debt
- Cushion target months input persists and is reflected in Settings @phase7
- Banner renders correctly on a phone-sized viewport @phase7

## Summary

total: 5
passed: 2
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

[none yet]

## UAT Credentials

```
URL:       http://claude-code.tail4b2401.ts.net:3000
Email:     uat-1780248221052@example.com
Password:  TestPass123!
Budget:    UAT Phase5 EUR (EUR)
BudgetId:  affaeedc-0641-4216-b37f-98c2db1afc0d
Wallets:   Checking (SPENDINGS), Savings (RESERVE)
Categories: Groceries, Housing
Reserves:  http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/reserves
Wallets:   http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/wallets
Settings:  http://claude-code.tail4b2401.ts.net:3000/budgets/affaeedc-0641-4216-b37f-98c2db1afc0d/settings
```
