---
phase: 07-tasks-queue
slug: tasks-queue
status: verified
threats_total: 55
threats_closed: 55
threats_open: 0
audited_at: 2026-06-28
asvs_level: 2
block_on: high
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.
> Retroactive audit — phase predates the secure-phase gate. Audited in two tranches
> (plans 01-05 and 06-10); accepted-risk IDs from the second tranche renumbered to
> AR-07-08..19 to keep IDs unique within this contract.

---

## Trust Boundaries

| Boundary                                            | Description                                                                                           | Data Crossing                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| migration runtime → live schema                     | 0026 idempotent + atomic; rerun on fresh DB safe                                                      | DDL, CHECK constraints, partial unique indexes |
| application service → adapter                       | service holds tenantId from route guard; RLS enforces at DB regardless                                | tenantId, budgetId                             |
| adapter UPDATE → DB rows                            | resolve UPDATE WHERE includes `tenant_id` → no cross-tenant resolve                                   | task status writes                             |
| computeCushionSummary → FxProvider                  | external FX rate; `0<rate<1e6` bounds check prevents overflow                                         | FX rate                                        |
| mutation use case → recompute helper (tx)           | caller's `withTenantTx` = RLS context; helper requires the tx (no own-tx fallback)                    | tenant GUC scope                               |
| worker sweep → all tenants (SYSTEM_USER)            | `withInfraTx` lists tenants (worker_role, NOBYPASSRLS); per-tenant `withTenantTx` re-enters RLS scope | tenant_id list, task rows                      |
| client → POST /tasks/:taskId/resolve                | Untrusted taskId UUID; tenant-guard + `tenant_id` WHERE + RLS                                         | task status flip                               |
| client → GET /budgets/:id/cushion-summary           | Untrusted budgetId; tenant-guard → 404; RLS-scoped read                                               | required/actual/shortfall cents                |
| client → PATCH /budgets/:id (cushion_target_months) | Untrusted number; Zod 1..60 + DB CHECK                                                                | identity / cushion fields                      |
| task payload (jsonb) → DOM (TaskBannerRow)          | Server-RLS-scoped payload; ICU params + React text-node escaping; no `dangerouslySetInnerHTML`        | rule_name, amounts                             |
| E2E env → real DB                                   | fresh-user-per-scenario fixture; per-scenario timeouts                                                | throwaway test users                           |

---

## Threat Register

### Plans 07-01 … 07-05

| Threat ID  | Category               | Component                                  | Disposition | Mitigation (file:line)                                                                                                                                                              | Status |
| ---------- | ---------------------- | ------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- | ------ |
| T-07-01-01 | Tampering              | cushion_target_months range                | mitigate    | DB CHECK `>0 AND <=60` `drizzle/0026_phase07_tasks_cushion_months.sql:24` + Zod `z.number().min(1).max(60)` `apps/api/src/routes/budget-identity.ts:40`                             | closed |
| T-07-01-02 | DoS                    | Dedup indexes                              | mitigate    | 3 partial unique indexes `drizzle/0026...sql:28-42`                                                                                                                                 | closed |
| T-07-01-03 | Information Disclosure | Test scaffolds                             | accept      | AR-07-01 — `it.todo` stubs, reuses gate-tested tenant-leak harness                                                                                                                  | closed |
| T-07-01-04 | Tampering              | Manual REQUIREMENTS/ROADMAP edits          | mitigate    | TASK-05 marked DROPPED `.planning/REQUIREMENTS.md:132`; hard enforcement via DB CHECK `drizzle/0026...sql:18` (3-kind set). One stale doc residual — see Unregistered Flags         | closed |
| T-07-01-05 | Elevation of Privilege | drop+recreate tasks_kind_chk               | accept      | AR-07-02 — atomic within migration tx `drizzle/0026...sql:12-18`; zero rows of dropped kinds                                                                                        | closed |
| T-07-02-01 | Elevation of Privilege | Cross-tenant resolve via crafted taskId    | mitigate    | UPDATE `WHERE tenant_id` `task-repo.ts:204-207` + RLS `tasks_tenant_isolation` `tasks-schema.ts:44-50` + FORCE RLS `post-migration.sql:707`                                         | closed |
| T-07-02-02 | Tampering              | Replay/race on dedup index                 | mitigate    | `ON CONFLICT DO NOTHING` `task-repo.ts:84` + draft_id index `drizzle/0026...sql:40-42`                                                                                              | closed |
| T-07-02-03 | DoS                    | Unbounded task growth                      | mitigate    | partial unique idx `drizzle/0026...sql:28-42`; adapter never throws (`DO NOTHING`/`DO UPDATE` `task-repo.ts:84,244,293`)                                                            | closed |
| T-07-02-04 | Information Disclosure | resolve() success for unowned task         | accept      | AR-07-03 — `WHERE tenant_id` no-op `task-repo.ts:206`                                                                                                                               | closed |
| T-07-02-05 | Information Disclosure | Payload JSON/XSS injection                 | accept      | AR-07-04 — opaque jsonb `task-repo.ts:83`; render `task-banner-row.tsx` no `dangerouslySetInnerHTML`                                                                                | closed |
| T-07-03-01 | Tampering              | FX rate overflow                           | mitigate    | bounds `rateNum<=0                                                                                                                                                                  |        | rateNum>=1e6`throw`recurring-engine-fx.ts:53-54`                                            | closed |
| T-07-03-02 | Information Disclosure | computeCushionSummary reads other tenants  | mitigate    | SELECTs `WHERE tenant_id` `get-cushion-summary.ts:86,130,150` under caller `withTenantTx` GUC                                                                                       | closed |
| T-07-03-03 | DoS                    | recomputeCushionTask dup tasks             | mitigate    | emit `ON CONFLICT DO NOTHING` + resolve `WHERE status='PENDING'` `recompute-cushion-task.ts:74-98`                                                                                  | closed |
| T-07-03-04 | Tampering              | Wrong as-of FX date                        | accept      | AR-07-05 — Pitfall 5 (TODAY for cushion) + 60-min freshness gate                                                                                                                    | closed |
| T-07-03-05 | Elevation of Privilege | recomputeCushionTask without tx            | mitigate    | mandatory `tx: TenantTx` first param, no own-tx fallback `recompute-cushion-task.ts:61-65`                                                                                          | closed |
| T-07-04-01 | Tampering              | Draft INSERT + emit atomicity              | mitigate    | INSERT + `emitConfirmDraft` same `tx`, gated on `rows.length>0` `recurring-engine.ts:201,227-241`                                                                                   | closed |
| T-07-04-02 | DoS                    | Concurrent CONFIRM_DRAFT spam              | mitigate    | `tasks_confirm_draft_pending_uq` `drizzle/0026...sql:40-42` + `ON CONFLICT DO NOTHING` `task-repo.ts:84`                                                                            | closed |
| T-07-04-03 | Information Disclosure | rule_name leaks cross-tenant               | accept      | AR-07-06 — RLS `tasks-schema.ts:44-50` + FORCE `post-migration.sql:707`                                                                                                             | closed |
| T-07-04-04 | Tampering              | Wrong draft_id in resolve                  | mitigate    | `WHERE tenant_id AND payload_json->>'draft_id'` `task-repo.ts:356-358`                                                                                                              | closed |
| T-07-04-05 | Elevation of Privilege | confirm/dismiss/skip lack taskRepo         | mitigate    | wired: `factory.ts:370` (confirmRecurring), `:376` (editAndConfirm), `:381` (skip); `boot.ts:254` (confirmDraft); dismiss adapter resolve `expense-ledger-draft-port-repo.ts:61-65` | closed |
| T-07-05-01 | Tampering              | Direction field swap                       | mitigate    | direction from surplus sign `recompute-reserve-topup-task.ts:131-132`; test `packages/budgeting/test/tasks/reserve-topup.test.ts`                                                   | closed |
| T-07-05-02 | DoS                    | Concurrent wallet edits spam RESERVE_TOPUP | mitigate    | `tasks_reserve_topup_pending_uq` `drizzle/0026...sql:28-30` + `ON CONFLICT (budget_id) WHERE kind+pending` `task-repo.ts:244`                                                       | closed |
| T-07-05-03 | Information Disclosure | shortfall_cents leaks cross-tenant         | accept      | AR-07-07 — RLS `tasks-schema.ts:44-50` + FORCE `post-migration.sql:707`                                                                                                             | closed |
| T-07-05-04 | Tampering              | Missing mutation site (type flip)          | mitigate    | `(wasReserve                                                                                                                                                                        |        | isReserveNow)`gate`update-wallet.ts:97,143,178-179`→ recompute`:192` (both flip directions) | closed |
| T-07-05-05 | Elevation of Privilege | Hook fires outside withTenantTx            | mitigate    | mandatory `tx: TenantTx` first param `recompute-reserve-topup-task.ts:89-93`                                                                                                        | closed |
| T-07-05-06 | Tampering              | Sign convention error in builder           | mitigate    | sign derivation `recompute-reserve-topup-task.ts:127-132`; test `reserve-topup.test.ts`                                                                                             | closed |

### Plans 07-06 … 07-10

| Threat ID  | Category               | Component                                      | Disposition | Mitigation (file:line)                                                                                                                                                                                                                                           | Status |
| ---------- | ---------------------- | ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-07-06-01 | Elevation of Privilege | Sweep without tenant scope                     | mitigate    | `apps/worker/src/handlers/budgeting-reconciliation.ts:133-147,159-173` per-tenant `withTenantTx(TenantId,UserId(SYSTEM_USER_ID))`; `:92-100` `withInfraTx` distinct-tenant scan; worker_role NOBYPASSRLS `tests/tenant-leak/pg-roles-no-bypassrls.test.ts:15,43` | closed |
| T-07-06-02 | DoS                    | One tenant failure aborts sweep                | mitigate    | `budgeting-reconciliation.ts:148-153` reserve err continue; `:174-181` cushion err continue; counters `:155,:180`                                                                                                                                                | closed |
| T-07-06-03 | Tampering              | Cushion mutation site missed                   | mitigate    | 5 hooks: `archive-wallet.ts:99`, `set-wallet-balance.ts:160`, `set-category-limit.ts:112`, `create-wallet.ts:92`, `update-wallet.ts:210`; sweep backstop `budgeting-reconciliation.ts:159-173`                                                                   | closed |
| T-07-06-04 | Information Disclosure | Sweep logs leak tenant_id                      | accept      | AR-07-08 — UUID-only operational logs                                                                                                                                                                                                                            | closed |
| T-07-06-05 | DoS                    | Sweep perf at scale                            | accept      | AR-07-09 — linear cost, defer >1000 tenants                                                                                                                                                                                                                      | closed |
| T-07-06-06 | Tampering              | Race inline hook vs sweep                      | mitigate    | `task-repo.ts:84` ON CONFLICT DO NOTHING; refresh kinds DO UPDATE `:244,:293`; idempotent resolve UPDATE `WHERE status='PENDING'` `:201-207`                                                                                                                     | closed |
| T-07-07-01 | Elevation of Privilege | Cross-tenant resolve via crafted taskId        | mitigate    | L1 `apps/api/src/routes/tasks.ts:84` `tenantIds.includes→404`; L2 `task-repo.ts:201-207` `tenant_id` WHERE; L3 RLS `apps/migrator/post-migration.sql:707`; gate `tests/tenant-leak/tasks-cross-tenant.test.ts`                                                   | closed |
| T-07-07-02 | Elevation of Privilege | Cross-tenant cushion-summary read              | mitigate    | `apps/api/src/routes/budgets.ts:386` `includes→404`; `withTenantTx` in getCushionSummary; gate `tests/tenant-leak/cushion-summary-cross-tenant.test.ts`                                                                                                          | closed |
| T-07-07-03 | Tampering              | cushion_target_months out-of-range             | mitigate    | `budget-identity.ts:40` `z.number().min(1).max(60)`; DB CHECK `drizzle/0026...sql:24`. `.int()` intentionally dropped (`0027`→numeric(4,1)); range enforced both layers                                                                                          | closed |
| T-07-07-04 | Information Disclosure | DTO leaks cross-tenant data                    | accept      | AR-07-10 — DTO computed inside `withTenantTx`; L1 guard blocks request                                                                                                                                                                                           | closed |
| T-07-07-05 | DoS                    | Repeated resolve calls                         | accept      | AR-07-11 — idempotent single-row UPDATE                                                                                                                                                                                                                          | closed |
| T-07-07-06 | Tampering              | PATCH leaves stale task (no recompute)         | mitigate    | `budget-identity.ts:218-227` `recomputeCushionTaskRunner` after `updateIdentity`; sweep backstop                                                                                                                                                                 | closed |
| T-07-07-07 | Repudiation            | PATCH audit trail                              | accept      | AR-07-12 — existing identity audit captures field                                                                                                                                                                                                                | closed |
| T-07-08-01 | Tampering              | Script injection via payload to DOM            | mitigate    | `task-banner-row.tsx:113,139` `t(key, titleParams)` ICU params; text nodes `:123,:136`; numeric via `centsToDisplayCompact :79`                                                                                                                                  | closed |
| T-07-08-02 | Information Disclosure | Cross-tenant payload via task fetch            | accept      | AR-07-13 — parent fetch tenant-scoped (T-07-07-01/02)                                                                                                                                                                                                            | closed |
| T-07-08-03 | Tampering              | Crafted task.id in URL fragment                | accept      | AR-07-14 — server-returned UUID; destination tenant-guarded                                                                                                                                                                                                      | closed |
| T-07-08-04 | DoS                    | Rapid clicks on CONFIRM_DRAFT button           | mitigate    | Superseded by read-only banner redesign — `task-banner-row.tsx:115-144` has no mutation button (dialog trigger only), vector eliminated. Residual spendings-surface note in Unregistered Flags                                                                   | closed |
| T-07-08-05 | Spoofing               | Untranslated i18n key shows literal            | accept      | AR-07-15 — TaskKind union (`:31-34`) 3 kinds; en/pl/uk parity (17 refs each)                                                                                                                                                                                     | closed |
| T-07-09-01 | Tampering              | Months client validation bypass                | mitigate    | Same as T-07-07-03: `budget-identity.ts:40` + DB CHECK `0026...sql:24`                                                                                                                                                                                           | closed |
| T-07-09-02 | Information Disclosure | Cushion summary cross-tenant via budgetId      | accept      | AR-07-16 — `budgets.ts:386` tenant guard                                                                                                                                                                                                                         | closed |
| T-07-09-03 | Tampering              | Wizard PATCH injects extra fields              | mitigate    | `budget-identity.ts:16-41` `patchBudgetSchema` `z.object` whitelist (strips unknown keys)                                                                                                                                                                        | closed |
| T-07-09-04 | DoS                    | Months edit floods PATCH per keystroke         | mitigate    | `cushion-section.tsx:166-181` `handleTargetMonthsBlur` — single PATCH on blur                                                                                                                                                                                    | closed |
| T-07-09-05 | Spoofing               | CategorySlider silent cushion mirror           | accept      | AR-07-17 — per D-PH7-36, intentional; documented                                                                                                                                                                                                                 | closed |
| T-07-09-06 | Tampering              | Cushion preview leaks across budgets via cache | mitigate    | `cushion-section.tsx:122,184` `queryKey: ["cushion-summary", budgetId]`                                                                                                                                                                                          | closed |
| T-07-10-01 | Tampering              | E2E data pollution across scenarios            | mitigate    | `apps/web/e2e/steps/tasks.steps.ts:3` imports `fresh-user-per-scenario` fixture                                                                                                                                                                                  | closed |
| T-07-10-02 | DoS                    | E2E run blocks CI / hangs                      | mitigate    | `tasks.steps.ts:346-350` parametrized timeout; `features/tasks.feature:78-81` 90s auto-resolve                                                                                                                                                                   | closed |
| T-07-10-03 | Information Disclosure | E2E logs leak test creds                       | accept      | AR-07-18 — throwaway fixture users                                                                                                                                                                                                                               | closed |
| T-07-10-04 | Repudiation            | E2E silently skipped via continue-on-error     | mitigate    | `.github/workflows/ci.yml:244-317` e2e job — NO continue-on-error; scenario-scoped `@skip-phase-07-debt` `features/tasks.feature:95`                                                                                                                             | closed |
| T-07-10-05 | Spoofing               | Fixture impersonates prod user                 | accept      | AR-07-19 — UUID-named throwaway users                                                                                                                                                                                                                            | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                        | Accepted By     | Date       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ---------- |
| AR-07-01 | T-07-01-03 | `it.todo` stubs carry no sensitive data; bootstraps reuse the already gate-tested tenant-leak harness                                            | planner (07-01) | 2026-06-28 |
| AR-07-02 | T-07-01-05 | DROP+ADD `tasks_kind_chk` atomic within the migration transaction; sub-ms absence window; zero rows of dropped kinds exist                       | planner (07-01) | 2026-06-28 |
| AR-07-03 | T-07-02-04 | Cross-tenant resolve silently no-ops (0 rows) via `WHERE tenant_id`; no error leaks task existence; route guard is layer 1                       | planner (07-02) | 2026-06-28 |
| AR-07-04 | T-07-02-05 | Payload stored as opaque jsonb; adapter never interprets fields; render boundary uses React auto-escape + i18n ICU, no `dangerouslySetInnerHTML` | planner (07-02) | 2026-06-28 |
| AR-07-05 | T-07-03-04 | Cushion FX pinned to TODAY (Pitfall 5, documented deviation); 60-min freshness gate + 9-case FX test bound the stale-rate risk                   | planner (07-03) | 2026-06-28 |
| AR-07-06 | T-07-04-03 | rule_name comes from tenant-scoped rule at fetch; task row tenant_id matches; RLS + FORCE block cross-tenant read                                | planner (07-04) | 2026-06-28 |
| AR-07-07 | T-07-05-03 | shortfall_cents derived from tenant-scoped queries; same RLS isolation as AR-07-06                                                               | planner (07-05) | 2026-06-28 |
| AR-07-08 | T-07-06-04 | Sweep logs contain only tenant UUIDs (PII-free), operationally needed for debugging; follows existing audit conventions                          | planner (07-06) | 2026-06-28 |
| AR-07-09 | T-07-06-05 | Per-tenant sweep cost ≈ 2 reads + 1 upsert, linear; current scale low; defer optimization past 1000 tenants                                      | planner (07-06) | 2026-06-28 |
| AR-07-10 | T-07-07-04 | DTO computed inside `withTenantTx(tenantId)`; L1 tenant guard blocks the request before service entry                                            | planner (07-07) | 2026-06-28 |
| AR-07-11 | T-07-07-05 | Idempotent UPDATE matches ≤1 row (taskId PK); single index seek; no rate-limit needed at scale                                                   | planner (07-07) | 2026-06-28 |
| AR-07-12 | T-07-07-07 | Existing Phase-1 budget-identity audit log captures the new field automatically                                                                  | planner (07-07) | 2026-06-28 |
| AR-07-13 | T-07-08-02 | Task fetch already tenant-scoped (T-07-07-01/02); banner trusts the parent fetcher                                                               | planner (07-08) | 2026-06-28 |
| AR-07-14 | T-07-08-03 | URL uses server-returned task.id (no user input); destination page tenant-guards                                                                 | planner (07-08) | 2026-06-28 |
| AR-07-15 | T-07-08-05 | TaskKind union restricts to 3 kinds at compile time; an out-of-union kind degrades to literal key (no security risk)                             | planner (07-08) | 2026-06-28 |
| AR-07-16 | T-07-09-02 | `tenantIds.includes(budgetId)` guard; client cannot reach a budgetId outside its session tenant set                                              | planner (07-09) | 2026-06-28 |
| AR-07-17 | T-07-09-05 | Per D-PH7-36, CategorySlider mirror is intentionally silent; both fields inspectable before Save                                                 | planner (07-09) | 2026-06-28 |
| AR-07-18 | T-07-10-03 | Test users are throwaway; credentials live only in the fixture                                                                                   | planner (07-10) | 2026-06-28 |
| AR-07-19 | T-07-10-05 | Fresh-user fixture mints UUID-named users with no production overlap                                                                             | planner (07-10) | 2026-06-28 |

---

## Unregistered Flags

- **[LOW]** `.int()` guard dropped on `cushion_target_months` — implemented as `z.number().min(1).max(60)` (`budget-identity.ts:40`) and migration `0027_cushion_months_decimal.sql` promoted the DB column to `numeric(4,1)` to allow fractional months. The named out-of-range threat is still fully mitigated (1..60 bound at both API and DB). Documented intentional change, not a gap.
- **[LOW]** Spendings `draft-action-confirm` button is not `disabled` while in-flight — `draft-row.tsx:180-193` fires `confirmMutation.mutate` with no `disabled={confirmMutation.isPending}`. A rapid double-click could dispatch two confirms. This is the Phase-4 spendings surface (out of Phase-7 register scope); impact bounded because a confirmed draft leaves PENDING server-side. Flagged for the spendings owner.
- **[LOW]** Doc residual: `.planning/REQUIREMENTS.md:162` (PWAX-05) still lists `STALE_WALLET · MONTH_END_REVIEW` among push-fire task kinds, both dropped in v1.1 (TASK-05 DROPPED at `:132`). Doc-accuracy only — `tasks_kind_chk` (`drizzle/0026...sql:18`) rejects any non-3-kind insert at the DB layer. Residual of T-07-01-04's doc-grep control, not new attack surface.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                            |
| ---------- | ------------- | ------ | ---- | --------------------------------- |
| 2026-06-28 | 55            | 55     | 0    | gsd-security-auditor (2 tranches) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-07-01..AR-07-19)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
