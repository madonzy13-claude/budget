---
phase: 14
slug: multi-currency-budgets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-03
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 14-RESEARCH.md "Validation Architecture", updated with the user decisions recorded after it (D-13 no tolerance, D-15..D-17).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (backend, DB tests need `infisical run --env=dev`), Vitest 4 + happy-dom (web), Playwright-BDD (E2E, Gherkin + Page Objects) |
| **Config file** | `bunfig.toml`, `apps/web/vitest.config.*`, `apps/web/playwright.config.ts` |
| **Quick run command** | `infisical run --env=dev -- bun test <new test file> packages/budgeting/test/ledger` ; web: `cd apps/web && bunx vitest run <file>` |
| **Full suite command** | `make test` ; `cd apps/web && bunx vitest run` ; `make test-e2e` (PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com) ; `make ci-gate` |
| **Estimated runtime** | quick ~20 s; Vitest ~90 s; E2E per feature 1–5 min |

---

## Sampling Rate

- **After every task commit:** the task's new test file + `bun test packages/budgeting/test/ledger`
- **After every plan wave:** `make test` + `cd apps/web && bunx vitest run`
- **Before `/gsd:verify-work`:** `make test`, Vitest, `make test-e2e` (multi-currency, reserves, tasks, spendings, settings features, desktop + mobile), `make ci-gate`, `bun audit --audit-level=high`, served-bundle check after `make build-web`
- **Max feedback latency:** 120 seconds (quick run)

---

## Per-Decision Verification Map

| Decision | Behavior | Test Type | Test (file) | Note |
|----------|----------|-----------|-------------|------|
| D-01 | PATCH default_currency 200 for owner with transactions; 403 non-owner; non-8 currency rejected; no `currency_locked`; better-auth path allows | API integration | `apps/api/test/routes/budget-identity.test.ts` (update), `packages/tenancy/test/default-currency-mutable.test.ts` (replaces `default-currency-immutable.test.ts`) | RED first: current test asserts 409 |
| D-02 | Totals in the new currency at each row's own-date rate; switching back restores exact originals; no raw SUM of `amount_converted_cents` remains | DB integration + architecture | `packages/budgeting/test/ledger/read-time-conversion.test.ts`, `apps/api/test/architecture/no-raw-converted-sum.test.ts`, `packages/budgeting/test/adapters/fx-convert-fn.test.ts` | per site: spendings summary, overview, home, cash flow, scheduled monthly, cushion, reserve fit |
| D-03 | List returns original amount/currency; ledger row unchanged by the currency PATCH; grid shows the currency suffix | API integration + Vitest | `apps/api/test/routes/transactions.test.ts`, `apps/web/test/foreign-amount.test.tsx` | row bytes identical before/after |
| D-04 | New category defaults to budget currency; explicit valid currency accepted; non-8 rejected | API integration + unit | `apps/api/test/routes/categories.test.ts`, `packages/budgeting/test/application/create-category-currency.test.ts` | |
| D-05 | Transaction without currency takes the category's; slider and quick entry default to it | unit + Vitest + E2E | `create-transaction-category-currency.test.ts`, `apps/web/test/transaction-slider-default-currency.test.tsx`, `multi-currency.feature` | |
| D-06 | After a budget currency change, existing categories keep theirs; a new one gets the new currency | API integration | `categories.test.ts` | |
| D-07 | Category currency change converts the limit at today's rate; past months untouched; transactions untouched; new tx default to new currency | DB integration + E2E | `packages/budgeting/test/application/change-category-currency.test.ts`, `multi-currency.feature` | |
| D-08 | Limit in another currency: current month latest rate; past month last rate within it; a later rate never moves a past month | DB integration | `packages/budgeting/test/overview/limit-rate-date.test.ts` | test clock for today |
| D-09 | RESERVE wallet created/updated in any currency; web currency cell editable | API integration + Vitest + E2E | `update-wallet-reserve-currency.test.ts`, `apps/web/test/wallet-row-reserve-currency.test.tsx` | RED: today `reserve_currency_mismatch` |
| D-10 | Reserve need is one amount per category currency | unit | `packages/budgeting/test/reserves/reserve-need-by-currency.test.ts` | golden PLN + EUR categories |
| D-11 / D-15 | Same-currency wallets cover first; currencies NET at today's rate (PLN +200, EUR −30 ≈ −130 PLN → no top-up, net +70 PLN surplus) | pure unit | `packages/budgeting/test/domain/reserve-settle.test.ts` | totals conserved; own-currency line independent of rate |
| D-12 / D-16 | Task and message list the remainder per currency; a currency with no wallet shows "≈" in the BUDGET currency, en/pl/uk | unit + Vitest + E2E | `recompute-reserve-topup-multi.test.ts`, `apps/web/test/task-banner-row-lines.test.tsx`, `tasks.feature` scenario | |
| D-13 | NO tolerance: any non-zero remainder (including a converted cross-currency one) raises the task; zero raises none | unit | `reserve-settle.test.ts` exactness cases | user decision 2026-11-03 |
| D-14 | Reserve wallets in two currencies: total = Σ converted (not raw sum) | DB integration | `packages/budgeting/test/adapters/reserves-summary-by-currency.test.ts` | RED first: 100 PLN + 100 EUR summed as 200 |
| D-17 | After a category currency change the reserve replays each past month in that month's currency; a leftover converts at the month's closing rate, an overspend at the date(s) of the transaction(s) past the limit (straddling tx: only the excess), adjustments at their own date; closed months never move | DB integration + pure unit | `packages/budgeting/test/reserves/reserve-replay-currency-change.test.ts` | golden numbers in the test |

*Status per row is tracked in the plans' tasks.*

---

## Wave 0 Requirements

- [ ] `fx-convert-fn.test.ts`, `read-time-conversion.test.ts`, `no-raw-converted-sum.test.ts` (RED before the conversion function/migration exists)
- [ ] Migration (next number after the latest in `drizzle/`) + `_journal.json` entry; backfill count assertions
- [ ] Seed helper for `fx_rates` rows in budgeting tests (worker role, exact UTC dates)
- [ ] `multi-currency.feature` + Page Object methods (budget currency select + confirm dialog, category currency picker, reserve wallet currency)
- [ ] Replace `default-currency-immutable.test.ts` and the stale `edit-transaction-currency-lock.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real budget re-expression after a currency change on the owner's live data | D-02 | Real history (back to 2022) cannot be reproduced in fixtures | On dev, switch a COPY of a real budget PLN → EUR → PLN; totals return exactly; spot-check one past month by hand |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
