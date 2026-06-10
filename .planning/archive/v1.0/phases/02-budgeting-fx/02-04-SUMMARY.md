---
phase: 02-budgeting-fx
plan: 04
type: summary
wave: 4
status: completed
requirements: [ACCT-01, ACCT-02, ACCT-03, ACCT-04]
---

# Plan 02-04 Summary — Accounts aggregate (CRUD, archive, balance adjustments, dual-currency UI)

## Outcome

Shipped end-to-end Accounts aggregate of the Budgeting bounded context. Users can create accounts (cash, checking, savings, credit_card, loan, investment) per scope (PERSONAL/SHARED) with currency fixed at creation, archive accounts (history preserved), and record manual balance adjustments via a dedicated side-table (not the ledger). Web UI groups Assets vs Liabilities and displays balances in account currency + tenant default currency via `/fx/rate`.

## Commits (oldest → newest)

| SHA       | Type  | Title                                                                    |
| --------- | ----- | ------------------------------------------------------------------------ |
| `4892367` | feat  | Account schema, domain, repo, migration (Task 1)                         |
| `a1c8e29` | feat  | Application use cases + Hono accounts routes (Task 2)                    |
| `33ad672` | feat  | Web UI — AccountForm, AccountsList, accounts page, i18n, e2e (Task 3)    |
| `9f0f673` | fix   | crypto.randomUUID fallback for HTTP; add budgeting pkg to API Dockerfile |
| `f156565` | fix   | align accounts route with tenantGuard context shape (`tenantIds[0]`)     |
| `1aebb09` | chore | infra: bind-mount postgres data dir for backup-friendly local dev        |

Diffstat: 39 files, +4128/-9.

## Artifacts shipped

### Domain + persistence (`packages/budgeting`)

- `src/adapters/persistence/accounts-schema.ts` — Drizzle table with RLS pgPolicy, scope/kind enums, `archived_at` soft-delete column.
- `src/adapters/persistence/balance-adjustments-schema.ts` — side-table for manual reconciliations (D-05-e + RESEARCH.md §7); never touches the ledger.
- `src/domain/account.ts` — `Account` aggregate root with `canBeArchived()`, currency-immutable invariant (ACCT-04).
- `src/ports/account-repo.ts` + `src/adapters/persistence/account-repo.ts` — port + Drizzle adapter using `withTenantTx` and `writeAudit` from platform.
- `src/application/{create-account,archive-account,adjust-account-balance,find-account-by-id,list-accounts}.ts` — use cases returning `Result<AccountDto, Error>`.
- `src/contracts/api.ts` — Zod request/response schemas wired into Hono routes.

### API (`apps/api`)

- `src/routes/accounts.ts` — Hono CRUD: `POST /`, `GET /`, `GET /:id`, `POST /:id/archive`, `POST /:id/balance-adjustment`. Idempotency-Key on writes via platform middleware. Tenant resolved via `pickTenant(c.get("tenantIds"))` to match tenantGuard context shape.
- Wired into `boot.ts` + `app.ts`.

### Web (`apps/web`)

- `src/components/budgeting/{account-form,account-form-sheet,accounts-list}.tsx` — RHF + Zod, mobile-first per UI-SPEC §Accounts.
- `src/app/[locale]/(app)/accounts/page.tsx` — RSC page with Assets vs Liabilities grouping, dual-currency balance display via `/fx/rate`.
- i18n: `messages/{en,pl,uk}.json` updated.

### Migrations

- `apps/migrator/post-migration.sql` extended with `accounts` + `balance_adjustments` REVOKE/GRANT and RLS policies.

### Tests

- `packages/budgeting/test/account-domain.test.ts` — 18 unit tests for invariants.
- `packages/budgeting/test/account-repo.test.ts` — integration tests against real Postgres (RLS, audit writes, archive idempotency).
- `apps/api/test/routes/accounts.test.ts` — 9 route tests (POST/GET/archive/adjust + idempotency replay).
- `apps/web/test/components/account-form.test.tsx` — Vitest + happy-dom component coverage.
- `tests/e2e/features/accounts.feature` + `tests/e2e/pages/AccountsPage.ts` — Gherkin E2E for golden path.

## Verification

```
infisical run -- bun test \
  packages/budgeting/test/account-domain.test.ts \
  packages/budgeting/test/account-repo.test.ts \
  apps/api/test/routes/accounts.test.ts
→ 30 pass, 0 fail, 53 expect() calls
```

Coverage at gate scope:

- `domain/account.ts`: 100% funcs / 100% lines
- `application/create-account.ts`: 100% funcs / 98.18% lines
- `application/archive-account.ts`: 100% funcs / 88.89% lines
- `application/adjust-account-balance.ts`: 100% funcs / 93.10% lines
- `adapters/persistence/account-repo.ts`: 100% funcs / 97.79% lines
- `routes/accounts.ts`: 80% funcs / 87.36% lines

## Issues hit during execution

1. **`crypto.randomUUID is not a function`** — fired client-side over HTTP origin (Web Crypto restricts `randomUUID` to secure contexts). Fixed with secure-context fallback in account-form / sw.js (commit `9f0f673`).
2. **Account creation produced malformed SQL** — root cause: route read `c.get("tenantId")` but `tenantGuard` middleware sets `c.get("tenantIds")` (plural array). Fixed via `pickTenant()` helper (commit `f156565`).
3. **API Docker build failed** — workspace dep `@budget/budgeting` missing from API Dockerfile COPY; added (commit `9f0f673`).

## Requirements coverage

| Req                                                         | Coverage                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ACCT-01 — every account kind × scope creatable              | ✅ enum + create use case + form options + tests                                       |
| ACCT-02 — manual balance adjustments via side-table         | ✅ `balance_adjustments` table + `adjust-account-balance` use case + route + UI action |
| ACCT-03 — archive hides from active list, history preserved | ✅ `archived_at` soft-delete + `includeArchived` query param + UI tests                |
| ACCT-04 — currency set at creation, immutable               | ✅ domain invariant + schema constraint + dual-currency display via `/fx/rate`         |

## Downstream unblocks

- Plan **02-06** (Transaction capture) — `account_id` foreign key now exists on accounts table; ledger rows can reference real accounts.
- Plan **02-07** (Reserves/Cushion accounts) — account `kind` enum already includes the categories Reserves/Cushion need.
