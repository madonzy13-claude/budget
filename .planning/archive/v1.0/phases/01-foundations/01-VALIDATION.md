---
phase: 1
slug: foundations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `01-RESEARCH.md §Validation Architecture`.

---

## Test Infrastructure

| Property               | Value                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend framework**  | `bun:test` (built-in, Bun 1.3.x)                                                                                                       |
| **Frontend framework** | Vitest 4.x + happy-dom + @testing-library/react                                                                                        |
| **E2E framework**      | Playwright                                                                                                                             |
| **Backend config**     | `bunfig.toml` `[test]` section + per-package `test/` dir                                                                               |
| **Frontend config**    | `apps/web/vitest.config.ts`                                                                                                            |
| **CI lint/arch**       | `bunx depcruise --config .dependency-cruiser.cjs apps packages`                                                                        |
| **Quick run command**  | `bun test` (root, runs all package suites)                                                                                             |
| **Full suite command** | `bun test && bunx vitest run --root apps/web && bunx playwright test && bunx depcruise --config .dependency-cruiser.cjs apps packages` |
| **Estimated runtime**  | ~5 min full / ~30s changed-package                                                                                                     |

---

## Sampling Rate

- **After every task commit:** Run `bun test --filter <package>` (changed-package, < 30s)
- **After every plan wave:** Run `bun test` (root, all packages, < 5 min)
- **Before `/gsd-verify-work`:** Full suite (backend + Vitest + Playwright + dep-cruiser) must be green
- **Max feedback latency:** 30 seconds at task level, 5 min at wave level

---

## Per-Task Verification Map

> Derived from RESEARCH §"Phase 1 Success Criteria → Test Map". Test paths are anchored at the locations the planner/executor will create.

| Behavior                                                           | Plan            | Wave | Requirement(s)         | Test Type           | Automated Command                                                                                               | File Exists | Status     |
| ------------------------------------------------------------------ | --------------- | ---- | ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| Sign up email/password                                             | 5 identity      | 2    | IDNT-01                | integration         | `bun test packages/identity/test/sign-up.test.ts`                                                               | ❌ W2       | ⬜ pending |
| Email verification + token consume                                 | 5 identity      | 2    | IDNT-02                | integration         | `bun test packages/identity/test/verify-email.test.ts`                                                          | ❌ W2       | ⬜ pending |
| Password reset (30 min TTL)                                        | 5 identity      | 2    | IDNT-03                | integration         | `bun test packages/identity/test/reset-password.test.ts`                                                        | ❌ W2       | ⬜ pending |
| Session list + revoke                                              | 5 identity      | 2    | IDNT-04                | integration         | `bun test packages/identity/test/sessions.test.ts`                                                              | ❌ W2       | ⬜ pending |
| Locale rendered EN/PL/UK                                           | 8 web-app       | 3    | IDNT-05, PLAT-05       | E2E                 | `bunx playwright test tests/e2e/locale-render.spec.ts`                                                          | ❌ W3       | ⬜ pending |
| Locale persists signup→settings                                    | 5 identity      | 2    | IDNT-06                | integration         | `bun test packages/identity/test/locale.test.ts`                                                                | ❌ W2       | ⬜ pending |
| Preferred LLM/STT provider on user                                 | 5 identity      | 2    | IDNT-07, IDNT-08       | integration         | `bun test packages/identity/test/provider-prefs.test.ts`                                                        | ❌ W2       | ⬜ pending |
| Create PRIVATE workspace (kind=PRIVATE, member_count=1)            | 6 tenancy       | 2    | TENT-01, TENT-10       | integration         | `bun test packages/tenancy/test/create-private.test.ts`                                                         | ❌ W2       | ⬜ pending |
| Create SHARED workspace + invite member                            | 6 tenancy       | 2    | TENT-02, TENT-09       | integration         | `bun test packages/tenancy/test/create-shared-invite.test.ts`                                                   | ❌ W2       | ⬜ pending |
| Owner role enforced (member can't invite)                          | 6 tenancy       | 2    | TENT-03                | integration         | `bun test packages/tenancy/test/role-enforcement.test.ts`                                                       | ❌ W2       | ⬜ pending |
| Multi-workspace membership                                         | 6 tenancy       | 2    | TENT-04                | integration         | `bun test packages/tenancy/test/multi-shared.test.ts`                                                           | ❌ W2       | ⬜ pending |
| Transfer-ownership + last-owner guard                              | 6 tenancy       | 2    | TENT-05                | integration         | `bun test packages/tenancy/test/transfer-ownership.test.ts`                                                     | ❌ W2       | ⬜ pending |
| Leave workspace                                                    | 6 tenancy       | 2    | TENT-06                | integration         | `bun test packages/tenancy/test/leave-workspace.test.ts`                                                        | ❌ W2       | ⬜ pending |
| `default_currency` immutable post-create                           | 6 tenancy       | 2    | TENT-11, MONY-02       | integration         | `bun test packages/tenancy/test/default-currency-immutable.test.ts`                                             | ❌ W2       | ⬜ pending |
| `active_workspace_ids` persists across sessions                    | 6 tenancy       | 2    | TENT-12                | integration         | `bun test packages/tenancy/test/active-filter.test.ts`                                                          | ❌ W2       | ⬜ pending |
| SHARED owner edits shares; sum=100; audit row written              | 6 tenancy       | 2    | TENT-13                | integration         | `bun test packages/tenancy/test/shares-audit.test.ts`                                                           | ❌ W2       | ⬜ pending |
| `display_currency` independent of any workspace currency           | 5 + 8           | 2/3  | MONY-09                | integration         | `bun test packages/identity/test/display-currency.test.ts`                                                      | ❌ W2       | ⬜ pending |
| **No-tenant-GUC → 0 rows from every user-data table**              | 10 leak-CI      | 3    | TENT-07                | **CI gate**         | `bun test tests/tenant-leak/no-guc-zero-rows.test.ts`                                                           | ❌ W3       | ⬜ pending |
| **Worker job omitting `tenantIds` → errors before DB read**        | 10 leak-CI      | 3    | TENT-08                | **CI gate**         | `bun test tests/tenant-leak/job-without-tenant-errors.test.ts`                                                  | ❌ W3       | ⬜ pending |
| **`pg_roles` confirms app + worker have NO BYPASSRLS**             | 10 leak-CI      | 3    | TENT-07                | **CI gate**         | `bun test tests/tenant-leak/pg-roles-no-bypassrls.test.ts`                                                      | ❌ W3       | ⬜ pending |
| **`pg_class.relforcerowsecurity=true` for every user-data table**  | 10 leak-CI      | 3    | TENT-07                | **CI gate**         | `bun test tests/tenant-leak/force-rls-on-all-tables.test.ts`                                                    | ❌ W3       | ⬜ pending |
| `docker compose up` brings up web+api+worker+db                    | 9 docker        | 3    | PLAT-02                | E2E (compose smoke) | `tests/compose-up.sh` runs `docker compose up -d --wait`                                                        | ❌ W3       | ⬜ pending |
| Migrations apply via separate role w/ advisory lock                | 2 db-rls        | 1    | PLAT-12, ENGR-04       | integration         | `bun test tests/migrator-role.test.ts`                                                                          | ❌ W1       | ⬜ pending |
| `domain/` cannot import `drizzle-orm` / `hono` / adapters          | 0 monorepo      | 0    | ENGR-10                | CI gate             | `bunx depcruise --config .dependency-cruiser.cjs apps packages`                                                 | ❌ W0       | ⬜ pending |
| No `db.transaction` outside `packages/platform/src/db/tx.ts`       | 0 monorepo      | 0    | ENGR-04                | CI grep             | `! grep -RE '\.transaction\(' --include='*.ts' --exclude=tx.ts apps packages`                                   | ❌ W0       | ⬜ pending |
| `Money` add/convert/equals (USD precision)                         | 1 shared-kernel | 1    | MONY-01                | unit                | `bun test packages/shared-kernel/test/money.test.ts`                                                            | ❌ W1       | ⬜ pending |
| `Money` BTC 18-decimal round-trip through DB                       | 1 shared-kernel | 1    | MONY-01, MONY-07       | integration         | `bun test packages/shared-kernel/test/money-crypto.test.ts`                                                     | ❌ W1       | ⬜ pending |
| ESLint `no-float-money` flags `total += expense.amount`            | 0 + 1           | 0/1  | MONY-07                | unit                | `bunx eslint --rule no-float-money/error tests/fixtures/float-money.ts`                                         | ❌ W1       | ⬜ pending |
| `Clock` port (System + Fake)                                       | 1 shared-kernel | 1    | ENGR-11                | unit                | `bun test packages/shared-kernel/test/clock.test.ts`                                                            | ❌ W1       | ⬜ pending |
| `Result<T, E>` via neverthrow                                      | 1 shared-kernel | 1    | ENGR-12                | unit                | `bun test packages/shared-kernel/test/result.test.ts`                                                           | ❌ W1       | ⬜ pending |
| `TenantId` / `UserId` branded types reject bare strings at compile | 1 shared-kernel | 1    | ENGR-05                | tsc                 | `bunx tsc --noEmit --project packages/shared-kernel/tsconfig.json`                                              | ❌ W1       | ⬜ pending |
| Port skeletons (FX, email, crypto, STT, LLM) + in-memory fakes     | 1 + 4 + 5       | 1/2  | ENGR-13, MONY-08       | unit                | `bun test packages/shared-kernel/test/ports.test.ts`                                                            | ❌ W1       | ⬜ pending |
| `audit_history` queryable for any non-ledger entity                | 3 audit-outbox  | 1    | ENGR-07                | integration         | `bun test packages/platform/test/audit.test.ts`                                                                 | ❌ W1       | ⬜ pending |
| Outbox survives worker restart without duplicate dispatch          | 3 audit-outbox  | 1    | ENGR-08                | integration         | `bun test packages/platform/test/outbox-restart.test.ts`                                                        | ❌ W1       | ⬜ pending |
| Crypto-shred wrap/unwrap correctness                               | 4 crypto-store  | 1    | (Phase 6 destroy flow) | integration         | `bun test packages/platform/test/crypto-key-store.test.ts`                                                      | ❌ W1       | ⬜ pending |
| Bun test coverage threshold ≥80% on `packages/**/domain`           | 0 monorepo      | 0    | ENGR-02                | CI gate             | `bun test --coverage --coverage-threshold-line=80 packages/*/domain`                                            | ❌ W0       | ⬜ pending |
| Bounded contexts declared (Identity + Tenancy)                     | 0 + 5 + 6       | 0/2  | ENGR-03                | structure check     | `test -d packages/identity && test -d packages/tenancy`                                                         | ❌ W2       | ⬜ pending |
| Per-context layers (domain/application/adapters) enforced          | 0 + 5 + 6       | 0/2  | ENGR-04                | CI gate             | dependency-cruiser layer rule                                                                                   | ❌ W0       | ⬜ pending |
| `expense_ledger` REVOKE UPDATE/DELETE primitive                    | 2 db-rls        | 1    | ENGR-06                | integration         | `bun test packages/platform/test/ledger-revoke.test.ts`                                                         | ❌ W1       | ⬜ pending |
| New language = drop JSON file + i18n.config.ts entry               | 8 web-app       | 3    | PLAT-06                | docs + grep         | `grep -E "locales:.*\\['en','pl','uk'\\]" apps/web/i18n.config.ts && test -f apps/web/messages/{en,pl,uk}.json` | ❌ W3       | ⬜ pending |
| Single-region deployment documented                                | 0 monorepo      | 0    | PLAT-11                | docs check          | `grep -q 'REGION=' .env.example && grep -q 'single-region' README.md`                                           | ❌ W0       | ⬜ pending |
| TDD discipline: tests in same plan as code                         | All             | All  | ENGR-01                | review              | inspection (planner enforces)                                                                                   | n/a         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_
_File Exists column: ❌ W{N} = will exist after Wave N execution_

---

## Wave 0 Requirements

Wave 0 (Plan 0 — `monorepo-skeleton`) MUST land these files before any other plan executes:

- [ ] `bunfig.toml` with `[test]` section and coverage threshold for `packages/*/domain`
- [ ] `.dependency-cruiser.cjs` with rules: domain → drizzle-orm/hono/adapters BLOCKED
- [ ] `eslint.config.js` flat-config with custom `no-float-money` rule
- [ ] `tests/fixtures/float-money.ts` (positive fixture for the rule)
- [ ] `apps/web/vitest.config.ts` (happy-dom + RTL preset)
- [ ] `playwright.config.ts` (root, no projects yet)
- [ ] `tsconfig.base.json` (strict, ES2024, Bun moduleResolution=bundler)
- [ ] `.env.example` (all required vars enumerated, including `REGION=`)
- [ ] `packages/shared-kernel/src/env.ts` (zod schema, fail-fast at boot)
- [ ] CI grep step: ban `db.transaction(` outside `packages/platform/src/db/tx.ts`
- [ ] Husky + lint-staged pre-commit hook (typecheck + tests-of-changed-files)

---

## Manual-Only Verifications

| Behavior                                                                                                      | Requirement      | Why Manual                                                | Test Instructions                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Email-verification email actually arrives in dev inbox                                                        | IDNT-02          | Dev email port = `StdoutEmailSender`; visual confirmation | `bun run dev:api` → POST `/sign-up` → assert link printed to stdout matches `/verify?token=*` |
| Password-reset email actually arrives                                                                         | IDNT-03          | Same — Resend not wired Phase 1                           | Same approach via stdout                                                                      |
| Locale switch in UI looks correct in PL & UK (RTL not required, but 30%-longer strings must not break layout) | IDNT-05, PLAT-05 | Visual layout check                                       | Run `bun run dev:web`, switch locale via `/settings`, screenshot compare                      |
| `docker compose up` produces a live `/health` 200 within 60 s on first cold cache                             | PLAT-02          | Compose timing varies by host                             | Run on Linux + macOS dev machines, document any flake                                         |
| New-language onboarding doc reads cleanly                                                                     | PLAT-06          | DX prose readability                                      | `cat apps/web/README.md`; reviewer confirms steps                                             |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (dep-cruiser, ESLint rule, bunfig coverage)
- [ ] No `--watch` flags in any CI command
- [ ] Feedback latency < 30s changed-package / < 5min full
- [ ] `nyquist_compliant: true` set in frontmatter (planner sets this when all tasks have automated/manual entries)
- [ ] Tenant-leak suite (4 CI gates) wired to a `tenant-leak` package.json script and to GitHub Actions matrix

**Approval:** pending
