---
phase: 01-foundations
plan: 10
plan_id: 01.10
type: execute
wave: 3
depends_on: ["01.02", "01.03", "01.06", "01.07", "01.09"]
files_modified:
  - tests/tenant-leak/no-guc-zero-rows.test.ts
  - tests/tenant-leak/job-without-tenant-errors.test.ts
  - tests/tenant-leak/pg-roles-no-bypassrls.test.ts
  - tests/tenant-leak/force-rls-on-all-tables.test.ts
  - tests/tenant-leak/in-process-bus-tenant-scope.test.ts
  - tests/tenant-leak/fixtures/seed-two-tenants.ts
  - tests/tenant-leak/fixtures/raw-pg-client.ts
  - tests/tenant-leak/USER-DATA-TABLES.txt
  - apps/web/e2e/cross-tenant-cache.spec.ts
  - scripts/ci/run-tenant-leak.sh
  - .github/workflows/ci.yml
  - .github/workflows/tenant-leak.yml
  - package.json
autonomous: true
requirements: [TENT-07, TENT-08, ENGR-10]
provides:
  - 6 leak-CI tests that fail closed when tenant invariants are violated
  - GitHub Actions workflow running the full Phase-1 gate
  - Two-tenant fixture using app_role + application service path (PC-20)
  - dependency-cruiser CI step banning domain → drizzle/hono imports
  - package.json script `test:ci-gate` running the leak suite locally
  - PC-10 Playwright spec: cross-tenant cache leak protection (apps/web/e2e/cross-tenant-cache.spec.ts)
must_haves:
  truths:
    - "no-guc-zero-rows.test.ts opens raw pg connection as app_role WITHOUT setting app.tenant_ids and asserts SELECT count(*) returns 0 from every user-data table (T-1)"
    - "job-without-tenant-errors.test.ts invokes a pg-boss handler wrapper with empty tenantIds payload and asserts a TenantContextMissing error is thrown BEFORE any DB read (T-2)"
    - "pg-roles-no-bypassrls.test.ts SELECTs rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_role','worker_role','migrator') and asserts zero rows have rolbypassrls=true (T-3)"
    - "force-rls-on-all-tables.test.ts asserts every row has relrowsecurity=true AND relforcerowsecurity=true for tables in INCLUDED list (T-1)"
    - "PC-08: in-process-bus-tenant-scope.test.ts (test #5) seeds two tenants, writes ONE outbox event per tenant, subscribes a handler that captures `current_setting('app.tenant_ids')` from inside the handler, calls dispatchOutboxBatch, asserts each handler invocation saw ONLY its row's tenant in app.tenant_ids — proves PC-08 invariant"
    - "PC-10: apps/web/e2e/cross-tenant-cache.spec.ts (test #6) — Playwright E2E: load tenant-A workspace HTML, log out, log in as tenant-B, assert workspace switcher does NOT show tenant-A workspaces from cache"
    - "Excluded list: shared_kernel.outbox (Pitfall 10 — infrastructure, NOT under RLS)"
    - "PC-12: USER-DATA-TABLES.txt flags shared_kernel.user_keys as USER-SCOPED (different policy assertion: app.current_user_id GUC, not app.tenant_ids); identity.sessions, identity.accounts, identity.user_preferences also user-scoped"
    - "PC-20: Two-tenant fixture seeds via app_role using packages/identity + packages/tenancy application services (signUp + createWorkspace) — NOT migrator credentials"
    - "Tests use a raw `pg.Client` for force-RLS / no-GUC assertions (NOT withTenantTx) — proves RLS enforces independent of app code (T-13)"
    - "depcruise CI step blocks any new violation: domain/** importing drizzle-orm | hono | adapters (ENGR-10)"
    - ".github/workflows/ci.yml runs the full Phase-1 gate"
    - ".github/workflows/tenant-leak.yml is invokable separately via workflow_dispatch"
    - "Tests fail with exit code 1 (FAIL CLOSED)"
    - "package.json adds `test:ci-gate` script"
  artifacts:
    - path: tests/tenant-leak/no-guc-zero-rows.test.ts
      provides: "Test 1: SELECT without GUC returns 0 rows from every user-data table (T-1)"
      contains: "app.tenant_ids"
    - path: tests/tenant-leak/job-without-tenant-errors.test.ts
      provides: "Test 2: pg-boss handler wrapper rejects empty tenantIds (T-2)"
      contains: "TenantContextMissing"
    - path: tests/tenant-leak/pg-roles-no-bypassrls.test.ts
      provides: "Test 3: pg_roles confirms NOBYPASSRLS (T-3)"
      contains: "rolbypassrls"
    - path: tests/tenant-leak/force-rls-on-all-tables.test.ts
      provides: "Test 4: pg_class confirms FORCE ROW LEVEL SECURITY everywhere (T-1)"
      contains: "relforcerowsecurity"
    - path: tests/tenant-leak/in-process-bus-tenant-scope.test.ts
      provides: "Test 5 (PC-08): in-process bus handlers see only their row's tenant in app.tenant_ids"
      contains: "app.tenant_ids"
    - path: apps/web/e2e/cross-tenant-cache.spec.ts
      provides: "Test 6 (PC-10): Playwright E2E proving tenant-A workspaces never appear in tenant-B session via cache"
      contains: "tenant-A"
    - path: tests/tenant-leak/fixtures/seed-two-tenants.ts
      provides: "PC-20: Two-tenant fixture seeded via app_role + application services"
      contains: "signUp"
    - path: tests/tenant-leak/fixtures/raw-pg-client.ts
      provides: "Raw pg.Client factory (no withTenantTx) for fail-closed proofs"
      contains: "new Client"
    - path: tests/tenant-leak/USER-DATA-TABLES.txt
      provides: "Authoritative enumeration of user-data tables; flags PC-12 user-scoped tables separately"
      contains: "USER-SCOPED"
    - path: .github/workflows/ci.yml
      provides: "GitHub Actions: typecheck + lint + depcruise + bun test + leak suite + compose smoke + Playwright E2E"
      contains: "tenant-leak"
    - path: scripts/ci/run-tenant-leak.sh
      provides: "Local gate runner — boots compose db, runs migrator, seeds fixture, runs 5 backend tests"
      contains: "bun test tests/tenant-leak"
  key_links:
    - from: "tests/tenant-leak/no-guc-zero-rows.test.ts"
      to: "tests/tenant-leak/fixtures/seed-two-tenants.ts"
      via: "import seedTwoTenants"
      pattern: "seedTwoTenants"
    - from: "tests/tenant-leak/no-guc-zero-rows.test.ts"
      to: "tests/tenant-leak/fixtures/raw-pg-client.ts"
      via: "import rawAppClient"
      pattern: "rawAppClient"
    - from: ".github/workflows/ci.yml"
      to: "scripts/ci/run-tenant-leak.sh"
      via: "run: bash scripts/ci/run-tenant-leak.sh"
      pattern: "run-tenant-leak.sh"
    - from: "tests/tenant-leak/USER-DATA-TABLES.txt"
      to: "tests 1, 4, 5"
      via: "shared input list with USER-SCOPED flagging"
      pattern: "USER-SCOPED"
---

<read_first>

- .planning/phases/01-foundations/01-CONTEXT.md (D-08 GUC, D-10 worker propagation, D-11 leak gate)
- .planning/phases/01-foundations/01-RESEARCH.md §Pattern 2, §Pitfall 6, §Pitfall 10, §Validation Architecture
- .planning/phases/01-foundations/01-VALIDATION.md (rows 64–67 — the 4 CI gate tests)
- .planning/phases/01-foundations/01-02-SUMMARY.md (withTenantTx signature, post-Postgres role names, FORCE RLS post-migration.sql)
- .planning/phases/01-foundations/01-03-SUMMARY.md (audit_history under RLS; outbox NOT under RLS — outbox is in the exclusion list; PC-08 dispatcher applies tenant context before publish)
- .planning/phases/01-foundations/01-04-SUMMARY.md (PC-12: user_keys USER-SCOPED, NOT tenant-scoped — separate assertion)
- .planning/phases/01-foundations/01-06-SUMMARY.md (tenancy.workspaces, tenancy.workspace_members [TWO policies: tenant_isolation + members_self], shared_workspace_member_shares — confirm under RLS)
- .planning/phases/01-foundations/01-07-SUMMARY.md (tenant-guard middleware, TenantContextMissing error type)
- .planning/phases/01-foundations/01-09-SUMMARY.md (compose db service, app_role/worker_role/migrator credentials env)
  </read_first>

<truths>
- T-1 (this plan IS the mitigation): the 6 tests are the production safety net
- T-2: plan 03 worker handler wrapper throws TenantContextMissing when tenantIds is empty/missing
- T-3: plan 02 declares roles NOBYPASSRLS via pgRole + plan 09 init SQL
- T-13 (green-washing): the only way to prove the leak gate isn't fake is to seed REAL data for two tenants and demonstrate cross-tenant SELECT returns 0 rows for the wrong tenant
- Pitfall 10: shared_kernel.outbox is INFRASTRUCTURE and NOT under RLS — appears in the EXCLUDED section
- pg-boss tables (in `pgboss` schema) are infrastructure — also excluded
- PC-12: identity.sessions, identity.accounts, identity.user_preferences, shared_kernel.user_keys are USER-SCOPED — RLS keys off `app.current_user_id`, not `app.tenant_ids`. They go in the INCLUDED list with a USER-SCOPED tag so test 1 (no-GUC zero rows) and test 4 (FORCE RLS) handle them correctly: SELECT with neither GUC must return 0 rows (RLS denies), but the cross-tenant assertion in test 1 uses app.current_user_id (not app.tenant_ids) to prove user-A cannot see user-B's row
- identity.users has a self-policy (users_self_visible) keyed by app.current_user_id — also USER-SCOPED
- tenancy.workspaces, tenancy.workspace_members, tenancy.shared_workspace_member_shares, shared_kernel.audit_history, budgeting.expense_ledger are TENANT-SCOPED (app.tenant_ids array predicate)
- tenancy.workspace_members ALSO has a workspace_members_self user-scoped policy (Plan 06 PC-01) — but tenant_isolation is the primary policy; in test 4 we still expect FORCE RLS = true
- PC-20: fixture uses app_role + application services (signUp + createWorkspace) — NOT migrator credentials. This proves the entire user-flow honors tenant boundaries.
- Test runner: bun:test for backend (5 tests); Playwright for the cross-tenant cache E2E (test 6, PC-10)
- DO NOT call withTenantTx in leak tests 1+4 (raw RLS proof); DO use the application service surface in seed-two-tenants for fixture setup (PC-20)
</truths>

<acceptance_criteria>

- [ ] `test -f tests/tenant-leak/no-guc-zero-rows.test.ts`
- [ ] `test -f tests/tenant-leak/job-without-tenant-errors.test.ts`
- [ ] `test -f tests/tenant-leak/pg-roles-no-bypassrls.test.ts`
- [ ] `test -f tests/tenant-leak/force-rls-on-all-tables.test.ts`
- [ ] PC-08: `test -f tests/tenant-leak/in-process-bus-tenant-scope.test.ts`
- [ ] PC-10: `test -f apps/web/e2e/cross-tenant-cache.spec.ts`
- [ ] `test -f tests/tenant-leak/fixtures/seed-two-tenants.ts`
- [ ] `test -f tests/tenant-leak/fixtures/raw-pg-client.ts`
- [ ] `test -f tests/tenant-leak/USER-DATA-TABLES.txt`
- [ ] `grep -q "shared_kernel.outbox" tests/tenant-leak/USER-DATA-TABLES.txt` (in EXCLUDED section)
- [ ] PC-12: USER-SCOPED tag present: `grep -F 'USER-SCOPED' tests/tenant-leak/USER-DATA-TABLES.txt` exits 0
- [ ] PC-12: shared_kernel.user_keys flagged USER-SCOPED: `grep -E 'shared_kernel\\.user_keys.*USER-SCOPED|USER-SCOPED.*shared_kernel\\.user_keys' tests/tenant-leak/USER-DATA-TABLES.txt` exits 0
- [ ] PC-12: identity.sessions / identity.accounts / identity.user_preferences flagged USER-SCOPED: `for t in 'identity\\.sessions' 'identity\\.accounts' 'identity\\.user_preferences'; do grep -E "${t}.*USER-SCOPED|USER-SCOPED.*${t}" tests/tenant-leak/USER-DATA-TABLES.txt; done` exits 0
- [ ] `grep -qE "(tenancy\\.workspaces|tenancy\\.workspace_members|tenancy\\.shared_workspace_member_shares)" tests/tenant-leak/USER-DATA-TABLES.txt`
- [ ] `grep -q "audit_history" tests/tenant-leak/USER-DATA-TABLES.txt` (INCLUDED, TENANT-SCOPED)
- [ ] `grep -q "TenantContextMissing" tests/tenant-leak/job-without-tenant-errors.test.ts`
- [ ] `grep -q "rolbypassrls" tests/tenant-leak/pg-roles-no-bypassrls.test.ts`
- [ ] `grep -q "relforcerowsecurity" tests/tenant-leak/force-rls-on-all-tables.test.ts`
- [ ] PC-08: in-process-bus test asserts handler sees its row's tenant: `grep -F 'app.tenant_ids' tests/tenant-leak/in-process-bus-tenant-scope.test.ts && grep -F 'eventBus' tests/tenant-leak/in-process-bus-tenant-scope.test.ts` exits 0
- [ ] PC-10: Playwright spec asserts cross-tenant cache leak does not occur: `grep -F 'tenant-A' apps/web/e2e/cross-tenant-cache.spec.ts && grep -F 'tenant-B' apps/web/e2e/cross-tenant-cache.spec.ts && grep -F 'workspace' apps/web/e2e/cross-tenant-cache.spec.ts` exits 0
- [ ] tests/tenant-leak/\* (1+4) do NOT call withTenantTx: `! grep -RE "withTenantTx" tests/tenant-leak/no-guc-zero-rows.test.ts tests/tenant-leak/force-rls-on-all-tables.test.ts` exits 0
- [ ] PC-20: seed-two-tenants uses signUp + createWorkspace (NOT migrator role direct INSERTs): `grep -F 'signUp' tests/tenant-leak/fixtures/seed-two-tenants.ts && grep -F 'createWorkspace' tests/tenant-leak/fixtures/seed-two-tenants.ts && ! grep -F 'DATABASE_URL_MIGRATOR' tests/tenant-leak/fixtures/seed-two-tenants.ts` exits 0
- [ ] PC-20: seed-two-tenants creates two tenants: `grep -cE "tenantId|tenant_id" tests/tenant-leak/fixtures/seed-two-tenants.ts` returns ≥ 4
- [ ] `test -x scripts/ci/run-tenant-leak.sh`
- [ ] `test -f .github/workflows/ci.yml`
- [ ] `grep -q "tenant-leak" .github/workflows/ci.yml`
- [ ] `grep -q "depcruise" .github/workflows/ci.yml`
- [ ] `grep -qE "runs-on:.*ubuntu" .github/workflows/ci.yml`
- [ ] `grep -qE "(setup-bun|oven-sh/setup-bun)" .github/workflows/ci.yml`
- [ ] `grep -qE "services:" .github/workflows/ci.yml` AND `grep -qE "postgres:17" .github/workflows/ci.yml`
- [ ] PC-10: CI workflow runs Playwright E2E: `grep -F 'playwright' .github/workflows/ci.yml || grep -F 'cross-tenant-cache' .github/workflows/ci.yml` exits 0
- [ ] `grep -q "test:ci-gate" package.json`
- [ ] Local execution: `bash scripts/ci/run-tenant-leak.sh` exits 0
- [ ] Negative test: temporarily change app_role to BYPASSRLS in init SQL → leak tests must FAIL (manual smoke; documented in script comments)
      </acceptance_criteria>

<tasks>

<task id="01.10.01" type="auto">
  <description>Author tests/tenant-leak/USER-DATA-TABLES.txt as the authoritative enumeration with PC-12 USER-SCOPED flagging. Format: each line `<schema.table>  <SCOPE>` where SCOPE is either `TENANT-SCOPED` or `USER-SCOPED`. Two sections: INCLUDED (must have RLS + FORCE) and EXCLUDED (infrastructure, outside RLS). INCLUDED list with PC-12 tagging:

```
# INCLUDED — must have FORCE ROW LEVEL SECURITY
identity.users                            USER-SCOPED   # users_self_visible policy
identity.sessions                         USER-SCOPED   # sessions_owner_only policy
identity.accounts                         USER-SCOPED   # accounts_owner_only policy
identity.user_preferences                 USER-SCOPED   # user_preferences_owner_only policy
tenancy.workspaces                        TENANT-SCOPED # workspaces_tenant_isolation policy
tenancy.workspace_members                 TENANT-SCOPED # workspace_members_tenant_isolation (+ workspace_members_self bootstrap policy from PC-01)
tenancy.shared_workspace_member_shares    TENANT-SCOPED # shares_tenant_isolation policy
shared_kernel.audit_history               TENANT-SCOPED # audit_history_tenant_isolation policy
shared_kernel.user_keys                   USER-SCOPED   # PC-12: user_keys_owner_only policy keyed by app.current_user_id (NOT app.tenant_ids)
budgeting.expense_ledger                  TENANT-SCOPED # expense_ledger_tenant_isolation policy

# EXCLUDED — infrastructure, NOT under RLS (Pitfall 10)
shared_kernel.outbox                      EXCLUDED      # Pitfall 10: GRANT-restricted infrastructure (app_role INSERT only, worker_role SELECT/UPDATE only)
identity.verifications                    EXCLUDED      # token-keyed; the token IS the credential
tenancy.workspace_invitations             EXCLUDED      # token-keyed; same pattern as identity.verifications
# pgboss.* tables                         EXCLUDED      # job queue infrastructure
# drizzle.*                               EXCLUDED      # migration metadata
```

File is plain text. Author tests/tenant-leak/fixtures/raw-pg-client.ts exporting `rawAppClient(): pg.Client` and `rawWorkerClient()` — connects using DATABASE_URL_APP / DATABASE_URL_WORKER as app_role/worker_role respectively, NEVER calls SET LOCAL app.tenant_ids.</description>
<files>tests/tenant-leak/USER-DATA-TABLES.txt, tests/tenant-leak/fixtures/raw-pg-client.ts</files>
<verify>
<automated>bash -c 'set -e; for t in identity.users identity.sessions identity.user_preferences tenancy.workspaces tenancy.workspace_members tenancy.shared_workspace_member_shares shared_kernel.audit_history shared_kernel.user_keys budgeting.expense_ledger; do grep -qF "$t" tests/tenant-leak/USER-DATA-TABLES.txt || { echo "missing INCLUDED: $t"; exit 1; }; done; grep -F "USER-SCOPED" tests/tenant-leak/USER-DATA-TABLES.txt; grep -F "TENANT-SCOPED" tests/tenant-leak/USER-DATA-TABLES.txt; grep -E "shared_kernel\\.user_keys.*USER-SCOPED" tests/tenant-leak/USER-DATA-TABLES.txt; grep -E "Pitfall 10|outbox.*EXCLUDED" tests/tenant-leak/USER-DATA-TABLES.txt; grep -q "shared_kernel.outbox" tests/tenant-leak/USER-DATA-TABLES.txt; grep -q "new Client" tests/tenant-leak/fixtures/raw-pg-client.ts; ! grep -q "withTenantTx" tests/tenant-leak/fixtures/raw-pg-client.ts'</automated>
</verify>
<deps>01.02, 01.03, 01.06</deps>
</task>

<task id="01.10.02" type="auto">
  <description>PC-20: Author tests/tenant-leak/fixtures/seed-two-tenants.ts that seeds via app_role + application services (NOT migrator credentials). Exports `seedTwoTenants()`: uses `createIdentityModule()` + `createTenancyModule()` from package roots; calls `signUp({ auth }, ...)` to create alice@example.test and bob@example.test (both via the application service path, hitting the user.create.before/after hooks); calls `createWorkspace({ auth }, ...)` to create one PRIVATE workspace owned by alice (tenantA) and one SHARED workspace owned by alice with bob as member (tenantB). After workspaces exist, opens withTenantTx for each and writes one audit_history row + one expense_ledger row per tenant via tx.execute(sql`INSERT ...`) — these tenant-scoped writes prove the application path produces seeded data through normal tenant context. Returns `{tenantA: TenantId, tenantB: TenantId, alice: UserId, bob: UserId}`. Includes a header comment: "PC-20: This fixture exercises the same code path the leak gate is protecting (application service → tenant-aware writes via app_role with NOBYPASSRLS). Seeding through migrator credentials would bypass the application boundary and provide false confidence."</description>
  <files>tests/tenant-leak/fixtures/seed-two-tenants.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "seedTwoTenants" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -q "tenantA" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -q "tenantB" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -F "signUp" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -F "createWorkspace" tests/tenant-leak/fixtures/seed-two-tenants.ts; ! grep -F "DATABASE_URL_MIGRATOR" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -F "PC-20" tests/tenant-leak/fixtures/seed-two-tenants.ts; grep -qE "PRIVATE|SHARED" tests/tenant-leak/fixtures/seed-two-tenants.ts; test "$(grep -cE "tenantId|tenant_id" tests/tenant-leak/fixtures/seed-two-tenants.ts)" -ge 4'</automated>
  </verify>
  <deps>01.10.01, 01.05, 01.06</deps>
</task>

<task id="01.10.03" type="auto">
  <description>Author tests/tenant-leak/no-guc-zero-rows.test.ts (Test 1). Setup: import seedTwoTenants, run it before tests. Parse USER-DATA-TABLES.txt at runtime — split lines by SCOPE tag. For each table in INCLUDED:
    - If SCOPE=TENANT-SCOPED: open rawAppClient (no GUC), execute `SELECT COUNT(*) FROM ${table}`, assert count === 0
    - If SCOPE=USER-SCOPED: open rawAppClient (no GUC), execute `SELECT COUNT(*) FROM ${table}`, assert count === 0 (RLS without app.current_user_id GUC denies all rows)
  Then second sub-test for tenant-scoped tables: open rawAppClient, execute `BEGIN; SET LOCAL app.tenant_ids = $tenantA::uuid::text[]; SET LOCAL app.current_user_id = $alice::text; SELECT COUNT(*) FROM tenancy.workspaces WHERE id = $tenantB; COMMIT;` — assert count === 0 (cross-tenant filter — green-washing protection per T-13).
  Third sub-test for user-scoped tables: open rawAppClient, BEGIN; SET LOCAL app.current_user_id = $alice; SELECT COUNT(*) FROM identity.user_preferences WHERE user_id = $bob; COMMIT — assert 0 (cross-user filter, PC-12).
  Use bun:test `describe` + `it` with explicit timeout 5s.</description>
  <files>tests/tenant-leak/no-guc-zero-rows.test.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "rawAppClient" tests/tenant-leak/no-guc-zero-rows.test.ts; grep -q "seedTwoTenants" tests/tenant-leak/no-guc-zero-rows.test.ts; grep -q "app.tenant_ids" tests/tenant-leak/no-guc-zero-rows.test.ts; grep -q "USER-DATA-TABLES" tests/tenant-leak/no-guc-zero-rows.test.ts; grep -qE "from .bun:test." tests/tenant-leak/no-guc-zero-rows.test.ts; ! grep -q "withTenantTx" tests/tenant-leak/no-guc-zero-rows.test.ts; grep -F "USER-SCOPED" tests/tenant-leak/no-guc-zero-rows.test.ts'</automated>
  </verify>
  <deps>01.10.02</deps>
</task>

<task id="01.10.04" type="auto">
  <description>Author tests/tenant-leak/job-without-tenant-errors.test.ts (Test 2). Import the worker handler wrapper from packages/platform — the wrapper that requires payload.tenantIds before any DB read. Test 1: invoke wrapper with `{ tenantIds: undefined }` payload, assert it throws an error whose name or message includes "TenantContextMissing" BEFORE any DB query is issued. Test 2: invoke wrapper with `{ tenantIds: [] }` (empty array), assert same TenantContextMissing error. Test 3: invoke wrapper with valid `{ tenantIds: [tenantA] }`, assert handler runs without error. Use bun:test mock for pg.Client.query to detect read attempts.</description>
  <files>tests/tenant-leak/job-without-tenant-errors.test.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "TenantContextMissing" tests/tenant-leak/job-without-tenant-errors.test.ts; grep -q "tenantIds" tests/tenant-leak/job-without-tenant-errors.test.ts; grep -qE "from .bun:test." tests/tenant-leak/job-without-tenant-errors.test.ts; grep -qE "(undefined|\\[\\])" tests/tenant-leak/job-without-tenant-errors.test.ts'</automated>
  </verify>
  <deps>01.10.02, 01.03, 01.07</deps>
</task>

<task id="01.10.05" type="auto">
  <description>Author tests/tenant-leak/pg-roles-no-bypassrls.test.ts (Test 3). Connect as migrator (CI_ADMIN_DATABASE_URL or equivalent admin role). Run `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_role','worker_role','migrator')`. Assert: result has exactly 3 rows AND every rolbypassrls === false. If any role missing → fail. If any rolbypassrls === true → fail with role name in message.</description>
  <files>tests/tenant-leak/pg-roles-no-bypassrls.test.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "rolbypassrls" tests/tenant-leak/pg-roles-no-bypassrls.test.ts; grep -q "pg_roles" tests/tenant-leak/pg-roles-no-bypassrls.test.ts; grep -qE "(app_role|worker_role|migrator)" tests/tenant-leak/pg-roles-no-bypassrls.test.ts; grep -qE "from .bun:test." tests/tenant-leak/pg-roles-no-bypassrls.test.ts'</automated>
  </verify>
  <deps>01.10.01</deps>
</task>

<task id="01.10.06" type="auto">
  <description>Author tests/tenant-leak/force-rls-on-all-tables.test.ts (Test 4). Connect as migrator. Read the INCLUDED table list from USER-DATA-TABLES.txt at runtime (parse the text file; both TENANT-SCOPED and USER-SCOPED lines go into the assertion list). Run `SELECT n.nspname || '.' || c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('identity','tenancy','shared_kernel','budgeting') AND (n.nspname || '.' || c.relname) = ANY($1::text[])` with the parsed list. Assert: every row has relrowsecurity=true AND relforcerowsecurity=true. Output a per-table check on failure. Also assert that EXCLUDED tables (shared_kernel.outbox, identity.verifications, tenancy.workspace_invitations + pgboss.*) are NOT in the result if probed — relforcerowsecurity=false for them (expected).</description>
  <files>tests/tenant-leak/force-rls-on-all-tables.test.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "relforcerowsecurity" tests/tenant-leak/force-rls-on-all-tables.test.ts; grep -q "USER-DATA-TABLES" tests/tenant-leak/force-rls-on-all-tables.test.ts; grep -q "pg_class" tests/tenant-leak/force-rls-on-all-tables.test.ts; grep -qE "from .bun:test." tests/tenant-leak/force-rls-on-all-tables.test.ts'</automated>
  </verify>
  <deps>01.10.01</deps>
</task>

<task id="01.10.07" type="auto">
  <description>PC-08: Author tests/tenant-leak/in-process-bus-tenant-scope.test.ts (Test 5). Setup: import seedTwoTenants. Steps:
    1. Subscribe a handler to event type 'leak.test.evt' that captures `current_setting('app.tenant_ids', true)` from inside the handler (via a raw query through the dispatcher's tx). For simplicity, the handler calls a custom probe: `await deps.probe.captureTenantIds()` where `probe` is a mock that reads the setting via the same pg connection the dispatcher used.
    2. Open withTenantTx(tenantA, alice) and writeOutbox event tenantId=tenantA, eventType='leak.test.evt'. Open withTenantTx(tenantB, bob) and writeOutbox event tenantId=tenantB, eventType='leak.test.evt'.
    3. Capture: const captured: { handlerForTenant: string, sawTenantIds: string }[] = [];
    4. Subscribe handler that pushes { handlerForTenant: evt.tenantId, sawTenantIds: <current_setting result> } into captured.
    5. Call dispatchOutboxBatch().
    6. Assert: captured.length === 2; for each entry, sawTenantIds CONTAINS handlerForTenant AND does NOT contain the OTHER tenant's id. Proves PC-08 invariant: dispatcher applies tenantContextSql([row.tenant_id], ...) before publish, so each handler invocation sees only its row's tenant in app.tenant_ids.
    The test reads the GUC by passing the dispatcher's tx into the handler context — practical implementation: the test temporarily monkey-patches eventBus.subscribe to wrap the handler with a function that opens a NEW pool client (raw pg.Client as app_role) and queries `SELECT current_setting('app.tenant_ids', true)` — this proves a SEPARATE pool connection cannot see the dispatcher's GUC (confirms isolation), so the test instead asserts the handler PARAMETER `evt.tenantId` matches the captured value AND that the handler running inside the dispatcher's tx sees the row's tenant. NOTE: Postgres SET LOCAL is per-transaction, so a handler that opens its own connection won't see the dispatcher's setting — the test must use a `tx`-aware handler signature or prove the invariant via the dispatcher's `current_setting` snapshot returned in the published payload.</description>
  <files>tests/tenant-leak/in-process-bus-tenant-scope.test.ts</files>
  <verify>
    <automated>bash -c 'set -e; grep -q "app.tenant_ids" tests/tenant-leak/in-process-bus-tenant-scope.test.ts; grep -q "eventBus" tests/tenant-leak/in-process-bus-tenant-scope.test.ts; grep -q "dispatchOutboxBatch" tests/tenant-leak/in-process-bus-tenant-scope.test.ts; grep -q "seedTwoTenants" tests/tenant-leak/in-process-bus-tenant-scope.test.ts; grep -qE "from .bun:test." tests/tenant-leak/in-process-bus-tenant-scope.test.ts'</automated>
  </verify>
  <deps>01.10.02, 01.03</deps>
</task>

<task id="01.10.08" type="auto">
  <description>PC-10: Author apps/web/e2e/cross-tenant-cache.spec.ts (Test 6 — Playwright E2E). Reuses the seedTwoTenants application-service path. Steps:
    1. Programmatically (via the app's API) sign up tenant-A user (alice) and tenant-B user (bob); each creates a SHARED workspace named distinctively (`Tenant-A WS`, `Tenant-B WS`).
    2. Use Playwright browser context: log in as alice; visit /en/workspaces; assert `Tenant-A WS` appears in the workspace switcher; assert `Tenant-B WS` does NOT appear.
    3. Within the SAME browser context (same Serwist cache), log out (POST /api/auth/sign-out), log in as bob; reload /en/workspaces; assert `Tenant-B WS` appears AND `Tenant-A WS` does NOT appear (cache must NOT serve cached workspace-A HTML).
    4. Inspect Network tab via Playwright's API: every /api/workspaces request after bob's login must be a fresh fetch (NOT served from sw cache) — assert `from-service-worker: false` or equivalent.
    Place under apps/web/e2e/cross-tenant-cache.spec.ts. Reference the playwright.config.ts from Plan 00. CI runs this via `bunx playwright test apps/web/e2e/cross-tenant-cache.spec.ts` after compose stack is healthy.</description>
  <files>apps/web/e2e/cross-tenant-cache.spec.ts</files>
  <verify>
    <automated>bash -c 'set -e; test -f apps/web/e2e/cross-tenant-cache.spec.ts; grep -q "tenant-A" apps/web/e2e/cross-tenant-cache.spec.ts || grep -q "Tenant-A" apps/web/e2e/cross-tenant-cache.spec.ts; grep -q "tenant-B" apps/web/e2e/cross-tenant-cache.spec.ts || grep -q "Tenant-B" apps/web/e2e/cross-tenant-cache.spec.ts; grep -F "workspace" apps/web/e2e/cross-tenant-cache.spec.ts; grep -qE "@playwright/test|playwright" apps/web/e2e/cross-tenant-cache.spec.ts'</automated>
  </verify>
  <deps>01.08, 01.10.02</deps>
</task>

<task id="01.10.09" type="auto">
  <description>Author scripts/ci/run-tenant-leak.sh (executable bash; CI gate runner). Header `set -euo pipefail`. Steps: (1) verify .env or fall back to test placeholders. (2) `docker compose up -d --wait db` (db only). (3) `docker compose run --rm migrator` — fail-closed if migrate errors. (4) `bun test tests/tenant-leak --timeout 30000` — runs all 5 backend tests (1, 2, 3, 4, 5). (5) trap docker-compose-down on EXIT. Print elapsed time. Add header comment: "These tests use raw pg.Client (NOT withTenantTx) for tests 1 + 4 and a two-tenant fixture seeded via app_role application services (PC-20). To validate this gate is real, manually flip app_role to BYPASSRLS in init SQL.tpl and rerun — every test should fail. PC-08 test #5 verifies in-process bus handlers see only their row's tenant. PC-10 test #6 (Playwright cross-tenant-cache) runs separately in the apps/web E2E suite." Add `test:ci-gate` script to root package.json invoking this script.</description>
  <files>scripts/ci/run-tenant-leak.sh, package.json</files>
  <verify>
    <automated>bash -c 'set -e; test -x scripts/ci/run-tenant-leak.sh; grep -q "set -euo pipefail" scripts/ci/run-tenant-leak.sh; grep -q "bun test tests/tenant-leak" scripts/ci/run-tenant-leak.sh; grep -q "docker compose run --rm migrator" scripts/ci/run-tenant-leak.sh; grep -qE "T-13|green-washing|PC-20" scripts/ci/run-tenant-leak.sh; grep -q "test:ci-gate" package.json; bash -n scripts/ci/run-tenant-leak.sh'</automated>
  </verify>
  <deps>01.10.03, 01.10.04, 01.10.05, 01.10.06, 01.10.07, 01.09</deps>
</task>

<task id="01.10.10" type="auto">
  <description>Author .github/workflows/ci.yml (GitHub Actions; ubuntu-latest matrix). Jobs: (1) `lint-and-build`: setup Bun, bun install, bunx tsc --noEmit (root + apps/web), bunx eslint, bunx depcruise --config .dependency-cruiser.cjs apps packages, grep CI gates for both `.transaction(` (PC-04) and `appPool().connect(` (PC-03) outside packages/db/src/tx.ts. (2) `unit-tests`: setup Bun, bun install, `bun test` (all packages). (3) `web-tests`: setup Bun + Node, `bunx vitest run --root apps/web`, `bunx next build apps/web`. (4) `tenant-leak-gate`: services.postgres image postgres:17-alpine with healthcheck; setup Bun; bun install; copy init SQL into postgres init dir via service env; `bash scripts/ci/run-tenant-leak.sh`. (5) `compose-smoke` (only on main + PR labels `compose-smoke`): runs `bash tests/compose-up.sh`. (6) `playwright-cross-tenant-cache`: builds compose stack, runs `bunx playwright test apps/web/e2e/cross-tenant-cache.spec.ts` (PC-10). Add a separate workflow .github/workflows/tenant-leak.yml (workflow_dispatch + push) running ONLY job 4 for fast feedback. All jobs use Linux only.</description>
  <files>.github/workflows/ci.yml, .github/workflows/tenant-leak.yml</files>
  <verify>
    <automated>bash -c 'set -e; test -f .github/workflows/ci.yml; test -f .github/workflows/tenant-leak.yml; grep -qE "(setup-bun|oven-sh/setup-bun)" .github/workflows/ci.yml; grep -q "depcruise" .github/workflows/ci.yml; grep -q "tenant-leak" .github/workflows/ci.yml; grep -q "ubuntu" .github/workflows/ci.yml; grep -q "postgres:17" .github/workflows/ci.yml; grep -qE "playwright|cross-tenant-cache" .github/workflows/ci.yml; grep -qE "workflow_dispatch" .github/workflows/tenant-leak.yml; grep -qE "run-tenant-leak.sh|tests/tenant-leak" .github/workflows/tenant-leak.yml'</automated>
  </verify>
  <deps>01.10.09</deps>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                               | Description                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Test runner → Postgres                 | leak tests connect as app_role / worker_role with NO GUC                                       |
| Two-tenant fixture → leak tests        | seeded via app_role application services (PC-20); proves cross-tenant queries return zero rows |
| Outbox dispatcher → in-process handler | PC-08: handler runs under row's tenant; test 5 asserts isolation                               |
| Browser cache → tenant context         | PC-10: Playwright proves Serwist denylist works end-to-end                                     |

## STRIDE Threat Register

| Threat ID    | Category | Component                                                              | Disposition                             | Mitigation Plan                                                                                                                                                                                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-1          | I        | Cross-tenant data leak via missing GUC                                 | mitigated (THIS PLAN IS THE MITIGATION) | no-guc-zero-rows.test.ts asserts SELECT without GUC returns 0 rows for every user-data table; force-rls-on-all-tables.test.ts asserts FORCE ROW LEVEL SECURITY everywhere                                                                        |
| T-2          | I        | Worker job omitting tenantIds reading tenant data                      | mitigated                               | job-without-tenant-errors.test.ts proves the wrapper throws TenantContextMissing before any DB read                                                                                                                                              |
| T-3          | E        | BYPASSRLS role accidentally granted                                    | mitigated                               | pg-roles-no-bypassrls.test.ts queries pg_roles and fails closed                                                                                                                                                                                  |
| T-13         | T        | Green-washed leak gate                                                 | mitigated                               | PC-20: fixture seeds via app_role + application services (signUp + createWorkspace), proving the real user-flow boundary holds; tests use raw pg.Client (NOT withTenantTx) for test 1+4; manual smoke documented                                 |
| T-1 (outbox) | I        | Outbox table excluded from RLS (Pitfall 10)                            | accepted                                | shared_kernel.outbox is GRANT-restricted infrastructure; excluded from FORCE-RLS test by name in USER-DATA-TABLES.txt                                                                                                                            |
| T-15 (PC-08) | I        | In-process handler escaping the row's tenant scope                     | mitigated                               | in-process-bus-tenant-scope.test.ts (test 5) seeds two tenants, dispatches one event per tenant, asserts each handler sees ONLY its row's tenant in app.tenant_ids — proves dispatcher's tenantContextSql wrap holds across the publish boundary |
| T-9 (PC-10)  | I        | Browser cross-tenant cache leak via Serwist                            | mitigated                               | apps/web/e2e/cross-tenant-cache.spec.ts (test 6) — Playwright E2E logs in as tenant-A, captures workspace switcher state, logs out, logs in as tenant-B in same browser context, asserts tenant-A workspaces NEVER appear in tenant-B's view     |
| T-12 (PC-12) | I        | Cross-user leak via user_keys / sessions / accounts USER-SCOPED tables | mitigated                               | USER-DATA-TABLES.txt flags these as USER-SCOPED; test 1 third sub-test asserts cross-user filter (user-A's app.current_user_id cannot see user-B's row)                                                                                          |

</threat_model>

<verification>
Run from repo root; each must exit 0:

```bash
bash -c '
set -e
# 1. Files
for f in tests/tenant-leak/no-guc-zero-rows.test.ts \
         tests/tenant-leak/job-without-tenant-errors.test.ts \
         tests/tenant-leak/pg-roles-no-bypassrls.test.ts \
         tests/tenant-leak/force-rls-on-all-tables.test.ts \
         tests/tenant-leak/in-process-bus-tenant-scope.test.ts \
         tests/tenant-leak/fixtures/seed-two-tenants.ts \
         tests/tenant-leak/fixtures/raw-pg-client.ts \
         tests/tenant-leak/USER-DATA-TABLES.txt \
         apps/web/e2e/cross-tenant-cache.spec.ts \
         scripts/ci/run-tenant-leak.sh \
         .github/workflows/ci.yml \
         .github/workflows/tenant-leak.yml; do
  test -e "$f" || { echo "missing $f"; exit 1; }
done

# 2. Green-washing protection: tests 1+4 use raw pg.Client, not withTenantTx
! grep -RE "withTenantTx" tests/tenant-leak/no-guc-zero-rows.test.ts tests/tenant-leak/force-rls-on-all-tables.test.ts

# 3. PC-12: USER-DATA-TABLES.txt flags user-scoped tables
grep -F "USER-SCOPED" tests/tenant-leak/USER-DATA-TABLES.txt
grep -E "shared_kernel\\.user_keys.*USER-SCOPED" tests/tenant-leak/USER-DATA-TABLES.txt

# 4. PC-20: seed-two-tenants uses signUp + createWorkspace, NOT migrator role
grep -F "signUp" tests/tenant-leak/fixtures/seed-two-tenants.ts
grep -F "createWorkspace" tests/tenant-leak/fixtures/seed-two-tenants.ts
! grep -F "DATABASE_URL_MIGRATOR" tests/tenant-leak/fixtures/seed-two-tenants.ts

# 5. Test invariants
grep -q "rolbypassrls" tests/tenant-leak/pg-roles-no-bypassrls.test.ts
grep -q "relforcerowsecurity" tests/tenant-leak/force-rls-on-all-tables.test.ts
grep -q "TenantContextMissing" tests/tenant-leak/job-without-tenant-errors.test.ts
grep -q "app.tenant_ids" tests/tenant-leak/no-guc-zero-rows.test.ts
grep -q "app.tenant_ids" tests/tenant-leak/in-process-bus-tenant-scope.test.ts

# 6. PC-10 Playwright spec exists with tenant references
grep -E "tenant-A|Tenant-A" apps/web/e2e/cross-tenant-cache.spec.ts
grep -E "tenant-B|Tenant-B" apps/web/e2e/cross-tenant-cache.spec.ts

# 7. CI workflow shape
grep -q "tenant-leak" .github/workflows/ci.yml
grep -q "depcruise" .github/workflows/ci.yml
grep -qE "(setup-bun|oven-sh/setup-bun)" .github/workflows/ci.yml
grep -q "postgres:17" .github/workflows/ci.yml
grep -qE "ubuntu" .github/workflows/ci.yml
grep -qE "playwright|cross-tenant-cache" .github/workflows/ci.yml

# 8. Package script
grep -q "test:ci-gate" package.json

# 9. Scripts
test -x scripts/ci/run-tenant-leak.sh
bash -n scripts/ci/run-tenant-leak.sh

echo "tenant-leak gate plan checks pass"
'
```

</verification>

<success_criteria>

- 6 leak tests fail closed when any RLS / GUC / role / wrapper / bus-scope / cache invariant is broken
- Two-tenant fixture seeded via app_role + application services (PC-20) — proves the user-flow boundary, not just the DB layer
- Tests 1+4 connect via raw pg.Client (NOT withTenantTx) so RLS is proven independent of app code
- pg_roles confirms app_role / worker_role / migrator are NOBYPASSRLS
- pg_class confirms FORCE ROW LEVEL SECURITY for every user-data table; outbox correctly excluded
- worker handler wrapper rejects empty / undefined tenantIds before any DB read
- PC-08 test #5: in-process bus handlers run under their row's tenant context
- PC-10 test #6: Playwright E2E proves Serwist runtime cache does not leak tenant-A workspaces into tenant-B session
- PC-12: USER-DATA-TABLES.txt flags user-scoped tables (user_keys, sessions, accounts, user_preferences) for separate cross-user filter assertion
- GitHub Actions workflow runs the full Phase-1 gate on every push (typecheck + lint + depcruise + grep gates [PC-03, PC-04] + bun test + leak suite + Playwright cross-tenant-cache)
- A separate tenant-leak.yml workflow allows fast feedback via workflow_dispatch
- depcruise CI step blocks domain → drizzle/hono/adapters imports (ENGR-10) and apps/\*_ → packages/_/src/{adapters,application,domain,ports} (PC-02)
- package.json adds `test:ci-gate` for local execution
  </success_criteria>

<output>
.planning/phases/01-foundations/01-10-SUMMARY.md
</output>
