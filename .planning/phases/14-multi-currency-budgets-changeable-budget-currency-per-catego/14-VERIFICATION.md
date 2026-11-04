---
phase: 14-multi-currency-budgets-changeable-budget-currency-per-catego
verified: 2026-11-04T11:00:00Z
status: passed
score: 5/5 roadmap success criteria verified; 17/17 decisions (D-01..D-17) accounted for
overrides_applied: 0
human_verification:
  - test: "Confirm the E2E regression over the Phase 14 tags (chromium + mobile) that was started after 14-24 finished green"
    expected: ".last-run.json status passed; failures, if any, are only known flakes (Chromium SEGV, aggregate share, category-archive header mobile, rebalance undo mobile)"
    why_human: "The run was still going when this report was written. The last completed E2E evidence is from 14-21 (127 passed, 3 flaky), which is before the 14-22, 14-23 and 14-24 code changes."
---

# Phase 14: Multi-currency budgets Verification Report

**Phase Goal:** The budget currency can change at any time and every total re-expresses itself at historical rates, while each transaction keeps the currency it was entered in. Each spending category carries its own currency, and reserve wallets may be in any currency, with the reserve need and its top-up/withdraw tasks split per currency.
**Verified:** 2026-11-04
**Status:** human_needed (one pending item: the post-14-24 E2E result)
**Re-verification:** No, initial verification

## Goal Achievement

### Roadmap Success Criteria

| #   | Truth                                                                                                    | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Changing the budget currency (owner, any time) re-expresses every total; no total mixes currencies       | VERIFIED | `currency_locked` is gone from all source (grep: 0 hits outside a test that asserts its absence). `budget-identity.ts` PATCH applies `default_currency` and recomputes the RESERVE_TOPUP, income and cushion tasks. `better-auth-org.ts:55` has no lock. Read-time `budgeting.fx_convert` exists in 0104 (journal-registered) and is live in the dev DB. The architecture guard `no-raw-converted-sum.test.ts` passes, so no non-writer file sums `amount_converted_cents`. These multi-currency tests pass: overview, home summary, reserve-fit + wealth, budget-identity. |
| 2   | Old-currency transactions render with a suffix and keep their stored original                            | VERIFIED | The ledger is never rewritten. Conversion happens at read time from `amount_original_cents` + `currency_original` + date. The PLN→EUR→PLN round trip is tested lossless in the 14-06/14-08 tests. The owner approved the live round trip at the 14-21 checkpoint.                                                                                                                                                                                                                                                                                                           |
| 3   | A category's currency is set on create/edit; quick entry and the slider default to it                    | VERIFIED | `categories.currency` has 0 NULLs (222 rows), and every limit row matches its category's currency (0 mismatches). `transaction-slider.tsx:198-200` defaults to the category's currency, and `spendings-grid-client.tsx:89,951` does the same for quick entry. `category-slider.tsx:511` PATCHes `/categories/:id/currency` and `:805` shows the CurrencyPicker. `categories-currency.test.ts` and `category-slider-currency.test.tsx` pass.                                                                                                                                 |
| 4   | Reserve wallets can be in any currency; the reserve message and RESERVE_TOPUP state amounts per currency | VERIFIED | `reserve_currency_mismatch` is gone. `wallet-row.tsx:786` renders an editable CurrencyPicker on reserve rows. The pure `settleReserveByCurrency` covers own currency first (D-11), nets across currencies (D-15), compares exactly with `0n` (D-13), and adds an "≈" in the budget currency (D-16). It is wired into `get-reserve-positions.ts` and `update-wallet.ts`. `task-banner-row.tsx:95` renders `payload.lines`. `reserve-settle`, `reserve-settlement-task`, `task-banner-row-lines` and `reserves-table-row` tests pass.                                         |
| 5   | The reserve-wallet total converts other currencies (D-14)                                                | VERIFIED | `reserves-summary-repo.ts` now groups RESERVE wallets `GROUP BY currency` into `byCurrency`, and the settlement converts them. The single raw SUM is gone.                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Score:** 5/5

### Decision coverage (D-01..D-17, from 14-CONTEXT.md; REQUIREMENTS.md has no IDs for this phase)

| ID   | Plans                         | Status    | Evidence                                                                                               |
| ---- | ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| D-01 | 04, 19, 20, 21                | SATISFIED | Route and BA locks removed; the settings confirm dialog is at `budget-identity-section.tsx:91,214-225` |
| D-02 | 01, 06-10, 13, 19, 20, 22, 24 | SATISFIED | fx_convert read path; architecture guard green                                                         |
| D-03 | 06, 18, 19, 20, 22            | SATISFIED | Original amount and currency kept; suffix via FxAmount                                                 |
| D-04 | 01, 05, 17, 23                | SATISFIED | `categories_default_currency` trigger + create default                                                 |
| D-05 | 05, 18                        | SATISFIED | Slider and quick-entry default                                                                         |
| D-06 | 05, 17, 19, 20                | SATISFIED | Categories keep their currency on a budget change (category-currency-defaults test)                    |
| D-07 | 04, 16, 17, 22-24             | SATISFIED | PATCH currency converts the limit at today's rate; wants = normal − needs (WR-06)                      |
| D-08 | 01, 07-09, 18, 23, 24         | SATISFIED | limitRateDate = LEAST(month_end, today); CR-01 fixed                                                   |
| D-09 | 15                            | SATISFIED | Reserve wallet currency is editable on create and update                                               |
| D-10 | 01, 11, 13, 14, 22, 24        | SATISFIED | `engine.internalByCurrency` → needByCurrency                                                           |
| D-11 | 02, 12                        | SATISFIED | reserve-settle.ts                                                                                      |
| D-12 | 02, 04, 12-14, 22, 24         | SATISFIED | Per-currency `lines` in the payload and UI; WR-05 fixed                                                |
| D-13 | 02, 12                        | SATISFIED | Exact `0n` comparison, no tolerance                                                                    |
| D-14 | 12, 15                        | SATISFIED | Per-currency wallet totals                                                                             |
| D-15 | 02, 12, 14                    | SATISFIED | Signed net in the budget currency                                                                      |
| D-16 | 02, 04, 12-14                 | SATISFIED | `equiv` in the budget currency for a currency with no wallet                                           |
| D-17 | 01, 03, 11, 16, 23, 24        | SATISFIED | `reserve-month-conversion.ts` wired in `reserve-event-loader-repo.ts`; tests pass                      |

No orphaned IDs: every ID that appears in a plan's frontmatter maps to a decision in CONTEXT.

### Data / DB checks (live dev DB, psql as postgres)

| Check                                                 | Result                    |
| ----------------------------------------------------- | ------------------------- |
| `categories.currency` NULL                            | 0 / 222                   |
| `category_reserve_adjustments.currency` NULL          | 0                         |
| `fx_convert(10000,'PLN','PLN',today)`                 | 10000                     |
| `fx_convert(10000,'XXX','PLN',today)`                 | NULL (no fabricated rate) |
| Limit rows whose currency differs from the category's | 0 (WR-09)                 |

### Behavioral Spot-Checks (run by the verifier)

| Suite                                                                                                                                                                   | Result                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| guard + fx-round + reserve-settle (pure)                                                                                                                                | 16 pass / 0 fail           |
| reserve-month-conversion, reserve-engine-multimonth, categories-currency, budget-identity, fx-convert-fn (DB via infisical)                                             | 50 pass / 0 fail, no skips |
| home-summary / category-defaults / overview / reserve-fit-wealth multi-currency, wallet-patch, wallets, reserves, convert-to-category-currency, reserve-settlement-task | 46 pass / 0 fail           |
| Web Vitest: category-slider-currency, task-banner-row(-lines), budget-identity-currency, multi-currency-keys, wallet-row, reserves-table-row, transaction-slider        | 88 pass / 0 fail           |

The full-suite numbers (web 3075/0; backend 2372 pass / 2 baseline failures) came from the orchestrator and were not re-run here. The suites run here are consistent with them.

### Anti-Patterns / Notes

| File                                                         | Line    | Finding                                                                                                                                                                                                                                  | Severity |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| apps/api/src/routes/budget-identity.ts                       | 4, 66   | Stale comments: "currency change (locked after first transaction)" and "SETT-02 currency lock"                                                                                                                                           | Info     |
| packages/tenancy/src/contracts/api.ts                        | 8       | Stale comment: `default_currency ... immutable post-create (D-04)`                                                                                                                                                                       | Info     |
| apps/web/src/components/budgeting/wallets-tab/wallet-row.tsx | 15, 767 | Stale comment says the reserve currency is read-only; the code makes it editable                                                                                                                                                         | Info     |
| drizzle/0104_multi_currency.sql                              | 118-123 | `fx_convert` falls back to the EARLIEST rate when on_date is before all history. The plan truth said "most recent prior, else NULL". This is a reasonable choice (no fabricated rate, known pairs only) but it differs from the wording. | Info     |
| category-slider.tsx                                          | 573-583 | WR-02: currency change + limit write is not atomic (refetch on partial failure); deferred by the owner                                                                                                                                   | Info     |
| 14-REVIEW.md                                                 | -       | IN-01..IN-04 are open, by the owner's choice                                                                                                                                                                                             | Info     |

No TBD/FIXME/XXX debt markers in phase-modified source.

### Human Verification Required

1. **Post-14-24 E2E regression.** Confirm that the separately running E2E over the Phase 14 tags finished green, with only the known flakes. The last E2E evidence on record (14-21) predates the 14-22..14-24 changes.

The owner's live PLN → EUR → PLN check (the 14-21 checkpoint) was approved on 2026-11-04 and is not repeated here.

### Gaps Summary

No gaps. Every roadmap success criterion and every D-01..D-17 decision has code, wiring and passing tests behind it. The only open item is the post-14-24 E2E result, plus four stale comments that describe the removed currency locks.

---

_Verified: 2026-11-04_
_Verifier: Claude (gsd-verifier)_

## E2E (after 14-24, 2026-11-04)

Chromium + mobile over `@budget-currency-change|@category-currency|@reserves-multi-currency|@reserve-wallet-currency|@transaction-currency-default|@overview|@phase8|@reserves-golden`: **113 passed, 0 failed, 0 flaky** (21.0 min). The remaining human item is closed, so the status is now passed. The four stale "locked" comments were fixed in 8e7f3f97.
