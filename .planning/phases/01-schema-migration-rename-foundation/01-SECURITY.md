---
phase: 01-schema-migration-rename-foundation
slug: schema-migration-rename-foundation
status: verified
threats_total: 8
threats_closed: 8
threats_open: 0
audited_at: 2026-06-28
asvs_level: 2
block_on: high
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.
> Retroactive audit — phase predates the secure-phase gate.

---

## Trust Boundaries

| Boundary                                                    | Description                                                                                                                                                | Data Crossing                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| migrator role → Postgres                                    | Migration `0012` + `post-migration.sql` declare ENABLE/FORCE RLS + tenant-isolation policies that gate every later app/worker connection                   | DDL: table renames, column drops, policy bodies, GRANTs    |
| app_role / worker_role → `budgeting.tasks` (new v1.1 table) | Per-tenant RLS predicate isolates rows by `app.tenant_ids` GUC; FORCE RLS blocks table owner too                                                           | Task rows (kind, payload_json, status, budget_id)          |
| app_role / worker_role → renamed tenancy/budgeting tables   | `*_tenant_isolation` policies on `app.tenant_ids` survive (shares, mode_history) or are explicitly recreated (budgets, members, wallets) across the rename | budgets, budget_members, wallets, budget_mode_history rows |
| CI tenant-leak gate → freshly-migrated DB                   | Raw migrator pg client asserts `relforcerowsecurity=true` + zero cross-tenant rows on every enumerated table; fails closed                                 | `pg_class` flags, cross-tenant row counts                  |

---

## Threat Register

| Threat ID | Category               | Component                                                                | Disposition | Mitigation                                                                                                                                                                                                                                                                                                                                                            | Status |
| --------- | ---------------------- | ------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-01-01   | Information Disclosure | New `budgeting.tasks` cross-tenant read/write                            | mitigate    | `ENABLE RLS` `drizzle/0012_phase01_v11_rename.sql:283`; `FORCE RLS` `0012:286` + `apps/migrator/post-migration.sql:707`; policy `tasks_tenant_isolation` (FOR ALL TO app_role,worker_role, `tenant_id = ANY(app.tenant_ids)`) `0012:291-292`; Drizzle pgPolicy `packages/budgeting/src/adapters/persistence/tasks-schema.ts:44-50`                                    | closed |
| T-01-02   | Tampering              | New `tasks` table escapes tenant-leak gate (green-wash)                  | mitigate    | `budgeting.tasks TENANT-SCOPED` `tests/tenant-leak/USER-DATA-TABLES.txt:37`; Test 4 reads file at runtime + fails on `relforcerowsecurity=false` or table NOT FOUND `force-rls-on-all-tables.test.ts:78-99`; dedicated `tests/tenant-leak/tasks-cross-tenant.test.ts`                                                                                                 | closed |
| T-01-03   | Information Disclosure | RENAME workspaces→budgets loses RLS                                      | mitigate    | stale `workspaces_*` policies dropped `post-migration.sql:240-244`; recreated `budgets_tenant_update:340` / `budgets_tenant_delete:344` / `budgets_select_open:285` / insert-open+triggers `:253-330`; `FORCE RLS :217`                                                                                                                                               | closed |
| T-01-04   | Information Disclosure | RENAME workspace_members→budget_members loses RLS                        | mitigate    | stale `workspace_members_*` dropped `post-migration.sql:246-251`; recreated `budget_members_tenant_update:351` / `_tenant_delete:355` / `_self:302` / `_select_open:293`; `FORCE RLS :218`                                                                                                                                                                            | closed |
| T-01-05   | Information Disclosure | RENAME accounts→wallets loses RLS                                        | mitigate    | stale `accounts_tenant_isolation`/`accounts_worker_cron_scan` dropped `post-migration.sql:401-402`; recreated `wallets_tenant_isolation:404` + `wallets_worker_cron_scan:416`; `FORCE RLS :388`                                                                                                                                                                       | closed |
| T-01-06   | Information Disclosure | RENAME of shares + mode_history loses RLS                                | mitigate    | `shared_budget_member_shares`: FORCE RLS `post-migration.sql:219`, policy `shares_tenant_isolation` `packages/tenancy/src/adapters/persistence/shares-schema.ts:35` (survives rename); `budget_mode_history`: FORCE RLS `post-migration.sql:471`, policy survives rename from `drizzle/0009_breezy_karen_page.sql:79`, Drizzle `budget-mode-history-schema.ts:34`     | closed |
| T-01-07   | Tampering              | Tenant-leak gate not retargeted at renamed tables                        | mitigate    | gate enumerates NEW names only — `USER-DATA-TABLES.txt:30,31,32,36,37`; no stale `workspaces`/`budgeting.accounts` (only `identity.accounts` EXCLUDED:53); Test 4 queries `pg_class` for existence → renamed-away table reports NOT FOUND and fails `force-rls-on-all-tables.test.ts:78-81`                                                                           | closed |
| T-01-08   | Elevation of Privilege | Destructive rename/drop leaves half-applied unsafe state (table w/o RLS) | mitigate    | every step idempotent (`DO`/`IF EXISTS`/`IF NOT EXISTS`) `drizzle/0012:7-294`; single-writer advisory lock `apps/migrator/src/migrate.ts:19`; drizzle per-file transaction makes CREATE TABLE+ENABLE+FORCE+POLICY atomic (`0012:253-292`); post-migration re-forces RLS each run `:707` (FORCE RLS w/o policy = deny-all, fail-closed); end-state verified by CI gate | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

No accepted risks. All Phase-01 threats dispositioned `mitigate`.

---

## Unregistered Flags

- **LOW (pre-existing, not a Phase-01 regression):** `budgeting.wallets` (renamed from `accounts`, holds balance data) is not enumerated in `tests/tenant-leak/USER-DATA-TABLES.txt`, so the gate's Test 4 / Test 1 do not independently assert FORCE RLS on it. It IS protected in code (FORCE RLS `post-migration.sql:388`, `wallets_tenant_isolation :404`). The gate is a curated subset; `accounts` was never listed, so the rename introduced no regression. **Recommendation:** add `budgeting.wallets TENANT-SCOPED` to harden against future RLS drift.
- **INFO (cosmetic, no security impact):** policy-name drift on `budget_mode_history`. Drizzle declares `budget_mode_history_tenant_isolation` (`budget-mode-history-schema.ts:34`) but the live RENAME TABLE in `0012` did not rename the policy, which retains `workspace_budget_mode_history_tenant_isolation` (`drizzle/0009:79`). Predicate byte-identical (`tenant_id = ANY(app.tenant_ids)`); FORCE RLS + behavioral gate cover the table.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-06-28 | 8             | 8      | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
