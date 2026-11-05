---
status: complete
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
source: [14-01-SUMMARY.md … 14-25-SUMMARY.md]
started: 2026-11-04T21:25:41Z
updated: 2026-11-05T10:00:43Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test

expected: Restart the stack (make dev-build or restart api/worker/web). Migrations 0104/0105 apply cleanly, app boots, https://budget-dev.madonzy.com opens your budget and the Spendings grid loads with real data.
result: pass
note: run by Claude on user request — migrator rebuilt + migrate complete (106 migrations, converted_from + fx_convert present); api/worker/web rebuilt + recreated, all healthy; /api/health 200, /en/health 200; no errors in logs; FX history backfill ran at boot (8 currencies, 1999-12-31..2026-11-05).

### 2. Change budget currency (owner)

expected: Settings → identity, pick another currency → confirm dialog appears. After confirm, totals show in the new currency ("Totals are shown in this currency."); old spendings keep their own currency sign; survives reload. Cancel changes nothing. A non-owner member cannot change it.
result: pass

### 3. Category currency change in latest month

expected: Open a category in the current month, change its currency without touching the amount → limit converts at today's rate. This and later months use the new currency; earlier months keep their old currency and figures exactly. No "Limit converts at today's rate…" hint is shown.
result: pass

### 4. Category currency change in a past month

expected: Switch to a past month, change a category's currency → only that month changes. That month's column shows limit, spent, reserve used, overspent and reserve cap all in that month's currency. Other months untouched.
result: pass

### 5. Past month with no limit + error messages

expected: In a past month where the category had no limit (e.g. "My category", September) changing currency works, and a limit saved afterwards is accepted. If a save fails, the toast says what went wrong and asks to report or try later (not "Check your connection").
result: pass
note: "no error, saves correctly" (failure toast path not triggered; covered by Vitest)

### 6. Typed amount kept on currency change

expected: Open category form, type a new limit amount, then change currency in the same open form → the typed amount is NOT converted. If you change currency without editing the amount, it IS converted.
result: pass

### 7. New spendings default to category currency

expected: Quick entry in a column and the transaction slider default to the category's (month's) currency; saved spending shows in that currency.
result: pass

### 8. Round trip is exact

expected: Change a category USD → EUR → USD (same month, amount untouched) → the limit returns to the exact original amount, no rounding drift.
result: pass

### 9. Reserve wallets in several currencies

expected: Reserve wallets can each have their own currency; the reserves section total is shown in the budget currency at today's rate.
result: pass

### 10. Multi-currency reserve top-up task

expected: Tasks shows a reserve top-up/withdraw per currency, e.g. "Top up reserve by 0.68 EUR and 0.05 PLN"; the task resolves only when every currency line is settled.
result: pass

### 11. Overview charts in category currency

expected: Planned pie, "How far off the average limit", "How much each limit should change", "Is each reserve the right size?" and the rebalance dialog label each category in its own currency, while bar/slice sizes stay proportional (compared in budget currency).
result: pass

### 12. Limit-only month leaves its leftover

expected: Add a limit to a past month with no spending (e.g. 500 zł in September) → October's reserve immediately grows by the unused amount, without adding any transaction.
result: issue
reported: "I added in may limit 500 uah, but I don't see the reserve in july. Budget : Test, cat: My category" — corrected: "I was suppose to say that june doesn't show reserve while there's leftover in may"
severity: major

## Summary

total: 12
passed: 11
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "A limit-only past month's leftover shows as reserve in every following month without a transaction"
  status: failed
  reason: "User reported: June doesn't show reserve while there's leftover in May (Test budget, My category; May limit 500 UAH)"
  severity: major
  test: 12
  root_cause: "reserveEngine emitted per-month cells only for months a category had a limit or spending in; a gap month (June: no limit, no spend) had no cell, so the summary read reserve 0."
  artifacts: [packages/budgeting/src/domain/reserve-engine.ts, packages/budgeting/test/reserves/limit-only-month-accrues.test.ts]
  missing: []
  fix: "691cb970 — cells run from the category's first month to the open month; a month with no R snapshot holds the last one. Test red first (cell undefined), green after. Backend 2384 pass + 2 baseline fails. Live: Test/My category June = 0 / 500 UAH. api+worker rebuilt; reserve/currency/rebalance/tasks E2E chromium+mobile 62 passed, 0 failed. Awaiting owner re-check of June."
  diagnosis_notes: |
  Read-only replay of Test budget d894ba76 / My category (May 500 UAH only, June no limit, July 300 PLN only):
  API summary July = reserve 0 / 42.02 PLN (≈ 500 UAH) — server data correct.
  June = 0 / 0 — gap month (no limit, no spend) gets no engine cell, so the carried reserve reads 0. Real bug.
