---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
plan: 21
subsystem: gate
tags: [verification, parity, perf]
key-files:
  created: []
  modified:
    - packages/platform/src/demo/manifest.ts
    - apps/api/test/routes/categories-currency.test.ts
requirements-completed: []
status: awaiting-human-verify
---

# 14-21 Summary: phase gate (Task 1) — Task 2 awaits the owner

## Gate results
| Gate | Result |
|------|--------|
| Backend `bun test --timeout 120000 packages apps/api/test tests` | **2349 pass / 2 fail**. The 2 failures are exactly the pre-phase baseline failures by name (`/scheduled-payments > POST in a foreign currency back-fills…` and one unnamed hook); no new failure. Baseline (e59691ac worktree): 2252 pass / 2 fail. |
| Web Vitest (`apps/web`, full) | 3064 pass / 34 skipped / 0 fail |
| E2E chromium + mobile `@tasks-redesign|@reserve-wallet-currency|@category-currency|@transaction-currency-default|@budget-currency-change|@overview-rebalance|@settings-profile|@phase8|@aggregate` | **127 passed, 3 flaky** (passed on retry: aggregate ownership share, category-archive header on mobile, reserve-rebalance undo on mobile — none touch Phase 14 code paths), `.last-run.json` status passed |
| `make ci-gate` (tenant-leak) | 80 pass / 0 fail (non-zero exit = the known coverage-threshold artifact); stack restored with `make dev`, `/en/health` 200 |
| `bun audit --audit-level=high` | exit 0 |
| Architecture guard `no-raw-converted-sum` | green |

## Gap found and fixed during the gate
- Demo manifest did not classify `categories.currency` / `category_reserve_adjustments.currency` → the demo refresh preflight aborts on unmanifested columns (6 demo tests red). Both now `RELABEL_CURRENCY` like the limit currencies (5307c768); worker rebuilt.
- categories-currency route test now seeds today's PLN→EUR rate when its DB has none (testcontainer env), never overwriting a real rate.

## Parity (dev DB, confirmed SPENDING, read-time `fx_convert` vs stored converted)
| Budget | ccy | rows | stored | read-time | delta | rows differing | foreign rows |
|---|---|---|---|---|---|---|---|
| a2372ac5 | PLN | 675 | 38,974,065 | 38,974,065 | 0 | 0 | 6 |
| d30ee8ca | PLN | 671 | 96,127,757 | 95,703,768 | −423,989 | 2 | 0 |
| d000…12a1 (demo clone) | PLN | 656 | 72,491,741 | 72,169,931 | −321,810 | 2 | 0 |
| d000…0001 (demo) | USD | 656 | 26,839,315 | 26,720,168 | −119,147 | 2 | 0 |
| d000…12b1 (demo) | UAH | 656 | 116,333,684 | 115,817,249 | −516,435 | 2 | 0 |
| d000…12a2 / 12b2 / 0002 (demo) | EUR | 645 | 87,228,662 | 87,228,662 | 0 | 0 | 0 |
| 9c9fa9d7, bc1cdcfa, dda3bfec, 0127567d | … | 37–83 | equal | equal | 0 | 0 | 0 |

The genuinely foreign rows (a2372ac5, 6 rows) match exactly. The only differences are **2 rows in d30ee8ca** (and their copies in the demo clones): `currency_original = PLN`, `amount_original = 1000.00 / 300.00`, but stored converted `4369.50 / 1170.39` at fx_rate 1 (2026-09-30 "tato", 2026-10-16 "dima podatki"; no audit rows). Read-time conversion trusts the original amount + currency (D-03), so these now count as 1000 / 300 PLN. **Owner decision needed:** were they paid in PLN (old totals inflated) or in a foreign currency with the wrong currency field (then fix the two rows' currency)?

## Perf (largest dev budget d30ee8ca, median of 5, as app_role, idle DB)
- Overview monthlyPlanned + monthlySpend + dailySpend: 96.6 ms → 149.1 ms
- Reserve positions: 69.6 ms → 72.2 ms
- Spendings summary (month 2026-11): 87 ms → 105–182 ms
All under the 500 ms gate.

## Task 2 (checkpoint:human-verify) — pending
Owner to verify a real budget PLN → EUR → PLN on the phone (steps in 14-21-PLAN.md).
