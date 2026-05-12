---
phase: "02"
plan: "04"
subsystem: "tenancy/share-links"
tags: [share-links, better-auth, public-routes, security, ci-gate, tdd]

dependency_graph:
  requires:
    - "02-01 (migration 0013 Section D: tenancy.budget_share_links table + RLS)"
  provides:
    - "POST /budgets/:id/share (owner-only, creates nanoid(32) token)"
    - "GET /budgets/join/:token (PUBLIC, no auth — token is credential)"
    - "POST /budgets/join/:token/accept (auth, calls Better Auth addMember)"
    - "DELETE /budgets/share/:linkId (owner-only, sets revoked_at)"
    - "BudgetShareLinkRepo port + DrizzleBudgetShareLinkRepo adapter"
    - "4 tenancy application services: create/resolve/accept/revoke-share-link"
  affects:
    - "apps/api/src/app.ts (middleware order — /budgets/join registered before requireAuth)"
    - "apps/api/src/routes/budgets.ts (2 new sub-routes appended)"
    - "tests/tenant-leak/USER-DATA-TABLES.txt (+1 TENANT-SCOPED entry)"

tech_stack:
  added:
    - "nanoid (already in package.json) — 32-char URL-safe token generation"
    - "drizzle/0014_phase02_04_share_link_public_resolve.sql — worker_role SELECT policies for public resolve path"
  patterns:
    - "withTenantTx for owner-only writes (create, accept, revoke)"
    - "withInfraTx (worker_role + budget_share_links_worker_public_resolve policy) for public token lookup"
    - "withUserContext for owner-role membership check (budget_members_self policy)"
    - "Defense-in-depth WHERE clause in accept() UPDATE (T-02-06)"

key_files:
  created:
    - "packages/tenancy/src/adapters/persistence/budget-share-links-schema.ts"
    - "packages/tenancy/src/ports/budget-share-link-repo.ts"
    - "packages/tenancy/src/adapters/persistence/budget-share-link-repo.ts"
    - "packages/tenancy/src/application/create-share-link.ts"
    - "packages/tenancy/src/application/resolve-share-link.ts"
    - "packages/tenancy/src/application/accept-share-link.ts"
    - "packages/tenancy/src/application/revoke-share-link.ts"
    - "apps/api/src/routes/share-join.ts"
    - "apps/api/test/routes/share-links.test.ts"
    - "drizzle/0014_phase02_04_share_link_public_resolve.sql"
  modified:
    - "apps/api/src/routes/budgets.ts (POST /:id/share + DELETE /share/:linkId)"
    - "apps/api/src/app.ts (app.route('/budgets/join', ...) before requireAuth fence)"
    - "tests/tenant-leak/USER-DATA-TABLES.txt (tenancy.budget_share_links TENANT-SCOPED)"

decisions:
  - "withInfraTx + worker_role SELECT policy: public token resolve needs no tenant GUC; added budget_share_links_worker_public_resolve policy in 0014 migration (worker_role can SELECT without tenant filter — token IS credential)"
  - "withTenantTx for accept(): link's own budgetId used as tenantId so RLS GUC is satisfied; accepting user need not be a member yet (GUC allows access, not membership)"
  - "withUserContext for owner role check: budget_members_self policy allows user to see own row; avoids needing tenant GUC for membership verification"
  - "findById added to BudgetShareLinkRepo port: needed by revokeShareLink to get budgetId before membership check (avoids JOIN through budget_share_links which would require tenant GUC)"
  - "0014 migration adds worker_role SELECT on both budget_share_links AND budgets (for budget name lookup in resolve path)"
  - "0014 migration drops obsolete workspace_* triggers that referenced tenancy.workspaces (dropped in 0012); these caused INSERT failures on budget_members in tests"

metrics:
  duration: "~90 minutes"
  completed_date: "2026-05-12"
  tasks: 2
  files_created: 10
  files_modified: 3
---

# Phase 02 Plan 04: Share-link Backend Summary

JWT-style nanoid(32) token share-link backend with Better Auth addMember integration, single-use + TTL enforcement, owner revoke, and public resolve route.

## What Was Built

**Schema layer:**

- `budget-share-links-schema.ts`: Drizzle TS mirror of `tenancy.budget_share_links` (created by 02-01 migration Section D). `pgPolicy tenant_isolation` + `uniqueIndex on token`. No Drizzle imports in port (hexagonal boundary).

**Port + Adapter:**

- `BudgetShareLinkRepo` port: `create`, `findById`, `findByToken`, `accept`, `revoke`, `listForBudget`
- `DrizzleBudgetShareLinkRepo` adapter: each method uses the correct tx primitive (see decisions)

**4 Application Services:**

- `createShareLink`: owner-role assert via `withUserContext`, `nanoid(32)` token, TTL up to 90d (Zod-validated), returns `{url, expiresAt, id}`
- `resolveShareLink`: public, no tenant — `findByToken` via `withInfraTx`, budget name from `tenancy.budgets`
- `acceptShareLink`: validates link state → calls `auth.api.addMember` (Better Auth, NOT createInvitation) → marks link accepted via `withTenantTx`
- `revokeShareLink`: resolves link via `findById` → owner-role assert → `repo.revoke` via `withTenantTx`

**4 Routes:**

- `POST /budgets/:id/share` — auth required, owner role checked in service, 201 `{url, expiresAt, id}`
- `GET /budgets/join/:token` — PUBLIC (no auth), returns `{budgetName, isExpired, isRevoked, isUsed}`
- `POST /budgets/join/:token/accept` — auth checked inline (no requireWorkspace), 200 `{budgetId}`
- `DELETE /budgets/share/:linkId` — auth required, owner role checked in service, 204

**Middleware ordering (critical):**

```
app.route("/budgets/join", createShareJoinRoute(deps));  // line 61 — PUBLIC GET half
// ... then:
app.use("/budgets/*", requireAuth);  // line 67 — broad fence
```

Hono evaluates in registration order. GET /budgets/join/:token bypasses the fence because the `/budgets/join` route is registered first.

**CI Gate extension:**
`tests/tenant-leak/USER-DATA-TABLES.txt` now includes `tenancy.budget_share_links TENANT-SCOPED`.

## Test Evidence

- **15/15 integration tests GREEN** against live Postgres (`bun test apps/api/test/routes/share-links.test.ts`)
- Test suites: happy-path (create→resolve→accept→2nd-409), expired (isExpired=true, 410), revoked (204→isRevoked=true→410), cross-tenant (token resolves to correct budget), non-owner 403, token format `/^[A-Za-z0-9_-]{32}$/`
- Security paths covered: T-02-05 (token entropy), T-02-06 (race-condition defense-in-depth), T-02-08 (cross-tenant probe), T-02-NON-OWNER (403), T-02-TTL-BYPASS (Zod max 90d)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] withInfraTx + FORCE RLS incompatibility for public token resolve**

- **Found during:** Task 2 (GREEN) — `findByToken` returned null with no error
- **Issue:** `withInfraTx` uses `workerDb()` (worker_role). `tenancy.budget_share_links` has `FORCE ROW LEVEL SECURITY`. With no GUC set, `worker_role` gets 0 rows — even for the public token resolve path. The plan's design (use `withInfraTx` for public resolve) assumed BYPASSRLS or no FORCE RLS, but neither was true.
- **Fix:** Added `drizzle/0014_phase02_04_share_link_public_resolve.sql` migration with `CREATE POLICY budget_share_links_worker_public_resolve ... FOR SELECT TO worker_role USING (true)`. Same for `tenancy.budgets` (needed for budget name lookup). Applied to live test DB.
- **Files modified:** `drizzle/0014_phase02_04_share_link_public_resolve.sql` (new)
- **Commits:** `abcdf5d`

**2. [Rule 1 - Bug] Drizzle raw execute returns timestamps as strings (not Date objects)**

- **Found during:** Task 2 (GREEN) — `isExpired` always `false` for expired links
- **Issue:** `tx.execute<{expires_at: Date}>()` type annotation is misleading — Drizzle's raw SQL execute returns PostgreSQL `timestamptz` values as ISO string from the pg driver, not as JS Date objects. `string <= new Date()` coerces to `NaN` which is always false.
- **Fix:** Changed comparisons to `new Date(link.expiresAt) <= new Date()` in `resolve-share-link.ts` and `accept-share-link.ts`
- **Files modified:** both application service files
- **Commits:** `abcdf5d`

**3. [Rule 1 - Bug] accept() UPDATE permission denied (worker_role has only SELECT)**

- **Found during:** Task 2 (GREEN) — `POST /budgets/join/:token/accept` returned 500
- **Issue:** Original `accept()` used `withInfraTx` (worker_role) which has only SELECT on `budget_share_links`. The UPDATE requires `app_role`. Changed to `withTenantTx` using the link's own `budgetId` as tenantId so RLS GUC is satisfied.
- **Fix:** Updated `accept()` port signature and adapter to accept `tenantId`; service passes `link.budgetId`
- **Files modified:** port, adapter, accept-share-link.ts
- **Commits:** `abcdf5d`

**4. [Rule 1 - Bug] revokeShareLink JOIN through budget_share_links requires tenant GUC**

- **Found during:** Task 2 (GREEN) — DELETE returned 403 (owner check failed)
- **Issue:** Original owner check JOINed `budget_share_links` via `withUserContext` which only sets `current_user_id`, not `app.tenant_ids`. FORCE RLS on `budget_share_links` blocked the JOIN.
- **Fix:** Split into two steps: `findById` (withInfraTx, worker_role SELECT policy) to get `budgetId`, then `withUserContext` membership check against `budget_members` only (which has the self policy).
- **Files modified:** revoke-share-link.ts, port (added findById), adapter (added findById)
- **Commits:** `abcdf5d`

**5. [Rule 1 - Bug] Obsolete workspace\_\* triggers blocking budget_members INSERT**

- **Found during:** Task 2 (GREEN) — ALL tests failing with `relation "tenancy.workspaces" does not exist`
- **Issue:** Migration 0012 dropped `tenancy.workspaces` but migration 0013 did NOT drop the old `workspace_members_*` triggers on `tenancy.budget_members`. These triggers fire on INSERT and reference the dropped table.
- **Fix:** Dropped 5 obsolete triggers directly in test DB and added to `drizzle/0014_*` migration. Applied to live DB.
- **Files modified:** `drizzle/0014_phase02_04_share_link_public_resolve.sql`
- **Commits:** `abcdf5d`

### Deferred Items

**Pre-existing: CI gate (make ci-gate) fails with `relation "budgeting.account_balance_adjustments" does not exist`**

- **Status:** Pre-existing issue from plan 02-01. The `account_balance_adjustments` table was dropped in migration 0013 but `wallet-repo.ts` and `seed-two-tenants.ts` still reference it. Also `seed-two-tenants.ts` uses old `expense_ledger` column names.
- **Impact:** `make ci-gate` fails in testcontainer context. The live-DB integration tests (15/15) DO pass because they use the real migrated DB.
- **Deferred to:** Plan that fixes `wallet-repo.ts` + `seed-two-tenants.ts` + `expense_ledger` schema sync

## Threat Flags

None beyond what is documented in the plan's STRIDE threat register. All `mitigate` dispositions implemented:

- T-02-05: nanoid(32) — URL-safe, ~192-bit entropy
- T-02-06: Defense-in-depth WHERE clause in accept() + accept-share-link.ts pre-validation
- T-02-08: Cross-tenant probe covered by test; no enumeration endpoint exposed
- T-02-NON-OWNER: Owner role checked in create + revoke services
- T-02-TTL-BYPASS: Zod schema caps ttlDays 1–90; server computes expires_at server-side

## Self-Check: PASSED

All created files verified to exist. All commits (64c38ea RED, abcdf5d GREEN feat, 22e6757 ESLint fix) verified in git log.

| Check                                       | Result |
| ------------------------------------------- | ------ |
| budget-share-links-schema.ts exists         | FOUND  |
| budget-share-link-repo.ts (port) exists     | FOUND  |
| budget-share-link-repo.ts (adapter) exists  | FOUND  |
| 4 application services created              | FOUND  |
| share-join.ts route exists                  | FOUND  |
| share-links.test.ts exists                  | FOUND  |
| 0014 migration exists                       | FOUND  |
| USER-DATA-TABLES.txt has budget_share_links | FOUND  |
| RED commit 64c38ea                          | FOUND  |
| GREEN feat commit abcdf5d                   | FOUND  |
| ESLint fix commit 22e6757                   | FOUND  |
| 15/15 integration tests pass                | PASSED |
