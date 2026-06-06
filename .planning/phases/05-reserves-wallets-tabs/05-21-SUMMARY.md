---
phase: 05
plan: 21
subsystem: budgeting / recurring-engine / fx
tags: [fx, recurring-drafts, rls, data-fix, guard, live-data]
requires:
  - FrankfurterFxProvider (real FX, cache-then-live-then-prior)
  - worker recurring-engine (draft generation INSERT path)
  - app_role tenant-isolation RLS + column UPDATE grant on expense_ledger
provides:
  - re-converted unconfirmed recurring drafts (budget-currency-locked)
  - InMemoryFxProvider cross-currency throw guard
  - scripts/backfill-recurring-draft-fx.ts (idempotent operator data-fix)
affects:
  - packages/shared-kernel/src/ports/fx-provider.ts
  - packages/shared-kernel/test/ports.test.ts
  - drizzle/0031_backfill_recurring_draft_currency.sql (neutralized)
tech-stack:
  added: []
  patterns:
    - "stub fail-closed: InMemoryFxProvider throws on unseeded cross-currency"
    - "RLS-safe backfill via app_role tenant context (no FORCE-RLS toggle)"
    - "re-derive corrupted rows from the upstream source of truth (the rule)"
key-files:
  created:
    - scripts/backfill-recurring-draft-fx.ts
  modified:
    - packages/shared-kernel/src/ports/fx-provider.ts
    - packages/shared-kernel/test/ports.test.ts
    - drizzle/0031_backfill_recurring_draft_currency.sql
decisions:
  - "Trust the RULE, not the draft: 0031 corrupted draft.currency_original, so re-conversion reads rule.amount + rule.currency."
  - "Backfill UPDATE runs as app_role inside withTenantTx (per-tenant GUC) — app_role holds column UPDATE on the append-only ledger; FORCE RLS untouched."
  - "Guard fails closed: stub THROWS on unseeded cross-currency (kills the rate-1 leak) but still returns 1 for same-currency."
  - "Neutralized 0031 to a no-op tombstone so a fresh-DB rebuild cannot re-introduce the relabel corruption."
  - "Backfill script kept (idempotent operator tool); STEP-1 verification script was run-and-deleted."
metrics:
  duration: ~50m
  completed: 2026-06-06
---

# Phase 5 Plan 21: Recurring-Draft FX Re-conversion + Stub Guard Summary

Re-converted 47 unconfirmed recurring drafts that the `InMemoryFxProvider` stub had
leaked into generation at `fx_rate = 1` (foreign amount stored as budget currency),
repaired migration 0031's `currency_original` corruption by re-deriving from the rule,
and made the stub fail-closed so a rate-1 cross-currency value can never reach a write
path again. FORCE RLS untouched throughout.

## STEP 1 — Verified generation actually converts (real path)

Seeded a throwaway EUR-budget tenant + a 3500 PLN MONTHLY rule due on a date with a
cached PLN→EUR rate, ran the worker `runRecurringEngine({ fxProvider: REAL Frankfurter })`,
read the generated draft, then cleaned up.

- Cached PLN→EUR = **0.23623** as of 2026-06-06.
- Generated draft: `currency_original=EUR`, `amount_original_cents=82681`,
  `amount_converted_cents=82681`, `fx_rate=1`, `fx_as_of=2026-06-06`.
- **82681 cents = 826.81 EUR** = 3500 PLN × 0.23623. NOT the bug value (350000 / rate 1).
- **VERDICT: generation CONVERTS.** Prod paths (inline catch-up + worker cron) are sound;
  the bad drafts are purely the pre-wiring stub leak. Throwaway tenant/rule/draft removed
  (verified 0 residue).

## STEP 2 — Re-conversion backfill (script, not SQL)

`scripts/backfill-recurring-draft-fx.ts` — `withInfraTx` (worker_role
`recurring_rules_worker_cron_scan` policy) enumerates the 518 tenants owning rules, then
PER TENANT `withTenantTx` (app_role + `app.tenant_ids`/`app.current_user_id` GUC) selects
unconfirmed recurring drafts joined to rule + budget, re-converts via the REAL
`FrankfurterFxProvider`, and UPDATEs in place (app_role column UPDATE on `expense_ledger`).
DRY-RUN by default; `--apply` writes. No FORCE-RLS toggle.

### Dry-run table (Оренда + representative rows)

| ruleNote | ruleAmt   | ccy | budget | storedCcy | stored(maj) | new(maj) | rate       | action  |
| -------- | --------- | --- | ------ | --------- | ----------- | -------- | ---------- | ------- |
| Оренда   | 3500.0000 | PLN | EUR    | EUR       | 3500.00     | 825.90   | 0.23597000 | convert |
| Rent     | 50.0000   | PLN | EUR    | EUR       | 50.00       | 11.75    | 0.23508    | convert |
| Rent     | 50.0000   | PLN | EUR    | EUR       | 50.00       | 11.77    | 0.23543    | convert |
| Rent     | 1500.0000 | USD | EUR    | EUR       | 1500.00     | 1286.99  | 0.85799    | convert |
| Rent     | 50.0000   | PLN | EUR    | EUR       | 50.00       | 11.75    | 0.23508    | convert |
| Rent     | 1500.0000 | USD | EUR    | EUR       | 1500.00     | 1286.99  | 0.85799    | convert |

(`storedCcy` is uniformly EUR — confirming 0031 already relabeled `currency_original`;
the re-conversion deliberately ignores it and re-derives from the rule.)

### Applied

- **47 drafts written**: 42 cross-currency `convert` + 5 same-currency `lock-same-ccy`.
- **1553 `skip-already-correct`** (already budget-locked, no write).
- **0 skipped (no FX rate)** — every cross-currency draft had a cached/derivable rate.
- Rate sanity audit across all 42 cross drafts: pairs PLN→EUR (19), USD→EUR (18),
  GBP→EUR (1), CHF→EUR (1), EUR→USD (3); **0 rates within 2% of 1.0** (no stub-leak signature).
- Idempotent: re-running the dry-run after apply now reports **0 rows needing write**
  (1600 skip-already-correct), including a fix so already-converted cross-currency drafts
  do not re-write `updated_at`.

### Оренда before / after

- **Before:** `amount_converted_cents=350000` ("3500.00 EUR"), currency_original EUR, rate 1.
- **After:** `amount_converted_cents=82590` (**825.90 EUR**), currency_original EUR, rate 1,
  `amount_original_cents=82590` (budget-locked). 3500 PLN × 0.23597 (rate as-of the draft's
  own transaction_date).

### Confirmed-foreign rows (reported, NOT mutated)

CONFIRMED recurring drafts where `currency_original <> budget.default_currency`: **3**
(GBP→EUR: 1, PLN→EUR: 2). Out of scope for this fix (unconfirmed-only); flagged for a
possible follow-up — confirmed rows may have a different lock convention.

## STEP 3 — Stub guard (leak closure)

`InMemoryFxProvider.rateAsOf` now THROWS `InMemoryFxRateNotConfigured` for `from !== to`
when no explicit rate was seeded (previously `?? '1'` — the leak vector). Same-currency
still returns rate 1. This makes a stub-faked cross-currency conversion impossible: the
worker fallback `normalized.fxProvider ?? new InMemoryFxProvider()` now throws on
cross-currency generation instead of silently persisting rate-1.

- Updated `ports.test.ts`: the old "returns 1 for unknown cross-currency pair" test now
  asserts the throw; added a "same-currency still returns 1 (guard does not over-reach)" test.
- No production cross-currency caller relies on the stub. The worker cross-currency test
  injects an explicit-rate stub (inline `{ rateAsOf: () => 1.1 }`); catch-up / confirm-draft
  tests use same-currency (EUR rule + EUR budget); `budgets-home-summary` seeds explicit
  `fxRates`. All unaffected.

## Verification

- `bun test` (Infisical, real Postgres): ports.test.ts + recurring-engine-fx-bounds (17 pass),
  recurring-engine + catchup (10 pass), confirm-draft (6 pass), full shared-kernel suite
  (51 pass). **0 fail across all.** (The trailing `exit status 1` is the known
  coverage-threshold quirk, not a test failure — see MEMORY `project_make_test_infra_debt`.)
- `tsc --noEmit`: apps/worker **clean (0)**, shared-kernel **clean (0)**, packages/budgeting
  **15 errors = baseline** (none touch fx-provider / recurring-engine-fx / scripts).
- **FORCE RLS still ON** for `budgeting.expense_ledger` AND `tenancy.budgets`
  (rls_on + force_on both true) — never toggled; backfill used app_role tenant context.

## Migration 0031

**Neutralized to a no-op tombstone** (`SELECT 1`), journal entry idx 31 preserved (no
drizzle/meta churn). 0031 was a flawed SQL approach: SQL cannot call FX, so it only
relabeled `currency_original` on the unconverted rate-1 amounts (the corruption this plan
repaired). Re-running the original body on a fresh DB would re-introduce the corruption, so
the body is now inert; the file documents the superseded approach and points to the
re-conversion script + guard.

## Deviations from Plan

### [Rule 3 - Blocking constraint, resolved within plan intent] Backfill UPDATE role

The brief prescribed `withTenantTx + FrankfurterFxProvider` and "do NOT toggle FORCE RLS".
Discovered the append-only ledger grant model: `app_role` and `worker_role` hold only
INSERT/SELECT at the TABLE level on `expense_ledger`, and the migrator role is hidden by
FORCE RLS (not in the tenant-isolation policy → 0 rows without a FORCE toggle). The UPDATE
is feasible because `app_role` holds a COLUMN-level UPDATE grant on `expense_ledger` and the
tenant-isolation policy admits rows under the per-tenant GUC. So the backfill UPDATE runs as
app_role inside `withTenantTx` — fully honoring "no FORCE toggle, app pattern". No
architectural change; this is exactly the brief's intended structure, just using the role
that actually holds UPDATE. (The worker engine only INSERTs, which is why its identical
structure worked without this nuance.)

### [Script retention]

- `scripts/backfill-recurring-draft-fx.ts` — **kept** (committed): idempotent, documented
  operator data-fix; referenced by the 0031 tombstone.
- `scripts/diag-verify-recurring-fx.ts` (STEP 1) — **run-and-deleted** (one-shot verification,
  like prior diag scripts). Verdict captured above.

## Known Stubs

None introduced. The InMemoryFxProvider change is a guard (fail-closed), not a stub.

## Self-Check: PASSED

- Created: `scripts/backfill-recurring-draft-fx.ts` — FOUND.
- Modified: `fx-provider.ts`, `ports.test.ts`, `0031_*.sql` — all FOUND.
- STEP-1 `diag-verify-recurring-fx.ts` — confirmed deleted (run-and-delete).
- All four required suites green; FORCE RLS verified ON for expense_ledger + budgets.
