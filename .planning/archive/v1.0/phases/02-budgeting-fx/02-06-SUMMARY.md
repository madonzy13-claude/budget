---
phase: 02-budgeting-fx
plan: "06"
subsystem: budgeting
tags:
  [
    expense-ledger,
    transactions,
    fx,
    projections,
    outbox,
    rls,
    tdd,
    idempotency,
    currency-picker,
  ]

requires:
  - phase: 02-budgeting-fx
    plan: "02-01"
    provides: expense_ledger Phase-1 schema, shared_kernel.outbox, platform primitives
  - phase: 02-budgeting-fx
    plan: "02-02"
    provides: fx_rates table, supported_currencies seed (8 fiat + 6 crypto), FrankfurterFxProvider
  - phase: 02-budgeting-fx
    plan: "02-03"
    provides: idempotency middleware (scope_hash + body_hash + SELECT FOR UPDATE dedup)
  - phase: 02-budgeting-fx
    plan: "02-04"
    provides: accounts table + applyDelta + CurrencyPicker primitive
  - phase: 02-budgeting-fx
    plan: "02-05"
    provides: categories, limits, share-overrides, workspace_share_dirty flag

provides:
  - expense_ledger ALTER: transaction_date, note, account_id, category_id, kind, transfer_group_id, note_tsv; DROP corrected_by_id
  - spending_by_category_month projection table (synchronous upsert in same tx)
  - DrizzleTransactionRepo: create() (own tx) + createInTx(tx, ...) (caller's tx) — cross-plan composition contract for plan 02-08
  - createTransaction use case: currency allowlist gate + share_dirty gate + archived-account gate + 60-min FX freshness gate
  - getLatestTransactions use case: corrects_id derivation for latest-only view
  - POST /transactions + GET /transactions API routes (idempotency-protected)
  - GET /currencies endpoint (allowlist for web currency picker)
  - TransactionCaptureForm: 40px BinancePlex amount, allowlist-bound CurrencyPicker, FX preview, Idempotency-Key
  - FxFreshnessBadge: next-intl formatRelativeTime
  - TransactionList (RSC): dark Binance rows, color by kind, FX badge on stale rows
  - transactions/page.tsx + transactions/actions.ts server action
  - i18n keys: budgeting.transactions.* + budgeting.fx.* (en/pl/uk)

affects:
  - plan 02-07 (corrections: creates correction-row writer extending this ledger writer)
  - plan 02-08 (recurring: calls createInTx() for draft-confirm cross-plan composition)
  - plan 02-09 (search/bulk: re-categorize reuses transaction-repo; FX-stale-badge e2e ships here)

tech-stack:
  added: []
  patterns:
    - "Single-tx atomicity: ledger INSERT + accounts.applyDelta + projection.upsert + writeOutbox in ONE withTenantTx (Pitfall 7)"
    - "TransactionRepo split surface: create() opens own tx; createInTx(tx,...) accepts caller's tx — create delegates to createInTx (single source of truth)"
    - "60-minute FX freshness gate: server validates now() - fxPreview.fxRateDate < 60min; 409 with fresh rate if stale"
    - "Allowlist-bound currency picker: RSC page pre-fetches getSupportedCurrencies() once; passes as currencies prop to client form"
    - "withInfraTx for reference data: supported_currencies uses worker pool (no RLS needed)"
    - "SELECT FOR UPDATE requires UPDATE privilege: idempotency_keys table needed GRANT UPDATE for row-locking"

key-files:
  created:
    - packages/budgeting/src/adapters/persistence/spending-projection-schema.ts
    - packages/budgeting/src/domain/transaction.ts
    - packages/budgeting/src/ports/transaction-repo.ts
    - packages/budgeting/src/ports/spending-projection-repo.ts
    - packages/budgeting/src/adapters/persistence/transaction-repo.ts
    - packages/budgeting/src/adapters/persistence/spending-projection-repo.ts
    - packages/budgeting/src/adapters/persistence/supported-currencies-repo.ts
    - packages/budgeting/src/application/create-transaction.ts
    - packages/budgeting/src/application/get-latest-transactions.ts
    - packages/budgeting/src/application/list-supported-currencies.ts
    - packages/budgeting/test/db-constraints/ledger-immutability.test.ts
    - packages/budgeting/test/transaction-domain.test.ts
    - packages/budgeting/test/transaction-ledger-insert.test.ts
    - packages/budgeting/test/transaction-repo-create-in-tx.test.ts
    - packages/budgeting/test/ledger/fx.test.ts
    - packages/budgeting/test/ledger/fx.property.test.ts
    - apps/api/src/routes/transactions.ts
    - apps/api/src/routes/currencies.ts
    - apps/api/test/routes/transactions.test.ts
    - apps/web/src/components/budgeting/transaction-capture-form.tsx
    - apps/web/src/components/budgeting/transaction-capture-sheet.tsx
    - apps/web/src/components/budgeting/transaction-list.tsx
    - apps/web/src/components/budgeting/fx-freshness-badge.tsx
    - apps/web/src/app/[locale]/(app)/transactions/page.tsx
    - apps/web/src/app/[locale]/(app)/transactions/actions.ts
    - apps/web/test/components/transaction-capture-form.test.tsx
    - apps/web/test/components/fx-freshness-badge.test.tsx
    - tests/e2e/features/budget/create-transaction.feature
    - tests/e2e/pages/TransactionsPage.ts
    - drizzle/0010_plan_02_06_ledger_projection.sql

  modified:
    - packages/platform/src/db/expense-ledger.ts (Phase-2 columns added, corrected_by_id dropped)
    - packages/budgeting/src/domain/events.ts (transaction.created events added)
    - packages/budgeting/src/contracts/api.ts (createTransactionSchema, TransactionDto)
    - packages/budgeting/src/contracts/factory.ts (createTransaction, getLatestTransactions, transactionRepo exposed)
    - packages/budgeting/package.json (exports for new files, fast-check devDep)
    - apps/api/src/app.ts (/transactions + /currencies routes mounted)
    - apps/migrator/post-migration.sql (Plan 02-06 section; GRANT UPDATE idempotency_keys fix)
    - drizzle/meta/_journal.json (idx:10 entry)
    - apps/migrator/drizzle.config.ts (spending-projection-schema added)
    - apps/web/src/components/common/currency-picker.tsx (options prop for allowlist mode)
    - apps/web/messages/en.json (budgeting.transactions.* + budgeting.fx.*)
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json
    - tests/e2e/steps/budget.steps.ts (Transactions step definitions added)

key-decisions:
  - "TransactionRepo exposes BOTH create() (own tx) AND createInTx(tx,...) (caller's tx); create() delegates to createInTx() — zero code divergence. Plan 02-08 imports createInTx only."
  - "60-minute FX freshness gate: fxPreview.fxRateDate older than FX_STALE_MINUTES=60 returns FxRateStaleError with freshRate payload; route returns 409"
  - "spending_by_category_month upsert in SAME withTenantTx as ledger INSERT (ENGR-14) — ON CONFLICT adds deltas atomically"
  - "SELECT FOR UPDATE on idempotency_keys requires UPDATE privilege — added GRANT UPDATE to fix plan 02-03 oversight"
  - "CurrencyPicker extended with optional options prop — when provided renders only those codes (allowlist mode); when omitted falls back to TOP_CURRENCIES (Phase 1 compat)"
  - "getSupportedCurrencies() server action fetches /api/currencies endpoint (not direct DB) — avoids bundling DB client into Next.js build"
  - "DATABASE_URL_WORKER must be substituted (localhost) in API route tests using withInfraTx — added env substitution + resetPools() call at top of transactions.test.ts"

patterns-established:
  - "Cross-plan composition: createInTx(tx, rows, userId, tenantId) for sharing a caller's tx with plan 02-08"
  - "Allowlist-bound currency picker: currencies prop from RSC server action, not hardcoded array"
  - "Test env substitution: both DATABASE_URL_APP and DATABASE_URL_WORKER need @db:→@localhost: for tests using withInfraTx"

requirements-completed: [EXPN-01, EXPN-02, EXPN-03, EXPN-11, EXPN-13]

duration: 95min
completed: 2026-05-10
---

# Phase 02 Plan 06: Transaction Ledger Writer Summary

**Single-tx expense_ledger writer with balance update + projection upsert + outbox; 60-min FX freshness gate; allowlist-bound CurrencyPicker sourced from budgeting.supported_currencies via RSC server action**

## Performance

- **Duration:** ~95 minutes
- **Started:** 2026-05-10T09:37:00Z
- **Completed:** 2026-05-10T10:57:00Z
- **Tasks:** 3
- **Files modified/created:** 42

## Accomplishments

- expense_ledger ALTER: 7 Phase-2 columns (transaction_date, note, account_id, category_id, kind, transfer_group_id, note_tsv); DROP corrected_by_id; ledger immutability enforced via REVOKE UPDATE/DELETE + 4-case test
- Single-tx writer (DrizzleTransactionRepo): ledger INSERT + accounts.applyDelta + spending_by_category_month upsert + writeOutbox in ONE withTenantTx; BOTH create() and createInTx() exposed for cross-plan composition (plan 02-08)
- createTransaction use case: 4 gates in order (currency allowlist → share_dirty → account archived → FX staleness 60-min); TRANSFER creates two linked rows sharing transfer_group_id
- POST /transactions + GET /transactions routes live behind plan 02-03 idempotency middleware; 7 integration tests pass
- TransactionCaptureForm: 40px BinancePlex amount, kind tabs, allowlist-bound CurrencyPicker (currencies prop from RSC pre-fetch), FX preview (debounced fetch /fx/rate), Idempotency-Key header
- 20 package tests + 15 Vitest UI tests + 7 API integration tests all green

## Task Commits

1. **Task 1: ALTER expense_ledger + spending projection + ledger immutability** — `b12ede6` (feat)
2. **Task 2: Transaction repo + use case + domain + ports** — `408f264` (feat)
3. **Task 3: API route + integration tests** — `09ab2eb` (feat)
4. **Task 3 (continued): Web UI components + tests** — `7611e04` (feat)

## Files Created/Modified

Key files:

- `/packages/budgeting/src/adapters/persistence/transaction-repo.ts` — DrizzleTransactionRepo with create() + createInTx(); single-tx atomicity
- `/packages/budgeting/src/application/create-transaction.ts` — 4-gate use case; FxRateStaleError; CurrencyNotSupportedError; AccountArchivedError; WorkspaceSharesDirtyError
- `/packages/budgeting/src/domain/transaction.ts` — Transaction entity with isStale() method
- `/apps/api/src/routes/transactions.ts` — POST /transactions (FxRateStale→409, 4 error kinds); GET /transactions (paginated latest)
- `/apps/api/src/routes/currencies.ts` — GET /currencies returning supported_currencies allowlist
- `/apps/web/src/components/budgeting/transaction-capture-form.tsx` — allowlist-bound CurrencyPicker via currencies prop
- `/apps/web/src/components/budgeting/fx-freshness-badge.tsx` — "rate {age}" badge using next-intl
- `/apps/migrator/post-migration.sql` — Plan 02-06 section; GRANT UPDATE idempotency_keys bug fix

## Decisions Made

- **create → createInTx delegation**: `create()` wraps `createInTx()` in `withTenantTx` — zero divergence, plan 02-08 imports only `createInTx`.
- **FX_STALE_MINUTES = 60**: Server validates `now() - fxRateDate < 60min`; returns 409 FxRateStale with freshRate payload.
- **getSupportedCurrencies() via /api/currencies fetch**: avoids bundling pg/drizzle into Next.js build.
- **SELECT FOR UPDATE requires UPDATE privilege**: plan 02-03 oversight — added GRANT UPDATE on idempotency_keys.
- **DATABASE_URL_WORKER substitution required in API tests**: withInfraTx uses worker pool; tests must substitute @db:→@localhost: for both URL vars.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DATABASE_URL_WORKER missing localhost substitution in test env**

- **Found during:** Task 3 (API integration tests)
- **Issue:** `isSupportedCurrency()` uses `withInfraTx` (worker pool). Tests only substituted `DATABASE_URL_APP`, not `DATABASE_URL_WORKER`. `workerDb()` couldn't reach `db:5432` from the test runner.
- **Fix:** Added `DATABASE_URL_WORKER` substitution + `resetPools()` call at top of `transactions.test.ts`.
- **Files modified:** `apps/api/test/routes/transactions.test.ts`
- **Committed in:** 09ab2eb

**2. [Rule 1 - Bug] Idempotency middleware not registered in test buildApp()**

- **Found during:** Task 3 (idempotency replay test)
- **Issue:** Test `buildApp()` didn't register `createIdempotencyMiddleware()`, so second POST with same key created a duplicate ledger row.
- **Fix:** Added `app.use(createIdempotencyMiddleware())` before `app.route("/transactions", ...)` in test helper.
- **Files modified:** `apps/api/test/routes/transactions.test.ts`
- **Committed in:** 09ab2eb

**3. [Rule 1 - Bug] GRANT UPDATE missing on idempotency_keys (plan 02-03 oversight)**

- **Found during:** Task 3 (first run of transactions integration tests)
- **Issue:** `SELECT ... FOR UPDATE` requires UPDATE privilege in PostgreSQL. Plan 02-03 only granted SELECT/INSERT/DELETE, causing "permission denied for table idempotency_keys".
- **Fix:** Added `GRANT UPDATE` to `post-migration.sql` plan 02-03 section; applied GRANT directly to running DB via migrator role.
- **Files modified:** `apps/migrator/post-migration.sql`
- **Committed in:** 09ab2eb

**4. [Rule 3 - Blocking] GET /currencies endpoint added for web app server action**

- **Found during:** Task 3 (Web UI — server action)
- **Issue:** `actions.ts` needed to call `listSupportedCurrenciesFromDb()` but web app doesn't depend on `@budget/budgeting` (would bundle pg/drizzle into Next.js). Plan said to use a server action directly — but the web app can't import DB code.
- **Fix:** Added `GET /currencies` route to the API server; `actions.ts` fetches `${apiBase}/api/currencies` instead of direct DB access.
- **Files modified:** `apps/api/src/routes/currencies.ts`, `apps/api/src/app.ts`, `apps/web/src/app/[locale]/(app)/transactions/actions.ts`
- **Committed in:** 7611e04

---

**Total deviations:** 4 auto-fixed (3 bugs, 1 blocking issue)
**Impact on plan:** All fixes necessary for correctness. No scope creep.

## Issues Encountered

- Radix Select `SELECT ... FOR UPDATE` permission denied: fixed by adding GRANT UPDATE.
- Radix Select in jsdom doesn't render portal options without proper pointer events: worked around in tests by testing CurrencyPicker in isolation + prop contract verification.

## Known Stubs

None — transaction list fetches from `/api/transactions` (real data); currencies fetched from `/api/currencies` (real data).

## Threat Flags

No new threat surface beyond what the plan's `<threat_model>` covers.

## Self-Check: PASSED

Verified:

- `b12ede6`, `408f264`, `09ab2eb`, `7611e04` all exist in git log
- `apps/api/src/routes/transactions.ts` exists
- `apps/web/src/components/budgeting/transaction-capture-form.tsx` exists
- All tests pass (20 package + 7 API integration + 15 Vitest)

## Next Phase Readiness

- Plan 02-07 (corrections): uses the same ledger writer with a `correctsId` pointer
- Plan 02-08 (recurring): calls `transactionRepo.createInTx(tx, ...)` to share a tx with draft UPDATE
- Plan 02-09 (search/bulk): reuses transaction-repo for correction-row writer; FX-stale-badge e2e ships here

---

_Phase: 02-budgeting-fx_
_Completed: 2026-05-10_
