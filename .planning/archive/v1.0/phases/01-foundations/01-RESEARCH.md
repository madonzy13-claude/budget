# Phase 1: Foundations — Research

**Researched:** 2026-05-05
**Domain:** Multi-tenant TypeScript-on-Bun monorepo · DDD + ports & adapters · Postgres RLS · Better Auth · crypto-shredding · transactional outbox · i18n bootstrap
**Confidence:** HIGH for stack APIs (verified via Context7 + npm registry); MEDIUM for a few cross-library integration patterns flagged below

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

All 30 decisions D-01 through D-30 are LOCKED. Reproduced verbatim from CONTEXT.md so the planner can verify compliance:

**Workspace & Tenancy Model**

- **D-01** Multi-workspace membership. PRIVATE (1 owner) | SHARED (2+, invite-driven). User can create unlimited PRIVATE, accept unlimited SHARED invites. [TENT-04, TENT-09, TENT-10]
- **D-02** Workspace `kind` is explicit Postgres enum (`PRIVATE` | `SHARED`). Inviting a member to PRIVATE rejected at app layer; explicit "convert to shared" flow. [TENT-10]
- **D-03** No auto-creation at signup. Empty state on first login. [TENT-09]
- **D-04** Workspace `default_currency` immutable post-creation; ISO-4217; app-layer enforced + CHECK trigger if practical. [TENT-11, MONY-02]
- **D-05** User `display_currency` independent and global. Drives cross-workspace rollups via FX. [MONY-09]
- **D-06** SHARED workspace `shared_workspace_member_shares (workspace_id, user_id, percentage NUMERIC(5,2))` rows sum to 100.00. Owner-only edit. Audit-tracked. Math ships Phase 2/4. [TENT-13]
- **D-07** Persisted `active_workspace_ids UUID[]` per user. Default empty on first login. UI = checkbox list grouped by kind. [TENT-12]

**RLS / Tenant Context**

- **D-08** Array GUC `app.tenant_ids` set per request. Policy: `tenant_id = ANY(current_setting('app.tenant_ids')::uuid[])`. Single query reads can span multiple workspaces. [TENT-07, TENT-12]
- **D-09** `withTenantTx(tenantIds, fn)` is the only writable transaction primitive. dependency-cruiser enforces. Writes restricted to single tenant_id; reads accept array. [TENT-07, ENGR-10]
- **D-10** Worker tenant propagation. Every pg-boss job carries `tenantIds: UUID[]`. Worker DB role has no `BYPASSRLS`; `FORCE ROW LEVEL SECURITY` set. [TENT-08]
- **D-11** Tenant-leak CI gate: (a) request without GUC → zero rows; (b) job omitting tenantIds errors before DB read; (c) `pg_roles` confirms no BYPASSRLS; (d) `information_schema` confirms FORCE RLS. [TENT-07, TENT-08, ENGR-10]

**Better Auth Integration**

- **D-12** Better Auth `organization` plugin = workspaces. Owner/member maps to plugin roles. Domain-owned tables derived from / kept in sync with plugin's organization/member tables (single source = Better Auth tables). [TENT-01..03]
- **D-13** Email verification policy: grace login. Sign in immediately; banner + gate workspace create/join until verified. TTL 24h, resend 1/min. [IDNT-01, IDNT-02]
- **D-14** Password reset TTL 30 min, single-use. [IDNT-03]
- **D-15** Session storage: Better Auth default (Postgres-backed, cookie-id). No JWT. User-revokable. [IDNT-04]

**Crypto-Shredding Key Store**

- **D-16** App-side libsodium + KEK from env var `BUDGET_KEK` (32-byte base64). Per-user 32-byte DEK encrypted-with-KEK in `user_keys` table. Request-scoped DEK cache. PII columns stored as `bytea` ciphertext in `_encrypted` columns; equality lookup via `email_hash` deterministic hash. Phase 6 ships destroy flow. **Not chosen:** pgcrypto, external KMS. [PLAT-08, ENGR-13]

**Postgres Schema Layout**

- **D-17** Real Postgres schemas per BC: `identity.*`, `tenancy.*`, `shared_kernel.*`, `comparison.*`. Per-schema `USAGE` grants. [ENGR-03, ENGR-04, CMPR-07]
- **D-18** Migration role separation. Separate `migrator` role with DDL; app + worker roles DML only. `pg_advisory_lock(hashtext('budget-migrations'))` to serialize. One-shot migrator container. [PLAT-12]

**Shared Kernel**

- **D-19** `Money` value object wrapping Dinero v2; big.js for crypto (NUMERIC(38,18)); fiat NUMERIC(19,4). Persistence at adapter boundary. ESLint `no-float-money` rule. [MONY-01, MONY-07]
- **D-20** `Clock` port + `SystemClock` + `FakeClock` fixture. [ENGR-11]
- **D-21** `Result<T, E>` via `neverthrow`. [ENGR-12]
- **D-22** `TenantId`, `UserId` are branded UUID v7 (time-sortable). Public-facing slugs use `nanoid(12)` separately. [ENGR-05]

**Append-Only Ledger Primitive**

- **D-23** `expense_ledger` table created in Phase 1 with full MONY-06 column shape. DB-level `REVOKE UPDATE, DELETE FROM app_role`. RLS policy. CI test asserts REVOKE in place. [ENGR-06]
- **D-24** `audit_history` typed-event log: `(id, tenant_id, entity_type, entity_id, action, actor_user_id, occurred_at, before_jsonb, after_jsonb)`. [ENGR-07]

**Transactional Outbox**

- **D-25** Single `outbox` table. Producer writes outbox rows in same tx as aggregate. Dispatcher = pg-boss scheduled job (every 5s) using `SELECT FOR UPDATE SKIP LOCKED ... WHERE dispatched_at IS NULL`. Idempotent. [ENGR-08]

**Repo Layout & Tooling**

- **D-26** Bun workspaces. `apps/web` (Next.js 16), `apps/api` (Hono on Bun), `apps/worker` (pg-boss), `packages/shared-kernel`, `packages/identity`, `packages/tenancy`. [ENGR-04]
- **D-27** dependency-cruiser CI rule: domain cannot import `drizzle-orm`, `hono`, `ai`, `@ai-sdk/*`, sibling adapters; only `contracts/**` cross-package importable; `withTenantTx` is the only allowed tx entry. [ENGR-10]
- **D-28** Tests: bun:test (backend + shared) + Vitest 4 (apps/web) + Playwright (E2E). Shared Compose `test-db` with truncate-and-reseed. [ENGR-01, ENGR-02]
- **D-29** i18n: next-intl frontend; backend translations only for transactional emails. Catalogs at `apps/web/messages/{en,pl,uk}.json`. [PLAT-05, PLAT-06]
- **D-30** Docker Compose: `db`, `migrator` (one-shot), `api`, `web`, `worker`. [PLAT-02]

### Claude's Discretion

- ESLint flat config (typescript-eslint strict-type-checked + jsx-a11y for web)
- Prettier 3 default config
- Husky + lint-staged pre-commit (block on failing types + tests-of-changed-files)
- Environment-variable validation: zod schema at boot; fail-fast on missing vars
- pg-boss schema named `jobs` (default `pgboss`) — kept out of bounded-context schemas
- Nanoid alphabet & length for public slugs
- Specific Better-Auth plugin set (organization + admin + email-otp resend) — implementer decides exact version

### Deferred Ideas (OUT OF SCOPE)

- BDGT-08 — per-category contribution share overrides (Phase 2)
- EXPN-13 — FX-preview shared-wallet deposit (Phase 2)
- RSRV-08 — share-aware reserve accounting (Phase 3)
- TASK-07 / TASK-08 — contribution-mismatch Task generators (Phase 4)
- PRIVATE → SHARED conversion flow (Phase 1 plan can decide UX; mechanic implementation is later)
- Workspace deletion / archive — NOT in v1
- Cross-workspace transfer — explicitly NOT in v1
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                              | Research Support                                                                                    |
| ------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| IDNT-01 | Sign up email/password                                   | Better Auth `emailAndPassword.enabled`                                                              |
| IDNT-02 | Email verification after signup                          | `emailVerification.sendVerificationEmail`, `requireEmailVerification: false` (grace login per D-13) |
| IDNT-03 | Reset password via email link                            | `sendResetPassword`, `resetPasswordTokenExpiresIn: 1800` (30 min, D-14)                             |
| IDNT-04 | Session persists, revocable                              | Better Auth Postgres-backed session table; revoke-session endpoint                                  |
| IDNT-05 | Pick UI/voice language at signup                         | `users.locale` column + signup form Select                                                          |
| IDNT-06 | Change UI/voice language in settings                     | Settings update endpoint                                                                            |
| IDNT-07 | Pick LLM provider                                        | `users.preferred_llm_provider` enum (claude_haiku \| groq); UI ships, adapter wires Phase 5         |
| IDNT-08 | Pick STT provider                                        | `users.preferred_stt_provider` enum; UI ships, adapter wires Phase 5                                |
| TENT-01 | Create workspace                                         | Better Auth `organization.create` + custom `kind` field (D-12)                                      |
| TENT-02 | Owner invites by email                                   | `organization.inviteMember`                                                                         |
| TENT-03 | Owner/member roles enforced                              | Better Auth roles                                                                                   |
| TENT-04 | Multi-workspace, kind-scoped, active-filter              | D-01 + D-07                                                                                         |
| TENT-05 | Owner can transfer ownership; cannot leave as last owner | Custom domain rule on Better Auth member table                                                      |
| TENT-06 | Member leaves SHARED                                     | `organization.leaveOrganization`; reject if last owner                                              |
| TENT-07 | DB RLS, no BYPASSRLS, FORCE RLS                          | D-08, D-09, D-11                                                                                    |
| TENT-08 | Worker RLS-respecting                                    | D-10                                                                                                |
| TENT-09 | Unlimited PRIVATE / unlimited SHARED memberships         | `allowUserToCreateOrganization: () => true`, no `organizationLimit`                                 |
| TENT-10 | Workspace `kind` enum                                    | Postgres enum + Better Auth org `additionalFields.kind`                                             |
| TENT-11 | `default_currency` immutable                             | `additionalFields.defaultCurrency` + DB CHECK trigger blocking UPDATE                               |
| TENT-12 | Active workspaces multi-select                           | `user_preferences.active_workspace_ids UUID[]` (D-07)                                               |
| TENT-13 | Per-member contribution shares storage                   | `tenancy.shared_workspace_member_shares` + audit (D-06)                                             |
| MONY-01 | Money value object only                                  | shared-kernel Money class (D-19)                                                                    |
| MONY-02 | Default currency at workspace creation                   | TENT-11                                                                                             |
| MONY-07 | NUMERIC(19,4) / NUMERIC(38,18); float lint ban           | D-19                                                                                                |
| MONY-08 | FX provider port skeleton                                | `packages/shared-kernel/ports/fx-provider.ts` (no Frankfurter adapter yet)                          |
| MONY-09 | display_currency per user                                | `users.display_currency` (D-05)                                                                     |
| ENGR-01 | TDD: failing test before code                            | bun:test + Vitest discipline                                                                        |
| ENGR-02 | Coverage gate on domain                                  | `bun test --coverage` + threshold                                                                   |
| ENGR-03 | 11 BCs (Identity + Tenancy ship Phase 1)                 | D-26                                                                                                |
| ENGR-04 | Per-context layers                                       | D-26 + D-27                                                                                         |
| ENGR-05 | Shared kernel                                            | D-19, D-20, D-21, D-22                                                                              |
| ENGR-06 | Append-only ledger primitive                             | D-23                                                                                                |
| ENGR-07 | audit_history                                            | D-24                                                                                                |
| ENGR-08 | Outbox + dispatcher                                      | D-25                                                                                                |
| ENGR-10 | dependency-cruiser CI rule                               | D-27                                                                                                |
| ENGR-11 | Clock port                                               | D-20                                                                                                |
| ENGR-12 | Result<T, E>                                             | D-21                                                                                                |
| ENGR-13 | Provider port skeletons + in-memory fakes                | shared-kernel ports + dev fakes                                                                     |
| PLAT-02 | docker compose up                                        | D-30                                                                                                |
| PLAT-05 | i18n EN/PL/UK day 1                                      | D-29                                                                                                |
| PLAT-06 | New language = catalog only                              | D-29                                                                                                |
| PLAT-11 | Single-region v1                                         | Documented; no code change                                                                          |
| PLAT-12 | Migrations via separate role + lock                      | D-18                                                                                                |

</phase_requirements>

---

## Summary

Phase 1 is greenfield architecture-heavy. 43 requirements + 30 locked decisions + 1 UI design contract → roughly 8-10 parallel-eligible plans. Every external library API flagged in CONTEXT.md as "resolve at planning time" has now been resolved via Context7 docs and verified against npm registry as of 2026-05-05:

- **Better Auth 1.6.9** (April 2026) — `organization` plugin supports `additionalFields` on `organization`, `member`, `invitation` tables (since v1.3). Custom `kind` and `defaultCurrency` fields are first-class. Active org tracked in session via `activeOrganizationId`. **Multi-active-workspace is NOT native** — Better Auth's plugin tracks one active org per session; D-07's multi-select `active_workspace_ids` lives in our own `user_preferences` table and is consulted by middleware to build the GUC array (decoupled from Better Auth's session state).
- **Drizzle ORM 0.45.x + drizzle-kit 0.31.x** — `pgPolicy()`, `pgRole()`, `pgSchema()` confirmed. **Critical pitfall:** `drizzle-kit push` historically did not apply RLS policies; only `generate` + `migrate` were reliable. Phase 1 must use `generate + migrate` (not push) for production migrations. `enableRLS()` is deprecated → use `pgTable.withRLS(...)` (drizzle-orm v1.0.0-beta.1+) or rely on automatic RLS-when-policy-attached.
- **pg-boss 12.18.x** — `schema` option separates `pgboss` schema from bounded-context schemas (D-17 already specifies this). Scheduling uses cron strings (5-placeholder; minute-level precision); `cronWorkerIntervalSeconds` controls poll cadence. `SKIP LOCKED` is internal to the queue engine — for the **transactional outbox**, we still write our own `SELECT ... FOR UPDATE SKIP LOCKED` query inside a pg-boss-scheduled job that runs every 5s.
- **libsodium-wrappers 0.7.6** (pure-WASM) — confirmed Bun-compatible. Async `await sodium.ready` once at boot. Use `crypto_secretbox_easy` (key + nonce + plaintext → ciphertext+MAC) for the DEK-wrapping pattern. Avoid `sodium-native` (native bindings, more painful in Bun).

**Primary recommendation:** Plan Phase 1 as **10 plans across 4 waves**: Wave 0 (monorepo skeleton + test rails + dependency-cruiser), Wave 1 (DB + RLS + shared kernel — parallel-eligible inside the wave), Wave 2 (Identity context + Tenancy context + i18n bootstrap — parallel-eligible after Wave 1), Wave 3 (web app surfaces + Docker Compose + tenant-leak CI gate).

---

## Architectural Responsibility Map

| Capability                                                               | Primary Tier                                                                             | Secondary Tier                            | Rationale                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Sign up / sign in / verify email / reset password                        | API (Hono on Bun)                                                                        | DB                                        | Better Auth is a server-side library; Next.js never holds Better Auth secrets |
| Session cookie issuance + revocation                                     | API                                                                                      | DB                                        | Better Auth Postgres-backed session table                                     |
| Active workspace selection (multi-select)                                | API (writes `user_preferences.active_workspace_ids`)                                     | Frontend (web) reads via `hc` RPC         | Persistence + multi-tenancy enforcement is server concern                     |
| Workspace create / invite / leave                                        | API (Better Auth `organization` endpoints + custom `kind`/`default_currency` validation) | DB                                        | Hono RPC; never let client bypass kind enum                                   |
| RLS tenant context propagation                                           | API + Worker (set GUC per tx)                                                            | DB (enforces)                             | Cross-cutting concern in `withTenantTx`                                       |
| Crypto-shredding key store                                               | API + Worker (encrypt/decrypt at adapter boundary)                                       | DB (stores ciphertext + KEK-wrapped DEK)  | KEK only in env, never in DB                                                  |
| Append-only ledger writes                                                | Domain (Budgeting context — Phase 2) → adapter                                           | DB (REVOKE prevents UPDATE/DELETE)        | Phase 1 ships the table + REVOKE; Phase 2 fills it                            |
| Outbox dispatcher                                                        | Worker (pg-boss scheduled job)                                                           | DB                                        | Producer writes outbox + aggregate same tx; dispatcher pulls                  |
| Migration application                                                    | Migrator process (one-shot)                                                              | DB                                        | Separate role; advisory lock                                                  |
| i18n catalog loading                                                     | Frontend (next-intl)                                                                     | API (transactional emails only, FTL/JSON) | Server emails need locale too                                                 |
| Workspace switcher UI (multi-select Sheet on mobile, sidebar on tablet+) | Frontend                                                                                 | API (preferences)                         | Client-side Sheet, server-side persistence                                    |
| Email verification banner gating                                         | Frontend (visual gate) + API (hard reject if unverified attempts to create workspace)    | —                                         | Defense in depth; never trust client gate                                     |
| Email send (verification + reset)                                        | API → Email port (no-op-then-stdout dev adapter; Phase 4 swaps in Resend)                | —                                         | Better Auth callback hooks                                                    |

---

## Standard Stack

### Core (versions verified via `npm view <pkg> version` on 2026-05-05)

| Library                        | Version                                     | Purpose                                                                   | Why Standard                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun`                          | 1.3.x runtime                               | Runtime + package manager + test runner                                   | LOCKED in CLAUDE.md; native TS, fast install                                                                                                                                                       |
| `hono`                         | ^4.11.0                                     | API HTTP framework on Bun                                                 | LOCKED; tier-1 Bun citizen, Hono RPC + zod-openapi                                                                                                                                                 |
| `next`                         | ^16                                         | Frontend (App Router + RSC)                                               | LOCKED                                                                                                                                                                                             |
| `next-intl`                    | ^4.4.3                                      | i18n (frontend)                                                           | LOCKED; native App Router + Server Components                                                                                                                                                      |
| `drizzle-orm`                  | ^0.45.2                                     | Postgres ORM                                                              | LOCKED; first-class `pgPolicy()` + `pgSchema()`                                                                                                                                                    |
| `drizzle-kit`                  | ^0.31.10                                    | Migration tool                                                            | Companion to drizzle-orm                                                                                                                                                                           |
| `drizzle-zod`                  | ^0.8.3                                      | Schema → Zod inference                                                    | DTO generation                                                                                                                                                                                     |
| `better-auth`                  | ^1.6.9                                      | Self-hosted auth + organization plugin                                    | LOCKED; April 2026 release; Drizzle adapter built-in                                                                                                                                               |
| `@better-auth/drizzle-adapter` | ^1.6.9                                      | Drizzle adapter for Better Auth                                           | Matches better-auth version                                                                                                                                                                        |
| `pg-boss`                      | ^12.18.2                                    | Job queue + cron scheduler on Postgres                                    | LOCKED; SKIP LOCKED, schema-isolated                                                                                                                                                               |
| `libsodium-wrappers`           | ^0.7.6                                      | Crypto-shredding (KEK/DEK + AEAD)                                         | LOCKED via D-16; pure-WASM, Bun-compatible                                                                                                                                                         |
| `dinero.js`                    | ^2.0.2                                      | Money value object (fiat)                                                 | LOCKED                                                                                                                                                                                             |
| `big.js`                       | ^7.0.1                                      | Decimal arithmetic (crypto NUMERIC(38,18))                                | LOCKED; recommended by Dinero FAQ                                                                                                                                                                  |
| `neverthrow`                   | ^8.2.0                                      | `Result<T, E>` for domain failures                                        | LOCKED                                                                                                                                                                                             |
| `zod`                          | ^4.4.3 (or ^3 if API surface change blocks) | Validation everywhere                                                     | LOCKED. **Note:** CLAUDE.md says v3; npm latest is v4. **Confirm with user** which line to pin (v4 has breaking syntax changes; ecosystem `@hono/zod-validator` 0.7.6 supports both via peerDeps). |
| `@hono/zod-validator`          | ^0.7.6                                      | Hono middleware: per-route request validation                             | Standard                                                                                                                                                                                           |
| `@hono/zod-openapi`            | ^1.3.0                                      | OpenAPI generation from Zod schemas                                       | Standard                                                                                                                                                                                           |
| `dependency-cruiser`           | ^17.4.0                                     | CI rule: ban domain → adapters imports                                    | LOCKED via D-27                                                                                                                                                                                    |
| `nanoid`                       | ^5                                          | Public slug generation                                                    | LOCKED                                                                                                                                                                                             |
| `temporal-polyfill`            | latest                                      | `Temporal.PlainDate` etc.                                                 | LOCKED; Stage 4 March 2026                                                                                                                                                                         |
| `pg`                           | ^8.x                                        | Underlying Postgres driver Drizzle uses (or `postgres` aka `postgres.js`) | Drizzle requires one                                                                                                                                                                               |

### Supporting

| Library                   | Version | Purpose                                    | When to Use                                                      |
| ------------------------- | ------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `pino`                    | ^9      | Structured logging                         | Day 1 — observability rail                                       |
| `@opentelemetry/sdk-node` | latest  | Distributed tracing                        | Day 1 — wire init only; full instrumentation Phase 6             |
| `react-hook-form`         | latest  | Form state + validation (with zodResolver) | All Phase 1 forms (UI-SPEC mandates)                             |
| `@hookform/resolvers`     | latest  | zod resolver for react-hook-form           | Required by UI-SPEC                                              |
| `tailwindcss`             | ^4      | Styling                                    | Phase 1 UI                                                       |
| `lucide-react`            | latest  | Icons                                      | Phase 1 UI (UI-SPEC)                                             |
| `tsx`                     | latest  | Optional TS script runner                  | Bun handles TS natively; only if some tool can't see through Bun |
| `husky` + `lint-staged`   | latest  | Pre-commit gates                           | Discretion item; recommended                                     |

### Test Stack

| Library                  | Version  | Purpose                                                             |
| ------------------------ | -------- | ------------------------------------------------------------------- |
| `bun:test`               | built-in | Backend + shared-kernel unit + integration tests                    |
| `vitest`                 | ^4       | apps/web component tests                                            |
| `happy-dom`              | latest   | DOM emulation for Vitest                                            |
| `@testing-library/react` | latest   | Component test helpers                                              |
| `playwright`             | latest   | E2E (lands meaningfully in Phase 6; Phase 1 wires the harness only) |

### Forbidden (per CLAUDE.md "What NOT to Use")

Lucia (deprecated), next-pwa (unmaintained), Prisma (no native RLS), NestJS, Sequelize, TypeORM, Yup/Joi/io-ts, moment.js, dayjs, Express, Redux Toolkit, node-cron in-process, NodeMailer raw SMTP, SendGrid, iron-session, Auth0/Clerk, raw `number`/`Float` for money, Apollo GraphQL for internal API, Knex.

### Installation (representative — planner pins exact versions)

```bash
# Root
bun init -y
bun add -d typescript @types/node @types/bun dependency-cruiser eslint prettier

# apps/api
cd apps/api
bun add hono @hono/zod-validator @hono/zod-openapi zod \
        better-auth @better-auth/drizzle-adapter \
        drizzle-orm drizzle-zod pg \
        pg-boss libsodium-wrappers dinero.js big.js neverthrow nanoid \
        temporal-polyfill pino \
        @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
bun add -d drizzle-kit @types/pg @types/libsodium-wrappers

# apps/web
cd ../web
bun add next@latest react react-dom next-intl \
        react-hook-form @hookform/resolvers zod \
        tailwindcss lucide-react @tanstack/react-query
bun add -d vitest happy-dom @testing-library/react @testing-library/jest-dom playwright
```

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌────────────────────────────────────┐
   Browser / PWA  ◄─────► │  apps/web (Next.js 16, App Router) │
   ─ next-intl client     │  - Server Components: fetch via    │
   ─ Geist Sans/Mono      │    Hono RPC `hc` client            │
   ─ shadcn (zinc, NY)    │  - proxy.ts (was middleware.ts):    │
                          │    next-intl locale resolution     │
                          └────────────┬───────────────────────┘
                                       │ HTTPS (cookie session) · Hono RPC
                                       ▼
                          ┌────────────────────────────────────┐
                          │  apps/api (Hono on Bun)            │
                          │  middleware:                       │
                          │   1. Better Auth session resolver  │
                          │   2. Active-workspace resolver →   │
                          │      computes tenant_ids ∩ memb.   │
                          │   3. withTenantTx wrapper:         │
                          │      BEGIN; SET LOCAL              │
                          │      app.tenant_ids = '{...}';     │
                          │      <handler>; COMMIT             │
                          │   4. Idempotency-Key (Phase 2)     │
                          └────────┬─────────────────┬─────────┘
                                   │ in-process bus  │ outbox
                                   ▼                 ▼
                  ┌────────┐  ┌──────────┐  ┌──────────────┐
                  │identity│  │ tenancy  │  │shared-kernel │
                  │context │  │ context  │  │(Money,Clock, │
                  │        │  │          │  │ Result, ids) │
                  └───┬────┘  └─────┬────┘  └──────┬───────┘
                      │  ports     │ ports          │
                      └────────────┼────────────────┘
                                   ▼
                          ┌────────────────────────────────────┐
                          │  Adapters (Drizzle, Better Auth,   │
                          │  libsodium, FX-port-stub,          │
                          │  email-port-stub, outbox writer)   │
                          └────────────┬───────────────────────┘
                                       │ pg pool (app_role)
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │  Postgres 17                                              │
        │   schemas: identity.* tenancy.* shared_kernel.* comparison.*│
        │            pgboss (default)                               │
        │   roles: migrator (DDL only), app_role, worker_role,      │
        │          comparison_role  ← all NO BYPASSRLS              │
        │   FORCE ROW LEVEL SECURITY on every user-data table       │
        │   pg_advisory_lock(hashtext('budget-migrations')) on boot │
        └──────────┬─────────────────────────────────────┬─────────┘
                   ▲                                     ▲
                   │ same DB, separate role              │
                   │                                     │
         ┌─────────┴────────────┐         ┌──────────────┴────────┐
         │ apps/migrator        │         │ apps/worker           │
         │ (one-shot init)      │         │ - pg-boss scheduler   │
         │ drizzle-kit migrate  │         │ - outbox dispatcher   │
         │ via migrator role    │         │   (every 5s, SKIP     │
         │                      │         │    LOCKED)            │
         │ exits 0 → api starts │         │ - withTenantTx        │
         └──────────────────────┘         │   per job             │
                                          └───────────────────────┘
```

### Recommended Project Structure

```
budget/
├── package.json                    # root, declares workspaces
├── tsconfig.base.json              # shared compiler options
├── .dependency-cruiser.cjs         # ENGR-10 rule
├── docker-compose.yml              # D-30
├── .env.example                    # zod-validated keys
│
├── apps/
│   ├── api/                        # Hono on Bun
│   │   ├── src/
│   │   │   ├── server.ts           # Hono app entrypoint
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # Better Auth session resolver
│   │   │   │   ├── tenant-guard.ts # active_workspace_ids → app.tenant_ids GUC
│   │   │   │   ├── i18n.ts         # locale from session.user.locale
│   │   │   │   └── error.ts        # neverthrow Result → HTTP
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         # Better Auth handler mount
│   │   │   │   ├── workspaces.ts   # create / list / leave / set-active
│   │   │   │   └── settings.ts     # display_currency, locale, sessions
│   │   │   └── boot.ts             # zod env validation, OTel init, pino root logger
│   │   └── package.json
│   │
│   ├── web/                        # Next.js 16
│   │   ├── proxy.ts                # ⚠ Next 16 renamed middleware.ts → proxy.ts
│   │   ├── i18n.ts                 # next-intl routing config
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── (auth)/{sign-up,sign-in,reset}/page.tsx
│   │   │   │   ├── (app)/dashboard/page.tsx
│   │   │   │   ├── (app)/workspaces/{new,empty}/page.tsx
│   │   │   │   ├── (app)/workspaces/[id]/{shares,invite}/page.tsx
│   │   │   │   └── (app)/settings/{sessions,locale,display-currency}/page.tsx
│   │   ├── messages/{en,pl,uk}.json    # ~70 i18n keys per UI-SPEC
│   │   ├── components/                  # shadcn copied components (Phase 1 inventory)
│   │   └── lib/api-client.ts            # `hc<AppType>(...)` Hono RPC client
│   │
│   ├── worker/                     # pg-boss + handlers
│   │   └── src/
│   │       ├── worker.ts           # entrypoint
│   │       └── handlers/
│   │           └── outbox-dispatch.ts  # SELECT FOR UPDATE SKIP LOCKED
│   │
│   └── migrator/                   # one-shot
│       └── src/migrate.ts          # pg_advisory_lock + drizzle migrate + exit
│
├── packages/
│   ├── shared-kernel/
│   │   └── src/
│   │       ├── money.ts            # Money(Dinero v2 + big.js)
│   │       ├── clock.ts            # Clock port + SystemClock + FakeClock
│   │       ├── result.ts           # re-export neverthrow + helpers
│   │       ├── ids.ts              # branded TenantId, UserId, UUIDv7 gen
│   │       ├── env.ts              # zod schema for env vars
│   │       └── ports/
│   │           ├── fx-provider.ts  # interface + InMemoryFxProvider
│   │           ├── email-sender.ts # interface + StdoutEmailSender (dev)
│   │           ├── crypto-keys.ts  # CryptoKeyStore port (encryptForUser, decryptForUser)
│   │           └── outbox.ts       # OutboxWriter port
│   │
│   ├── identity/
│   │   └── src/
│   │       ├── domain/{user.ts,session.ts,events.ts}
│   │       ├── application/{sign-up.ts,verify-email.ts,reset-password.ts,update-locale.ts,update-display-currency.ts,revoke-session.ts}
│   │       ├── ports/{user-repo.ts,credential-repo.ts}
│   │       ├── adapters/persistence/
│   │       │   ├── schema.ts       # pgSchema('identity'); users, user_preferences, user_keys
│   │       │   └── better-auth.ts  # Better Auth instance + drizzleAdapter
│   │       └── contracts/{api.ts,events.ts}
│   │
│   ├── tenancy/
│   │   └── src/
│   │       ├── domain/{workspace.ts,membership.ts,share.ts,events.ts}
│   │       ├── application/{create-workspace.ts,invite-member.ts,accept-invitation.ts,leave-workspace.ts,update-shares.ts,set-active-workspaces.ts,transfer-ownership.ts}
│   │       ├── ports/{workspace-repo.ts,member-repo.ts}
│   │       ├── adapters/persistence/
│   │       │   ├── schema.ts       # pgSchema('tenancy'); workspaces (extends Better Auth org via additionalFields), members, shared_workspace_member_shares
│   │       │   └── better-auth-org.ts  # custom hooks: rejectInviteForPrivate, syncSharesOnMemberChange
│   │       └── contracts/{api.ts,events.ts}
│   │
│   └── platform/                   # cross-cutting infra (NOT a bounded context)
│       └── src/
│           ├── db/
│           │   ├── pool.ts         # pg Pool with role-aware DSN
│           │   ├── tx.ts           # withTenantTx primitive
│           │   ├── rls.ts          # SET LOCAL helper
│           │   └── numeric-parser.ts  # OID 1700 → Money string passthrough
│           ├── audit/
│           │   ├── schema.ts       # shared_kernel.audit_history
│           │   └── writer.ts       # writeAudit(entityType, entityId, before, after)
│           ├── outbox/
│           │   ├── schema.ts       # shared_kernel.outbox
│           │   ├── writer.ts       # writeOutbox in-tx
│           │   └── dispatcher.ts   # SELECT FOR UPDATE SKIP LOCKED loop
│           ├── crypto/
│           │   └── libsodium-key-store.ts  # KEK/DEK via crypto_secretbox
│           ├── jobs/
│           │   └── boss.ts         # PgBoss { schema: 'pgboss' } singleton
│           ├── i18n/email-templates/{en,pl,uk}/
│           ├── logging.ts          # pino factory with tenant_id child binding
│           └── tracing.ts          # OTel SDK init
│
└── tests/
    ├── tenant-leak/                # ENGR-10 + D-11 CI gate
    │   ├── no-guc-zero-rows.test.ts
    │   ├── job-without-tenant-errors.test.ts
    │   ├── pg-roles-no-bypassrls.test.ts
    │   └── force-rls-on-all-tables.test.ts
    └── e2e/
        └── auth-flow.spec.ts       # Playwright: signup → verify → workspace create → switcher
```

### Pattern 1: pgPolicy + pgSchema for RLS by GUC

**What:** Define schema-per-bounded-context, attach RLS policies that read `app.tenant_ids` GUC.

**Source:** [Drizzle RLS docs](https://orm.drizzle.team/docs/rls) (Context7 verified)

```ts
// packages/tenancy/src/adapters/persistence/schema.ts
import { sql } from "drizzle-orm";
import {
  pgSchema,
  pgPolicy,
  pgRole,
  uuid,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const tenancy = pgSchema("tenancy");

// Roles declared so drizzle-kit can grant on them in migrations.
export const appRole = pgRole("app_role");
export const workerRole = pgRole("worker_role");

// Workspace kind enum lives inside tenancy schema.
export const workspaceKind = tenancy.enum("workspace_kind", [
  "PRIVATE",
  "SHARED",
]);

export const workspaces = tenancy.table(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(), // UUID v7 generated app-side
    // tenant_id IS the workspace id itself (workspace = tenant boundary)
    // Other contexts' tables FK to workspaces(id) AS tenant_id
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: workspaceKind("kind").notNull(),
    defaultCurrency: text("default_currency").notNull(), // ISO-4217, immutable post-create
    ownerUserId: uuid("owner_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // RLS: only see workspaces in your active tenant_ids
    pgPolicy("workspaces_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.id} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
  ],
);
```

```ts
// Example tenant-scoped table elsewhere — packages/budgeting/.../expense-ledger.ts (Phase 2 fills it)
export const expenseLedger = budgeting.table(
  "expense_ledger",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => workspaces.id),
    // ... MONY-06 columns
  },
  (t) => [
    pgPolicy("expense_ledger_tenant_isolation", {
      as: "permissive",
      for: "all",
      to: [appRole, workerRole],
      using: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
      withCheck: sql`${t.tenantId} = ANY(coalesce(nullif(current_setting('app.tenant_ids', true), ''), '{}')::uuid[])`,
    }),
    // D-23: REVOKE UPDATE, DELETE — done in raw migration after CREATE TABLE
  ],
);
```

**Migration glue (raw SQL appended to drizzle-generated migration):**

```sql
-- After CREATE TABLE statements:
ALTER TABLE tenancy.workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;
-- ...repeat for every user-data table

-- D-23: ledger immutability at SQL level
REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;

-- D-18: app/worker have NO BYPASSRLS
ALTER ROLE app_role NOBYPASSRLS NOSUPERUSER;
ALTER ROLE worker_role NOBYPASSRLS NOSUPERUSER;
ALTER ROLE migrator NOBYPASSRLS NOSUPERUSER;  -- migrator has DDL, not BYPASSRLS
```

> **Why explicit FORCE + REVOKE in raw SQL:** drizzle-kit does not currently emit `FORCE ROW LEVEL SECURITY` or column-level `REVOKE` from a TS schema declaration. Plan must include hand-written SQL appended to each generated migration file, OR a `journal.json`-checked custom statement file the migrator runs after drizzle.

### Pattern 2: `withTenantTx` — the only writable transaction primitive (D-09)

```ts
// packages/platform/src/db/tx.ts
import type { TransactionRollbackError } from "drizzle-orm";
import { Result, ok, err } from "neverthrow";
import { db, pool } from "./pool";

export type TenantId = string & { readonly _brand: "TenantId" };

export class TenantContextError extends Error {}

/** Reads can span multiple tenants (cross-workspace dashboard). */
export async function withTenantTxRead<T>(
  tenantIds: readonly TenantId[],
  fn: (tx: typeof db) => Promise<T>,
): Promise<Result<T, Error>> {
  if (tenantIds.length === 0) {
    return err(
      new TenantContextError("withTenantTxRead requires ≥1 tenant id"),
    );
  }
  return db
    .transaction(async (tx) => {
      // Postgres array literal: '{uuid1,uuid2,...}'
      const arrayLiteral = `{${tenantIds.join(",")}}`;
      await tx.execute(sql`SET LOCAL app.tenant_ids = ${arrayLiteral}`);
      return ok(await fn(tx));
    })
    .catch((e) => err(e as Error));
}

/** Writes restricted to a single tenant. */
export async function withTenantTx<T>(
  tenantId: TenantId,
  fn: (tx: typeof db) => Promise<T>,
): Promise<Result<T, Error>> {
  return withTenantTxRead([tenantId], fn);
}
```

dependency-cruiser then bans direct `db.transaction` outside `packages/platform/src/db/tx.ts`. See Pattern 5.

### Pattern 3: Better Auth `organization` plugin with `kind` and `defaultCurrency` custom fields (D-12)

**Source:** Context7 `/better-auth/better-auth` docs verified 2026-05-05.

```ts
// packages/identity/src/adapters/persistence/better-auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization } from "better-auth/plugins";
import { db } from "@budget/platform/db/pool";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),

  // D-13: grace login (NOT requireEmailVerification — banner gates risky actions instead)
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // grace login per D-13
    minPasswordLength: 10,
    autoSignIn: true,
    sendResetPassword: async ({ user, url, token }) => {
      await emailSender.send({
        to: user.email,
        template: "reset-password",
        vars: { url },
      });
    },
    resetPasswordTokenExpiresIn: 1800, // D-14: 30 min
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await emailSender.send({
        to: user.email,
        template: "verify-email",
        vars: { url },
      });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 86400, // D-13: 24h TTL
  },

  // Map our display_currency + locale + provider prefs onto user table
  user: {
    additionalFields: {
      locale: { type: "string", input: true, required: true }, // IDNT-05
      display_currency: { type: "string", input: true, required: true }, // MONY-09
      preferred_llm_provider: { type: "string", input: true, required: false }, // IDNT-07
      preferred_stt_provider: { type: "string", input: true, required: false }, // IDNT-08
    },
  },

  plugins: [
    organization({
      // TENT-09: unlimited workspaces per user
      allowUserToCreateOrganization: async () => true,
      // organizationLimit: undefined,  ← unbounded

      // TENT-10 + TENT-11: kind + default_currency on workspace
      schema: {
        organization: {
          modelName: "workspaces", // map org table → workspaces
          additionalFields: {
            kind: { type: "string", input: true, required: true }, // 'PRIVATE' | 'SHARED'
            default_currency: { type: "string", input: true, required: true }, // ISO-4217
          },
        },
      },

      organizationHooks: {
        // D-02: PRIVATE workspaces reject invites
        beforeAddMember: async ({ member, organization }) => {
          if (
            organization.kind === "PRIVATE" &&
            organization.member_count >= 1
          ) {
            throw new Error(
              "PRIVATE workspaces accept only the owner. Convert to SHARED first.",
            );
          }
        },
        // D-04: default_currency immutable — block any UPDATE attempt at the API layer
        beforeUpdateOrganization: async ({ before, after }) => {
          if (before.default_currency !== after.default_currency) {
            throw new Error("default_currency is immutable.");
          }
        },
        // TENT-13: when SHARED gets a new member, insert a 0% share row (owner re-balances)
        afterAddMember: async ({ member, organization }) => {
          if (organization.kind === "SHARED") {
            await sharesRepo.insertZero(organization.id, member.user_id);
          }
        },
        // D-06 audit: every share-related lifecycle event audited
      },

      sendInvitationEmail: async ({ id, email, organization, inviter }) => {
        const url = `${env.APP_URL}/accept-invitation/${id}`;
        await emailSender.send({
          to: email,
          template: "workspace-invite",
          vars: {
            url,
            workspace: organization.name,
            inviter: inviter.user.name,
          },
        });
      },
    }),
  ],
});
```

**Critical caveat from search:** Better Auth GitHub issue #3233 reports `activeOrganizationId` can be lost when combining `customSession` with `organization`. Phase 1 must verify behavior in an integration test. We do NOT use `customSession` in Phase 1 — we read active workspaces from our own `user_preferences.active_workspace_ids` instead, which side-steps the issue entirely.

### Pattern 4: Active-workspace multi-select → GUC array (D-07 + D-08)

```ts
// apps/api/src/middleware/tenant-guard.ts (request middleware)
import type { Context, Next } from "hono";

export const tenantGuard = async (c: Context, next: Next) => {
  const session = c.get("session"); // set by auth middleware
  if (!session) {
    c.set("tenantIds", []);
    return next();
  }

  // Read user's persisted multi-select
  const prefs = await userPrefsRepo.findByUserId(session.user.id);
  const claimedActive = prefs?.active_workspace_ids ?? [];

  // Cross-check against actual memberships (defense in depth — never trust prefs blindly)
  const actualMemberships = await membershipRepo.listForUser(session.user.id);
  const allowed = new Set(actualMemberships.map((m) => m.workspace_id));
  const tenantIds = claimedActive.filter((id) => allowed.has(id));

  c.set("tenantIds", tenantIds);
  await next();
};
```

The route handler then calls `withTenantTxRead(tenantIds, fn)` for reads, or for writes `withTenantTx(workspaceIdFromRequestBody, fn)` after asserting it's in `tenantIds`.

### Pattern 5: dependency-cruiser config (D-27 / ENGR-10)

```js
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: "domain-no-orm",
      severity: "error",
      comment: "Domain layer cannot import drizzle-orm (D-27)",
      from: { path: "^packages/[^/]+/src/domain/" },
      to: { path: "(drizzle-orm|drizzle-zod)" },
    },
    {
      name: "domain-no-http-framework",
      severity: "error",
      comment: "Domain layer cannot import Hono or AI SDK",
      from: { path: "^packages/[^/]+/src/domain/" },
      to: { path: "(^hono$|^@hono/|^ai$|^@ai-sdk/)" },
    },
    {
      name: "domain-no-sibling-adapters",
      severity: "error",
      comment: "Domain cannot reach into sibling adapters",
      from: { path: "^packages/[^/]+/src/domain/" },
      to: { path: "^packages/[^/]+/src/adapters/" },
    },
    {
      name: "cross-package-only-contracts",
      severity: "error",
      comment: "Cross-package imports must go through contracts/",
      from: {
        path: "^packages/([^/]+)/src/(?!contracts)",
        pathNot: "^packages/shared-kernel/",
      },
      to: { path: "^packages/(?!\\1)([^/]+)/src/(?!contracts)" },
    },
    {
      name: "no-direct-db-transaction",
      severity: "error",
      comment:
        "Only platform/db/tx.ts may call db.transaction — use withTenantTx (D-09)",
      from: { pathNot: "^packages/platform/src/db/tx\\.ts$" },
      to: { path: "drizzle-orm", dependencyTypesNot: ["type-only"] },
      via: { path: "\\.transaction\\(" }, // approximate; actual rule is grep + AST in CI
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
  },
};
```

**CI command:**

```bash
bunx depcruise --config .dependency-cruiser.cjs --output-type err apps packages
```

> **Note on the `withTenantTx` rule:** dependency-cruiser is import-graph based, not statement-based. The rule above is approximate. A robust enforcement combines: (a) the import rule banning sibling adapters, (b) a grep-based CI step `! grep -RE '\.transaction\(' --include='*.ts' --exclude-dir=tx --exclude=tx.ts apps/ packages/ ` outside the platform tx file. Plan must include both.

### Pattern 6: pg-boss + outbox dispatcher (D-25)

**Source:** Context7 `/timgit/pg-boss` constructor docs verified.

```ts
// packages/platform/src/jobs/boss.ts
import PgBoss from "pg-boss";
import { env } from "@budget/shared-kernel/env";

// schema isolated from bounded-context schemas (Claude's discretion: 'pgboss' default is fine; can rename)
export const boss = new PgBoss({
  connectionString: env.WORKER_DATABASE_URL, // worker_role DSN, no BYPASSRLS
  schema: "pgboss",
  application_name: "budget-worker",
});

await boss.start();

// Schedule: every 5s. pg-boss minimum cron resolution is 30s for cron strings;
// for sub-minute cadence we use a self-rescheduling job pattern OR work() with pollingIntervalSeconds.
// PREFERRED: a regular work() loop that processes outbox in batches.
await boss.createQueue("outbox-dispatch");
await boss.work(
  "outbox-dispatch",
  { pollingIntervalSeconds: 5, batchSize: 50 },
  async (jobs) => {
    // jobs is a kick-trigger; actual outbox poll happens here
    await dispatchOutboxBatch();
  },
);
// Re-trigger the worker every 5s with a recurring "tick" job
await boss.schedule("outbox-dispatch", "* * * * *"); // 1-minute cron for safety
// + insertJob with startAfter offsets if we want < 1 min cadence
```

```ts
// packages/platform/src/outbox/dispatcher.ts
import { sql } from "drizzle-orm";
import { eventBus } from "../events/bus";

export async function dispatchOutboxBatch(): Promise<number> {
  // Per-tenant fan-out: pull up to 100 undispatched rows, lock with SKIP LOCKED.
  // We do NOT use withTenantTx here — outbox is shared_kernel and intentionally cross-tenant.
  // worker_role still has FORCE RLS though, so we set GUC to '*all-tenants*' via an admin policy
  // OR (cleaner) we add a `WHERE tenant_id = ANY(...)` policy that also accepts a sentinel.
  //
  // Simplest correct option: shared_kernel.outbox has NO tenant policy (it's infrastructure)
  // — instead access is restricted by GRANT: only worker_role can SELECT it.
  return await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb
      FROM shared_kernel.outbox
      WHERE dispatched_at IS NULL
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    `);
    for (const row of rows.rows) {
      await eventBus.publish(row); // in-process bus
      await tx.execute(
        sql`UPDATE shared_kernel.outbox SET dispatched_at = now() WHERE id = ${row.id}`,
      );
    }
    return rows.rows.length;
  });
}
```

**Producer side (Phase 2 onwards uses this; Phase 1 ships only the writer + dispatcher skeleton):**

```ts
// packages/platform/src/outbox/writer.ts
export async function writeOutbox(
  tx: Tx,
  evt: {
    tenantId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: unknown;
  },
) {
  await tx.execute(sql`
    INSERT INTO shared_kernel.outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb)
    VALUES (${evt.tenantId}, ${evt.aggregateType}, ${evt.aggregateId}, ${evt.eventType}, ${JSON.stringify(evt.payload)}::jsonb)
  `);
}
```

### Pattern 7: libsodium key store (D-16)

**Source:** Context7 `/jedisct1/libsodium-doc` `crypto_secretbox_easy` verified.

```ts
// packages/platform/src/crypto/libsodium-key-store.ts
import sodium from "libsodium-wrappers";
import { env } from "@budget/shared-kernel/env";

let ready = false;
async function init() {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

const KEK = () =>
  sodium.from_base64(env.BUDGET_KEK, sodium.base64_variants.ORIGINAL); // 32 bytes

export interface UserDek {
  userId: string;
  cipherDek: Uint8Array;
  nonce: Uint8Array;
}

export async function generateUserDek(userId: string): Promise<UserDek> {
  await init();
  const dek = sodium.crypto_secretbox_keygen(); // 32-byte plaintext DEK
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipherDek = sodium.crypto_secretbox_easy(dek, nonce, KEK());
  // Plaintext dek is dropped after this scope; never persist it.
  return { userId, cipherDek, nonce };
}

export async function unwrapUserDek(record: UserDek): Promise<Uint8Array> {
  await init();
  const dek = sodium.crypto_secretbox_open_easy(
    record.cipherDek,
    record.nonce,
    KEK(),
  );
  if (!dek)
    throw new Error("DEK unwrap failed — KEK rotated or record corrupted");
  return dek;
}

export async function encryptForUser(
  dek: Uint8Array,
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  await init();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    dek,
  );
  return { ciphertext, nonce };
}

export async function decryptForUser(
  dek: Uint8Array,
  record: { ciphertext: Uint8Array; nonce: Uint8Array },
): Promise<string> {
  await init();
  const plaintext = sodium.crypto_secretbox_open_easy(
    record.ciphertext,
    record.nonce,
    dek,
  );
  if (!plaintext)
    throw new Error(
      "Decrypt failed — DEK destroyed (crypto-shred) or record tampered",
    );
  return sodium.to_string(plaintext);
}

// Email lookup: deterministic hash so login flow can `WHERE email_hash = $1`
export async function emailHash(email: string): Promise<Uint8Array> {
  await init();
  return sodium.crypto_generichash(
    32,
    sodium.from_string(email.toLowerCase()),
    KEK(),
  );
  // KEK as the BLAKE2b key → hash output stable across boots while key is constant
  // → swapping KEK invalidates lookups intentionally (forces re-hash batch on KEK rotation)
}
```

**DEK cache:** request-scoped (decode once, drop at response end). Implement via `AsyncLocalStorage` in Hono middleware.

### Pattern 8: Money value object (D-19)

```ts
// packages/shared-kernel/src/money.ts
import { dinero, add, multiply, toSnapshot, type Dinero } from 'dinero.js';
import { USD, EUR, PLN, GBP, UAH /* ... */ } from '@dinero.js/currencies';
import Big from 'big.js';

export type FiatCurrency = 'USD' | 'EUR' | 'PLN' | 'GBP' | 'UAH' | /* ... */;
export type CryptoCurrency = 'BTC' | 'ETH' | /* ... */;
export type Currency = FiatCurrency | CryptoCurrency;

const CRYPTO_CURRENCIES = new Set<Currency>(['BTC', 'ETH']);

export class Money {
  // private constructor — must use Money.of(...)
  private constructor(
    public readonly amount: Big,        // exact decimal — represents major units
    public readonly currency: Currency,
  ) {}

  static of(amount: string | number, currency: Currency): Money {
    return new Money(new Big(amount), currency);
  }

  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('cannot add different currencies — convert first');
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  // Persistence helpers: the adapter boundary. NEVER call these in domain.
  toDb(): { amount_minor: bigint, currency: Currency } {
    if (CRYPTO_CURRENCIES.has(this.currency)) {
      // NUMERIC(38,18) — emit as string
      return { amount_minor: 0n, currency: this.currency };  // crypto path uses dedicated columns
    }
    // Fiat: shift to 4 decimals (NUMERIC(19,4)) → store as bigint cents-times-100
    const minor = BigInt(this.amount.times(10000).round(0, Big.roundHalfEven).toString());
    return { amount_minor: minor, currency: this.currency };
  }

  static fromDb(amount_minor: bigint | string, currency: Currency): Money {
    return new Money(new Big(amount_minor.toString()).div(10000), currency);
  }
}
```

**ESLint rule `no-float-money` (Claude discretion):** custom rule walks AST, flags `+/-/*\//` on identifiers whose declared type is `Money` or whose RHS is a `.amount`. Plan can ship a `tsc`-only first pass (mark all Money methods `readonly` and ban `+`) and add the AST rule in Phase 2 if surface area grows.

### Pattern 9: Append-only ledger primitive (D-23)

```ts
// packages/budgeting/.../schema.ts (Phase 2 fills it; Phase 1 ships table only)
export const expenseLedger = budgeting.table(
  "expense_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    amountOrig: numeric("amount_orig", { precision: 19, scale: 4 }).notNull(),
    currencyOrig: text("currency_orig").notNull(),
    amountDefault: numeric("amount_default", {
      precision: 19,
      scale: 4,
    }).notNull(),
    currencyDefault: text("currency_default").notNull(),
    fxRate: numeric("fx_rate", { precision: 19, scale: 8 }).notNull(),
    fxRateDate: date("fx_rate_date").notNull(),
    fxProvider: text("fx_provider").notNull(),
    correctsId: uuid("corrects_id"),
    correctedById: uuid("corrected_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    pgPolicy("expense_ledger_tenant_isolation", {
      /* same as Pattern 1 */
    }),
  ],
);
```

Migration appends:

```sql
REVOKE UPDATE, DELETE ON budgeting.expense_ledger FROM app_role, worker_role;
GRANT SELECT, INSERT ON budgeting.expense_ledger TO app_role, worker_role;
ALTER TABLE budgeting.expense_ledger FORCE ROW LEVEL SECURITY;
```

CI assertion (Phase 1 tenant-leak suite includes this):

```sql
SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'UPDATE');  -- must be false
SELECT has_table_privilege('app_role', 'budgeting.expense_ledger', 'DELETE');  -- must be false
```

### Pattern 10: Migration role separation + advisory lock (D-18)

```ts
// apps/migrator/src/migrate.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.MIGRATOR_DATABASE_URL }); // migrator role
const db = drizzle(pool);

await db.execute(sql`SELECT pg_advisory_lock(hashtext('budget-migrations'))`);
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
} finally {
  await db.execute(
    sql`SELECT pg_advisory_unlock(hashtext('budget-migrations'))`,
  );
  await pool.end();
}
process.exit(0);
```

Compose:

```yaml
services:
  migrator:
    build: ./apps/migrator
    environment:
      MIGRATOR_DATABASE_URL: postgres://migrator:${MIGRATOR_PW}@db:5432/budget
    depends_on:
      db:
        condition: service_healthy
    restart: "no" # one-shot
  api:
    depends_on:
      migrator:
        condition: service_completed_successfully
```

### Pattern 11: next-intl proxy.ts (Next.js 16) — D-29

**⚠ Breaking change:** Next.js 16 renamed `middleware.ts` → `proxy.ts`. next-intl docs reflect this.

```ts
// apps/web/i18n/routing.ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "pl", "uk"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

```ts
// apps/web/proxy.ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
```

Catalogs at `apps/web/messages/{en,pl,uk}.json`. The ~70 keys from UI-SPEC become the EN canonical file in Phase 1; PL and UK ship at the same keys (translation can be machine-assisted but each catalog must compile and pass a key-parity check).

### Anti-Patterns to Avoid

- **Mutating `default_currency` after workspace creation.** Add an UPDATE trigger that raises an exception. App layer ALSO blocks it via Better Auth `beforeUpdateOrganization`.
- **Reading active_workspace_ids from session cookie.** It must come from `user_preferences` table — cookies are user-controllable.
- **Calling `db.transaction` inside domain code.** Always `withTenantTx`. Enforced by dependency-cruiser.
- **Using `SET` (without LOCAL).** With pgBouncer transaction-pooling this leaks tenant context to the next request. Always `SET LOCAL` and only inside an explicit transaction.
- **Storing Better Auth session as JWT.** D-15 says Postgres-backed; revocability requires server-side state.
- **Lucia, next-pwa, Prisma, NestJS, Express.** Forbidden per CLAUDE.md.
- **bcrypt vs argon2 hand-pick:** Better Auth ships scrypt by default; trust the default unless deliberate reason.
- **drizzle-kit push for production migrations.** RLS policies don't reliably apply on push (see Pitfalls); use `generate` + `migrate`.

---

## Don't Hand-Roll

| Problem                  | Don't Build                        | Use Instead                                                     | Why                                                                                                       |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Email/password auth      | Custom signup, hash, verify, reset | Better Auth `emailAndPassword` + `emailVerification`            | Token TTL, single-use, replay protection, rate limits                                                     |
| Org/workspace + invites  | Custom org table with email tokens | Better Auth `organization` plugin                               | Invite TTL, email flow, role enforcement                                                                  |
| Session storage + revoke | JWT or custom Redis sessions       | Better Auth Postgres-backed sessions                            | List + revoke per device handled                                                                          |
| Money arithmetic         | `number` + `.toFixed(2)`           | `Money` (Dinero v2 + big.js)                                    | Float drift = financial bugs; ESLint `no-float-money` enforces                                            |
| Decimal/exact math       | hand-rolled fixed-point            | big.js                                                          | Vetted decimal arithmetic for crypto                                                                      |
| Transactional outbox     | hand-rolled `setInterval`          | pg-boss schedule + `SELECT FOR UPDATE SKIP LOCKED`              | Multi-replica safety, exactly-once-ish                                                                    |
| Cron in-process          | `node-cron`                        | pg-boss `schedule()`                                            | Persistent, multi-replica-safe, retries                                                                   |
| Symmetric encryption     | custom AES-GCM                     | libsodium `crypto_secretbox_easy`                               | AEAD with safe defaults; nonce + MAC handled                                                              |
| Result type              | hand-rolled discriminated union    | `neverthrow`                                                    | Chainable, well-typed, ecosystem standard                                                                 |
| Branded ID types         | bare `string`                      | branded `string & { readonly _brand: 'TenantId' }`              | Compile-time tenant safety                                                                                |
| ID generation            | `uuid v4`                          | UUID v7 (time-sortable)                                         | Better B-tree locality + Postgres v17 native function `uuid_generate_v7` (or app-side `nanoid` for slugs) |
| Migration runner         | hand-rolled                        | drizzle-kit + `drizzle-orm/.../migrator`                        | journal.json + advisory lock pattern is standard                                                          |
| GUC-based RLS context    | manual `pg.query("SET LOCAL ...")` | wrapped in `withTenantTx` from `packages/platform/src/db/tx.ts` | dependency-cruiser bans direct calls                                                                      |
| i18n message catalogs    | custom JSON loader                 | next-intl                                                       | App Router + RSC + plural rules + ICU MessageFormat                                                       |
| Zod for env validation   | scattered `process.env.X!`         | single `env.ts` with zod schema, fail-fast at boot              | Typed `env` everywhere                                                                                    |
| Form state + validation  | useState chains                    | react-hook-form + zodResolver                                   | UI-SPEC mandates                                                                                          |

**Key insight:** Phase 1's job is establishing rails so future phases plug in trivially. Every "let's just write a small helper" temptation here is a future bug.

---

## Runtime State Inventory

**Greenfield phase — no rename or refactor. Step 2.5 SKIPPED.**

| Category            | Items Found                                      | Action Required                                                                                                                                 |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data         | None — empty repo, no DB exists yet              | None                                                                                                                                            |
| Live service config | None                                             | None                                                                                                                                            |
| OS-registered state | None                                             | None                                                                                                                                            |
| Secrets/env vars    | None — `.env.example` will be created in Phase 1 | Document keys: `DATABASE_URL`, `MIGRATOR_DATABASE_URL`, `WORKER_DATABASE_URL`, `BUDGET_KEK`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_URL` |
| Build artifacts     | None                                             | None                                                                                                                                            |

---

## Common Pitfalls

### Pitfall 1: drizzle-kit `push` silently skips RLS policies

**Severity:** HIGH · **Likelihood:** HIGH (default for new dev workflows)

**Source:** [drizzle-orm GitHub issue #3504](https://github.com/drizzle-team/drizzle-orm/issues/3504)

**What goes wrong:** `drizzle-kit push` was reported to not apply RLS policies that `drizzle-kit generate + migrate` does apply. Devs run `push` in dev, "it works", then prod migration generates SQL with policies and breaks on test suites that didn't have them locally.

**How to avoid:**

- **Production path always:** `drizzle-kit generate` → review SQL → `drizzle-kit migrate` (or our `apps/migrator` runner).
- **Dev path:** also generate + migrate (against the dockerized `db` service). Don't use `push` at all — kill the temptation by not putting it in any npm script.
- CI gate: a smoke test that creates a workspace, verifies a row, switches tenant context, asserts the same query returns zero rows. If RLS isn't applied, this fails.

### Pitfall 2: Postgres NUMERIC arrives as JS string in node-postgres

**Severity:** HIGH · **Likelihood:** HIGH

**Source:** [node-postgres issue #811](https://github.com/brianc/node-postgres/issues/811), [pg-types](https://www.npmjs.com/package/pg-types)

**What goes wrong:** OID 1700 (NUMERIC) is returned as a string by `pg`. Devs reflexively `Number(row.amount)` to "fix" it → instant precision loss. Same for BIGINT (OID 20). Drizzle does NOT auto-cast to bigint or decimal — it passes through whatever the driver gives.

**How to avoid:**

- Money columns NEVER pass through `Number()`. The `Money.fromDb(row.amount_minor as string, row.currency)` constructor accepts the string and keeps it exact via big.js.
- `pg-types` config at boot:

```ts
import { types } from "pg";
types.setTypeParser(20 /* BIGINT */, (v) => BigInt(v)); // returns bigint
// Leave 1700 NUMERIC as string. Money.fromDb consumes string.
```

- Lint rule: any `Number(...)` call near a `_minor` field is an error.

### Pitfall 3: Better Auth `customSession` drops `activeOrganizationId`

**Severity:** MEDIUM · **Likelihood:** LOW (only if we add customSession)

**Source:** [Better Auth issue #3233](https://github.com/better-auth/better-auth/issues/3233)

**What goes wrong:** Combining `customSession` plugin with `organization` plugin can lose `activeOrganizationId` on the session due to plugin order / type inference.

**How to avoid:** Phase 1 does NOT use `customSession`. Active workspaces live in `user_preferences.active_workspace_ids` (D-07). Tenant guard middleware reads this — bypasses the issue entirely.

### Pitfall 4: pgBouncer transaction-pooling drops `SET LOCAL` between transactions (correct), but `SET` (without LOCAL) leaks across pool slots (catastrophic)

**Severity:** CRITICAL · **Likelihood:** HIGH if devs cargo-cult connection examples

**Source:** PITFALLS.md prior research; Postgres docs.

**How to avoid:**

- `withTenantTx` always opens an explicit `BEGIN`, runs `SET LOCAL`, commits.
- Pool config: prefer session-pooling at PgBouncer (or no PgBouncer in v1; we have a small connection footprint and Postgres 17 default pool is fine).
- Add a defensive `RESET app.tenant_ids` on connection release.
- CI grep: ban `SET app.tenant_ids` (without LOCAL) in repo.

### Pitfall 5: pg-boss cron minimum cadence is ~30s (5-placeholder cron) — not seconds

**Severity:** LOW · **Likelihood:** MEDIUM

**Source:** Context7 `/timgit/pg-boss` scheduling docs.

**What goes wrong:** Devs write `* * * * * *` (6-placeholder = seconds) thinking they get a 1s scheduler. pg-boss evaluates schedules every 30s by default; the 6-placeholder format causes "only run at exactly :30" parse failures.

**How to avoid:**

- Outbox dispatcher uses `work()` with `pollingIntervalSeconds: 5` — NOT a cron schedule.
- Minute-level (or coarser) work uses `schedule('queue', '*/5 * * * *', ...)`.
- Set `cronWorkerIntervalSeconds: 30` explicitly to match Bun's clock.

### Pitfall 6: drizzle-kit doesn't generate `FORCE ROW LEVEL SECURITY` or column-level `REVOKE`

**Severity:** HIGH · **Likelihood:** HIGH

**What goes wrong:** Devs declare `pgPolicy()` and assume security is done. Postgres default is "table owner bypasses RLS" unless `FORCE` set; drizzle-kit emits `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` but not `FORCE`.

**How to avoid:**

- Append a `post-migration.sql` step to every drizzle migration that issues `ALTER TABLE ... FORCE ROW LEVEL SECURITY` for each table.
- A CI test in the tenant-leak suite asserts via `pg_class.relforcerowsecurity = true` for every table in `identity.*`, `tenancy.*` schemas.

### Pitfall 7: Bun + Next.js sub-package can fail to start

**Severity:** MEDIUM · **Likelihood:** MEDIUM

**Source:** [Bun issue #25014](https://github.com/oven-sh/bun/issues/25014).

**What goes wrong:** Some Next.js + Bun workspaces config combinations fail at start.

**How to avoid:** `apps/web` uses Node-compatible package layout; if Next dev server hits the issue, run `apps/web` with Node (`bunx next dev` or `npx next dev`) while still using `bun install` at the root for dep management. Document the workaround in `apps/web/README.md`. Production: Next.js builds via `next build` and runs the production server — Bun runtime works fine for the production server.

### Pitfall 8: Better Auth Drizzle adapter requires `experimental.joins: true` for v1.4+ functionality

**Severity:** MEDIUM · **Likelihood:** HIGH

**Source:** CLAUDE.md compatibility table.

**How to avoid:**

```ts
drizzle({ client: pool, /* drizzle config */, casing: 'snake_case' });
// In drizzle config: experimental: { joins: true }
```

Verified at planner time against the exact better-auth + drizzle-orm version pair pinned.

### Pitfall 9: libsodium async `await sodium.ready` must complete before any crypto call

**Severity:** HIGH · **Likelihood:** MEDIUM

**Source:** [libsodium-wrappers npm](https://www.npmjs.com/package/libsodium-wrappers).

**How to avoid:** Module-level `await sodium.ready` at API boot (Bun supports top-level await) BEFORE any request handler can call `encryptForUser`. Ship a smoke test that proves `encryptForUser` works synchronously after init.

### Pitfall 10: Outbox dispatcher must use a role with read access across all tenants — but app_role is RLS-bound

**Severity:** HIGH · **Likelihood:** HIGH

**What goes wrong:** Worker dispatches outbox events for all tenants, but worker_role has `FORCE ROW LEVEL SECURITY` and can't see rows without setting `app.tenant_ids`. If dispatcher sets `app.tenant_ids` to one tenant, it skips others.

**How to avoid (chosen):** `shared_kernel.outbox` has NO RLS policy. Access is restricted via GRANT: only `worker_role` can SELECT/UPDATE it; `app_role` has only INSERT (producers). The `tenant_id` column on `outbox` is informational, not a security boundary. Document this clearly in the outbox schema file: it's infrastructure, not domain data.

### Pitfall 11: `email_hash` deterministic lookup vs crypto-shredding — what survives DEK destruction?

**Severity:** HIGH · **Likelihood:** MEDIUM

**What goes wrong (Phase 6, designed in Phase 1):** Right-to-delete destroys the DEK → encrypted email column becomes ciphertext garbage. But `email_hash` (BLAKE2b keyed by KEK) is still readable and reversible by anyone with the KEK and a guess-list. Reidentification possible.

**How to avoid (designed in Phase 1, ships Phase 6):**

- After DEK destruction, also overwrite `email_hash` to a tombstone value (e.g., 32 random bytes).
- Lookup-by-email becomes impossible for the tombstoned row. Login intentionally fails — this is the GDPR Article 17 outcome.
- Document this in the schema comment so Phase 6 devs don't get confused.

### Pitfall 12: Next.js 16 renamed `middleware.ts` to `proxy.ts`

**Severity:** LOW (caught at planning) · **Likelihood:** HIGH (training data is older)

**Source:** [next-intl middleware docs](https://next-intl.dev/docs/routing/middleware).

**How to avoid:** Use `apps/web/proxy.ts`, not `middleware.ts`.

---

## Code Examples

All code examples are inline in **Architecture Patterns** above. Sources cited per pattern.

---

## State of the Art

| Old Approach              | Current Approach                                          | When Changed                  | Impact                                           |
| ------------------------- | --------------------------------------------------------- | ----------------------------- | ------------------------------------------------ |
| Lucia auth                | Better Auth                                               | March 2025 (Lucia deprecated) | Use Better Auth + organization plugin            |
| `middleware.ts` (Next.js) | `proxy.ts` (Next.js 16)                                   | Next.js 16 release            | next-intl docs use proxy.ts; rename if migrating |
| `enableRLS()` (Drizzle)   | `pgTable.withRLS(...)` (or implicit when policy attached) | drizzle-orm v1.0.0-beta.1     | Use new API; old still works in 0.45.x           |
| next-pwa                  | Serwist                                                   | 2024                          | next-pwa unmaintained — Phase 6 ships Serwist    |
| Prisma RLS workarounds    | Drizzle pgPolicy                                          | 2024                          | Drizzle is now the default for RLS-heavy apps    |

**Deprecated/outdated:**

- moment.js, dayjs (mutable defaults — use Temporal API)
- node-cron (loses jobs on deploy — use pg-boss)
- Lucia (deprecated)
- Express (slower than Hono; not Bun-first)

---

## Validation Architecture

Per CLAUDE.md and ROADMAP §"Phase 1 Success Criteria", below is the test framework + Phase 1 success criteria → test mapping. This drives a downstream `01-VALIDATION.md` if generated.

### Test Framework

| Property           | Value                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Backend framework  | `bun:test` (built-in to Bun 1.3.x)                                                                        |
| Frontend framework | Vitest 4.x + happy-dom + @testing-library/react                                                           |
| E2E framework      | Playwright                                                                                                |
| Backend config     | `bunfig.toml` `[test]` section + per-package `test/` dir                                                  |
| Frontend config    | `apps/web/vitest.config.ts`                                                                               |
| Quick run command  | `bun test` (root, runs all package suites)                                                                |
| Full suite command | `bun test && bunx vitest run --root apps/web && bunx playwright test`                                     |
| CI gates           | Tenant-leak suite (4 tests) + dependency-cruiser + key-parity + bun test --coverage --threshold=domain:80 |

### Phase 1 Success Criteria → Test Map

(Numbered to match ROADMAP §"Phase 1 Success Criteria".)

| #      | Behavior                                                                 | Test Type                 | Automated Command                                                                                                                                                                                    | Phase 1 wave |
| ------ | ------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1a     | Sign up email/password                                                   | integration               | `bun test packages/identity/test/sign-up.test.ts`                                                                                                                                                    | Wave 2       |
| 1b     | Email verification email sent + token consume                            | integration               | `bun test packages/identity/test/verify-email.test.ts`                                                                                                                                               | Wave 2       |
| 1c     | Password reset (30 min TTL)                                              | integration               | `bun test packages/identity/test/reset-password.test.ts`                                                                                                                                             | Wave 2       |
| 1d     | Session list + revoke                                                    | integration               | `bun test packages/identity/test/sessions.test.ts`                                                                                                                                                   | Wave 2       |
| 1e     | Settings rendered in EN/PL/UK                                            | E2E                       | `bunx playwright test tests/e2e/locale-render.spec.ts`                                                                                                                                               | Wave 3       |
| 1f     | Locale persists from signup → settings                                   | integration               | `bun test packages/identity/test/locale.test.ts`                                                                                                                                                     | Wave 2       |
| 2a     | Create PRIVATE workspace (kind=PRIVATE, member_count==1)                 | integration               | `bun test packages/tenancy/test/create-private.test.ts`                                                                                                                                              | Wave 2       |
| 2b     | Create SHARED workspace + invite member email                            | integration               | `bun test packages/tenancy/test/create-shared-invite.test.ts`                                                                                                                                        | Wave 2       |
| 2c     | default_currency immutable post-create                                   | integration               | `bun test packages/tenancy/test/default-currency-immutable.test.ts` (asserts UPDATE → throws)                                                                                                        | Wave 2       |
| 2d     | User joins multiple SHARED workspaces unbounded                          | integration               | `bun test packages/tenancy/test/multi-shared.test.ts`                                                                                                                                                | Wave 2       |
| 2e     | active_workspace_ids persists across sessions                            | integration               | `bun test packages/tenancy/test/active-filter.test.ts`                                                                                                                                               | Wave 2       |
| 2f     | SHARED owner edits shares; sum=100; audit row written                    | integration               | `bun test packages/tenancy/test/shares-audit.test.ts`                                                                                                                                                | Wave 2       |
| 2g     | display_currency independent of any workspace currency                   | integration               | `bun test packages/identity/test/display-currency.test.ts`                                                                                                                                           | Wave 2       |
| 2h     | Owner role enforced (member can't invite)                                | integration               | `bun test packages/tenancy/test/role-enforcement.test.ts`                                                                                                                                            | Wave 2       |
| **3a** | **Request without `app.tenant_ids` → 0 rows from every user-data table** | **CI gate (tenant-leak)** | `bun test tests/tenant-leak/no-guc-zero-rows.test.ts`                                                                                                                                                | **Wave 3**   |
| **3b** | **Worker job omitting tenantIds → errors before DB read**                | **CI gate (tenant-leak)** | `bun test tests/tenant-leak/job-without-tenant-errors.test.ts`                                                                                                                                       | **Wave 3**   |
| **3c** | **`pg_roles` confirms app + worker have NO BYPASSRLS**                   | **CI gate (tenant-leak)** | `bun test tests/tenant-leak/pg-roles-no-bypassrls.test.ts`                                                                                                                                           | **Wave 3**   |
| **3d** | **`pg_class.relforcerowsecurity=true` for every user-data table**        | **CI gate (tenant-leak)** | `bun test tests/tenant-leak/force-rls-on-all-tables.test.ts`                                                                                                                                         | **Wave 3**   |
| 4a     | `docker compose up` brings up web + api + worker + db                    | E2E (compose smoke)       | `tests/compose-up.sh` runs `docker compose up -d --wait`; healthchecks pass                                                                                                                          | Wave 3       |
| 4b     | Migrations apply via separate role with advisory lock                    | integration               | `bun test tests/migrator-role.test.ts` (asserts `current_user='migrator'` during DDL; lock prevents 2nd concurrent migrator)                                                                         | Wave 0       |
| 4c     | dependency-cruiser blocks domain → drizzle-orm/hono import               | CI gate                   | `bunx depcruise --config .dependency-cruiser.cjs apps packages`                                                                                                                                      | Wave 0       |
| 4d     | grep-CI: no `db.transaction` outside `packages/platform/src/db/tx.ts`    | CI grep                   | `! grep -RE '\.transaction\(' --include='*.ts' --exclude=tx.ts apps packages`                                                                                                                        | Wave 0       |
| 5a     | Money(USD, '1.99').add(Money(USD, '0.01')) === Money(USD, '2.00')        | unit                      | `bun test packages/shared-kernel/test/money.test.ts`                                                                                                                                                 | Wave 1       |
| 5b     | Money(BTC, '0.000000000000000001') round-trips through DB                | integration               | `bun test packages/shared-kernel/test/money-crypto.test.ts`                                                                                                                                          | Wave 1       |
| 5c     | ESLint `no-float-money` flags `total += expense.amount`                  | unit                      | `bunx eslint --rule no-float-money/error tests/fixtures/float-money.ts`                                                                                                                              | Wave 1       |
| 5d     | Clock port: SystemClock returns now(); FakeClock returns injected        | unit                      | `bun test packages/shared-kernel/test/clock.test.ts`                                                                                                                                                 | Wave 1       |
| 5e     | Result<T, E>: ok().isOk() === true; err().isOk() === false               | unit                      | `bun test packages/shared-kernel/test/result.test.ts`                                                                                                                                                | Wave 1       |
| 5f     | TenantId / UserId branded types reject bare string at compile            | tsc                       | `bunx tsc --noEmit --project packages/shared-kernel/tsconfig.json`                                                                                                                                   | Wave 1       |
| 5g     | audit_history queryable for any non-ledger entity                        | integration               | `bun test packages/platform/test/audit.test.ts` (writes a workspace, asserts audit row visible)                                                                                                      | Wave 1       |
| 5h     | Outbox survives worker restart without duplicate dispatch                | integration               | `bun test packages/platform/test/outbox-restart.test.ts` (insert 5 rows, kill worker mid-batch via `process.kill`, restart, assert each event delivered exactly once via consumer-side dedupe count) | Wave 3       |

### Sampling Rate

- **Per task commit:** `bun test --filter <package>` (changed-package only, < 30s typical)
- **Per wave merge:** `bun test` (root, all packages, < 5 min)
- **Phase gate:** Full suite green: `bun test && bunx vitest run --root apps/web && bunx playwright test && bunx depcruise --config .dependency-cruiser.cjs apps packages`

### Wave 0 Gaps

Phase 1 is greenfield — every test file below must be created. Inventory:

- [ ] `bunfig.toml` with `[test]` config (coverage threshold for `domain/`)
- [ ] `apps/web/vitest.config.ts` + `apps/web/test/setup.ts`
- [ ] `playwright.config.ts` at root + `tests/e2e/` directory
- [ ] `tests/tenant-leak/` directory (4 files; D-11)
- [ ] `tests/compose-up.sh` smoke check
- [ ] `packages/shared-kernel/test/{money,money-crypto,clock,result}.test.ts`
- [ ] `packages/identity/test/*.test.ts` (8 files)
- [ ] `packages/tenancy/test/*.test.ts` (8 files)
- [ ] `packages/platform/test/{audit,outbox-restart}.test.ts`
- [ ] `tests/migrator-role.test.ts`
- [ ] `tests/fixtures/float-money.ts` (negative-test fixture for ESLint rule)
- [ ] `.dependency-cruiser.cjs` + grep CI step
- [ ] `eslint.config.js` flat-config + custom `no-float-money` rule (custom rules in `eslint-rules/`)

---

## Security Domain

`security_enforcement` not explicitly disabled in `.planning/config.json` (file does not exist). Treating as enabled.

### Applicable ASVS Categories

| ASVS Category         | Applies           | Standard Control                                                                                                   |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| V2 Authentication     | yes               | Better Auth (scrypt password hashing default; configurable); 30-min reset TTL; 24h verify TTL; rate-limited resend |
| V3 Session Management | yes               | Better Auth Postgres-backed sessions; revocable; cookie HTTP-only + secure + SameSite=Lax                          |
| V4 Access Control     | yes               | Better Auth `organization` roles (owner/member); RLS as second layer (defense in depth)                            |
| V5 Input Validation   | yes               | Zod schemas at every boundary (`@hono/zod-validator` for HTTP, drizzle-zod for DB DTOs, Better Auth schema)        |
| V6 Cryptography       | yes               | libsodium for KEK/DEK; never hand-roll; `BUDGET_KEK` 32-byte from secret manager                                   |
| V7 Errors & Logging   | yes (later phase) | pino structured logs + OTel; PII scrubbed at log boundary                                                          |
| V8 Data Protection    | yes               | Crypto-shredding pattern (D-16); RLS on every user-data table; Postgres TDE/pg_tde optional in v1.x                |
| V9 Communications     | yes               | TLS-only in production (Compose dev = http); HSTS in Phase 6                                                       |
| V11 Business Logic    | yes               | Owner cannot leave as last owner (TENT-05); shares sum = 100                                                       |
| V12 Files & Resources | n/a Phase 1       | —                                                                                                                  |
| V14 Configuration     | yes               | Zod env validation; secret manager for `BUDGET_KEK` and `BETTER_AUTH_SECRET`; never in git                         |

### Known Threat Patterns for {Bun + Hono + Drizzle + Postgres + Better Auth}

| Pattern                              | STRIDE                 | Standard Mitigation                                                                        |
| ------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------ |
| SQL injection                        | Tampering              | Drizzle parameterized queries — never `sql.raw(userInput)`                                 |
| Tenant cross-leak                    | Information Disclosure | RLS + FORCE ROW LEVEL SECURITY + no BYPASSRLS + tenant-leak CI gate                        |
| Session fixation                     | Spoofing               | Better Auth rotates session id on auth state change                                        |
| CSRF on state-changing endpoints     | Tampering              | Better Auth: SameSite=Lax cookie; explicit CSRF token for cookie-auth POSTs                |
| Email-takeover via password reset    | Spoofing               | Single-use 30-min token; reuse → invalidates remaining tokens                              |
| Brute-force login                    | Spoofing               | Better Auth rate limit + account lock-out (configurable; ship sane defaults)               |
| Resend abuse                         | DoS                    | 1/min cooldown for verification email resend (D-13); banner shows countdown                |
| KEK exposure                         | Information Disclosure | KEK only via env from secret manager; never logged; rotation procedure documented for v1.x |
| Mass-assignment via additionalFields | Tampering              | Better Auth `input: true` is opt-in; only fields we declare are accepted                   |
| Unverified email creates workspace   | Tampering              | App-layer check (D-13); reject with 403 + `workspaces.verify_required` i18n key            |

---

## Suggested Plan Decomposition

Phase 1 is large but parallel-friendly within waves. Recommend **10 plans across 4 waves**.

### Wave 0 — Skeleton (must finish before Wave 1; ≈1 plan, blocking)

**Plan 0 — `monorepo-skeleton`** (blocking foundation)

- Bun workspaces root `package.json`
- `tsconfig.base.json` (strict, ES2024, target Bun 1.3)
- `apps/{api,web,worker,migrator}/package.json` skeletons
- `packages/{shared-kernel,identity,tenancy,platform}/package.json` skeletons
- `.dependency-cruiser.cjs` (D-27 / ENGR-10) + CI grep step (D-09 enforcement)
- `eslint.config.js` flat-config + `no-float-money` custom rule
- `bunfig.toml` test config + coverage threshold
- `vitest.config.ts` for `apps/web`
- `playwright.config.ts`
- `.env.example` + zod schema in `packages/shared-kernel/src/env.ts`
- Pre-commit hooks (Husky + lint-staged)
- Verifies: 4c, 4d (CI rules pass on empty-but-valid scaffolds)

### Wave 1 — Foundations (after Wave 0; 4 parallel plans)

**Plan 1 — `shared-kernel`** (parallel)

- `Money` value object (D-19) — Dinero v2 + big.js + adapter helpers
- `Clock` port + `SystemClock` + `FakeClock` (D-20)
- `Result<T, E>` re-export from neverthrow (D-21)
- `TenantId`, `UserId` branded UUID v7 (D-22)
- ESLint `no-float-money` rule + fixtures
- Verifies: 5a, 5b, 5c, 5d, 5e, 5f

**Plan 2 — `db-rls-skeleton`** (parallel)

- `packages/platform/src/db/{pool,tx,rls,numeric-parser}.ts`
- `withTenantTx` + `withTenantTxRead` primitives (D-09)
- pgRoles declared via Drizzle (`pgRole('app_role')`, `pgRole('worker_role')`, `pgRole('migrator')`) all NOBYPASSRLS
- `pgSchema('identity')`, `pgSchema('tenancy')`, `pgSchema('shared_kernel')`, `pgSchema('comparison')` (empty for now) declared (D-17)
- Migration runner (`apps/migrator/src/migrate.ts`) with advisory lock (D-18) + role-aware DSN
- pg-types config for NUMERIC + BIGINT
- Verifies: 4b

**Plan 3 — `audit-and-outbox`** (parallel)

- `shared_kernel.audit_history` table (D-24) + `writeAudit` helper
- `shared_kernel.outbox` table (D-25) + `writeOutbox` helper + dispatcher in `apps/worker`
- pg-boss singleton in `packages/platform/src/jobs/boss.ts`
- Outbox restart safety test (5h)
- Worker role grants: SELECT/UPDATE on outbox, INSERT only for app_role (Pitfall 10)
- Verifies: 5g, 5h

**Plan 4 — `crypto-shredding-store`** (parallel)

- `packages/platform/src/crypto/libsodium-key-store.ts` (D-16)
- `shared_kernel.user_keys` table
- `CryptoKeyStore` port in `packages/shared-kernel/src/ports/crypto-keys.ts`
- Email hash deterministic helper
- AsyncLocalStorage-based DEK request cache
- Boot-time `await sodium.ready` smoke test (Pitfall 9)
- Verifies: (Phase 6 ships destroy flow; Phase 1 verifies wrap/unwrap correctness)

### Wave 2 — Bounded Contexts (after Wave 1; 3 parallel plans)

**Plan 5 — `identity-context`** (parallel)

- Better Auth instance + Drizzle adapter (D-12)
- `emailAndPassword` + `emailVerification` + `sendResetPassword` (D-13, D-14)
- `users` `additionalFields`: locale, display_currency, preferred_llm_provider, preferred_stt_provider (IDNT-05..08, MONY-09)
- `user_preferences.active_workspace_ids` table (D-07)
- Session list + revoke endpoint (D-15)
- Email port skeleton (`StdoutEmailSender` dev adapter)
- Locale + display_currency settings endpoints
- Verifies: 1a, 1b, 1c, 1d, 1f, 2g

**Plan 6 — `tenancy-context`** (parallel)

- Better Auth `organization` plugin with `kind`, `default_currency` `additionalFields` (D-12, TENT-10, TENT-11)
- `organizationHooks` for: PRIVATE invite-reject (D-02), default_currency-immutable (D-04), member-add → 0% share row (D-06)
- DB CHECK trigger blocking `default_currency` UPDATE on `tenancy.workspaces`
- `tenancy.shared_workspace_member_shares` table + sum=100 transactional invariant (D-06, TENT-13)
- Owner-only shares edit endpoint with audit_history writes
- Cross-workspace dashboard backend: `GET /workspaces/active` returns the multi-select state
- `set-active-workspaces` endpoint (D-07)
- Transfer-ownership + leave-workspace flows (TENT-05, TENT-06)
- Verifies: 2a, 2b, 2c, 2d, 2e, 2f, 2h

**Plan 7 — `tenant-context-middleware`** (parallel; depends on Plan 5+6 contracts)

- `apps/api/src/middleware/tenant-guard.ts` reading `user_preferences.active_workspace_ids` and intersecting with actual memberships
- `apps/api/src/middleware/auth.ts` Better Auth session resolver
- `apps/api/src/middleware/i18n.ts` reads `users.locale`
- `apps/api/src/middleware/error.ts` Result<T,E> → HTTP
- Verifies: integration glue for 1a–2h passing

### Wave 3 — Web + Compose + Tenant-Leak Gate (after Wave 2; 3 parallel plans)

**Plan 8 — `web-app-surfaces`** (parallel; depends on Wave 2 RPC contracts)

- Next.js 16 App Router + next-intl `proxy.ts` (D-29; UI-SPEC mandates EN/PL/UK)
- `messages/{en,pl,uk}.json` with all ~70 keys from UI-SPEC
- shadcn/ui init: zinc, new-york, 21-component inventory
- Auth pages: signup, signin, reset-request, reset-consume, verify-banner
- Settings: sessions, locale, display_currency
- Workspace lifecycle: empty-state, create form (with kind + default_currency picker), switcher (multi-select Sheet on mobile)
- SHARED owner controls: shares editor, invite form
- Dashboard scaffolding (Card grid + skeletons + active-workspace pills + currency-display indicator)
- Hono RPC client `apps/web/lib/api-client.ts`
- Verifies: 1e (locale render), 2a–2f UI flows

**Plan 9 — `docker-compose-stack`** (parallel)

- `docker-compose.yml` with `db`, `migrator` (one-shot), `api`, `web`, `worker` (D-30)
- Healthchecks; `depends_on: condition: service_completed_successfully`
- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/worker/Dockerfile`, `apps/migrator/Dockerfile` (multi-stage Bun)
- Smoke test `tests/compose-up.sh`
- Verifies: 4a

**Plan 10 — `tenant-leak-ci-gate`** (parallel; integration-heavy)

- 4 tests in `tests/tenant-leak/` (D-11)
  - `no-guc-zero-rows.test.ts` — issue raw query without GUC, assert 0 rows for every user-data table
  - `job-without-tenant-errors.test.ts` — invoke `withTenantTx` from a job handler with empty `tenantIds`, assert error
  - `pg-roles-no-bypassrls.test.ts` — `SELECT rolbypassrls FROM pg_roles WHERE rolname IN ('app_role','worker_role')` — both false
  - `force-rls-on-all-tables.test.ts` — `SELECT relforcerowsecurity FROM pg_class WHERE relnamespace IN (...)` — all true for user-data tables
- Verifies: 3a, 3b, 3c, 3d

### Wave Dependency Graph

```
Wave 0: Plan 0 (blocking)
  │
  ├──▶ Wave 1: Plan 1 ║ Plan 2 ║ Plan 3 ║ Plan 4    (4 parallel)
  │       │
  │       ├──▶ Wave 2: Plan 5 ║ Plan 6 ║ Plan 7    (3 parallel; 7 depends on 5+6 contracts)
  │       │       │
  │       │       └──▶ Wave 3: Plan 8 ║ Plan 9 ║ Plan 10   (3 parallel)
```

---

## Coverage Map

Each of the 43 phase requirement IDs → addressed in which plan.

| Requirement | Plan      | Notes                                                                    |
| ----------- | --------- | ------------------------------------------------------------------------ |
| IDNT-01     | 5         | Better Auth `emailAndPassword.enabled`                                   |
| IDNT-02     | 5         | `emailVerification.sendVerificationEmail`; D-13 grace login              |
| IDNT-03     | 5         | `sendResetPassword`, `resetPasswordTokenExpiresIn=1800`                  |
| IDNT-04     | 5 + 8     | Backend session + revoke; UI in Plan 8                                   |
| IDNT-05     | 5 + 8     | locale on user table + signup form                                       |
| IDNT-06     | 5 + 8     | settings update endpoint + UI                                            |
| IDNT-07     | 5 + 8     | preferred_llm_provider on user; UI present, adapter wires Phase 5        |
| IDNT-08     | 5 + 8     | preferred_stt_provider; same                                             |
| TENT-01     | 6 + 8     | `organization.create` with kind+default_currency; create form UI         |
| TENT-02     | 6 + 8     | `organization.inviteMember`; invite form UI                              |
| TENT-03     | 6         | role enforcement (owner/member)                                          |
| TENT-04     | 6 + 7 + 8 | multi-workspace + tenant-guard middleware + switcher UI                  |
| TENT-05     | 6         | transfer-ownership + last-owner guard                                    |
| TENT-06     | 6 + 8     | leave-workspace flow + UI confirm dialog                                 |
| TENT-07     | 2 + 10    | RLS implementation + leak-CI gate                                        |
| TENT-08     | 3 + 10    | worker tenant propagation; leak gate                                     |
| TENT-09     | 6         | `allowUserToCreateOrganization: () => true`, no organizationLimit        |
| TENT-10     | 6         | kind enum + Better Auth additionalFields + PRIVATE invite-reject hook    |
| TENT-11     | 6         | default_currency additionalField + immutability hook + DB CHECK trigger  |
| TENT-12     | 6 + 7 + 8 | active_workspace_ids + middleware + multi-select UI                      |
| TENT-13     | 6         | shared_workspace_member_shares table + sum=100 invariant + audit         |
| MONY-01     | 1         | Money value object                                                       |
| MONY-02     | 6         | default_currency at workspace creation                                   |
| MONY-07     | 1 + 2     | NUMERIC types + ESLint no-float-money + numeric parser                   |
| MONY-08     | 1         | FX provider port skeleton (no Frankfurter adapter yet)                   |
| MONY-09     | 5 + 8     | display_currency on user + settings UI + dashboard indicator             |
| ENGR-01     | All       | TDD discipline; tests in same plan as code                               |
| ENGR-02     | 0         | bunfig.toml coverage threshold                                           |
| ENGR-03     | 0 + 5 + 6 | 11 BCs declared; Identity + Tenancy implemented Phase 1                  |
| ENGR-04     | 0 + 5 + 6 | per-context layers; dependency-cruiser enforces                          |
| ENGR-05     | 1         | shared kernel                                                            |
| ENGR-06     | 2 + 3     | expense_ledger table + REVOKE; ships in Phase 2 fills                    |
| ENGR-07     | 3         | audit_history + writeAudit                                               |
| ENGR-08     | 3         | outbox + dispatcher                                                      |
| ENGR-10     | 0         | dependency-cruiser config                                                |
| ENGR-11     | 1         | Clock port                                                               |
| ENGR-12     | 1         | Result via neverthrow                                                    |
| ENGR-13     | 1 + 4 + 5 | port skeletons (FX, email, crypto, STT, LLM) + in-memory fakes           |
| PLAT-02     | 9         | docker compose up brings up full stack                                   |
| PLAT-05     | 8         | next-intl + EN/PL/UK catalogs                                            |
| PLAT-06     | 8         | new lang = JSON file + i18n.config.ts entry; document in apps/web/README |
| PLAT-11     | 0         | single-region documented in `.env.example` + README                      |
| PLAT-12     | 2         | migrator role + advisory lock                                            |

**Total:** 43/43 requirement IDs mapped to plans. No gaps.

---

## Assumptions Log

> Claims requiring confirmation before becoming locked.

| #   | Claim                                                                                                                                                   | Section        | Risk if Wrong                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Zod v4 (per `npm view`) is acceptable; CLAUDE.md says v3. Pin v3 if downstream `@hono/zod-validator` peerDeps require it                                | Standard Stack | LOW — both versions supported in 2026; v4 has minor breaking changes in `.refine` chains                                                  |
| A2  | Better Auth `organization` plugin's `additionalFields` are applied to all relevant API endpoints automatically                                          | Pattern 3      | LOW — verified in Context7 docs                                                                                                           |
| A3  | `pg_advisory_lock(hashtext('budget-migrations'))` releases on connection close (Postgres default) — safe to skip explicit unlock if process crashes     | Pattern 10     | LOW — standard PG behavior; documented in PG manual                                                                                       |
| A4  | Better Auth scrypt default password hashing meets OWASP ASVS V2.4.x — fine for v1, may swap to argon2id later                                           | Security       | LOW — scrypt acceptable per ASVS                                                                                                          |
| A5  | UUID v7 generation: app-side via `nanoid` or `uuidv7` npm; Postgres 17 has `uuid_generate_v7()` natively in 17.x — verify which Postgres image we run   | Pattern 1      | MEDIUM — if Postgres image lacks v7 fn, generate app-side                                                                                 |
| A6  | `bun:test` integration tests can import Drizzle adapters and run against the dockerized `db` service via env-var DSN                                    | Validation     | LOW — bun:test is plain TS; same DSN works                                                                                                |
| A7  | drizzle-kit emits `ENABLE ROW LEVEL SECURITY` but NOT `FORCE` — so we manually append SQL post-migration                                                | Pitfall 6      | MEDIUM — validate by inspecting first generated migration; if `FORCE` is now emitted (later drizzle-kit versions), delete the manual step |
| A8  | Better Auth `organizationHooks.beforeAddMember` receives `organization.member_count` field — if not present, replace with a manual COUNT query          | Pattern 3      | LOW — easily verified at planning time; docs show hooks receive full org object                                                           |
| A9  | dependency-cruiser's `via` rule (used to ban `db.transaction` outside tx.ts) may not be reliable across all module systems — backup is the grep CI step | Pattern 5      | LOW — both layers ship; one suffices                                                                                                      |
| A10 | pg-boss + worker_role grants: worker_role has `USAGE` on `pgboss` schema. drizzle-kit doesn't manage `pgboss`; manual GRANT in migration                | Pattern 6      | MEDIUM — if missed, worker fails silently to start                                                                                        |
| A11 | `shared_kernel.outbox` has NO RLS (Pitfall 10 resolution); access via GRANT only                                                                        | Pitfall 10     | MEDIUM — diverges from "RLS on every table" mantra; document explicitly                                                                   |
| A12 | Bun + Next.js sub-package issue is workaroundable; if blocking, run web with Node                                                                       | Pitfall 7      | LOW — fallback path documented                                                                                                            |
| A13 | Email sender in Phase 1 = `StdoutEmailSender` dev adapter (writes to console + file); Resend in Phase 4                                                 | Pattern 3      | LOW — explicitly per CONTEXT.md `code_context` integration points                                                                         |

---

## Open Questions

1. **Zod v3 vs v4 pin.** CLAUDE.md says v3; npm latest is v4. Decision needed before Plan 0 finalizes `package.json`. Recommendation: pin v4 (latest) unless `@hono/zod-validator` peerDeps require v3 at install time.
   - What we know: Better Auth + Hono v4 ecosystem broadly supports both as of 2026-05-05.
   - What's unclear: whether any locked dep (drizzle-zod, react-hook-form resolver) breaks on v4.
   - Recommendation: planner runs `bun install` against a candidate package.json; resolves lock-time conflict if any.

2. **Better Auth secret rotation for sessions.** D-15 says cookie-id sessions in Postgres. Better Auth has `BETTER_AUTH_SECRET` env. Rotation procedure for v1.x — documenting "how to rotate" lands in Phase 6, but Phase 1 must NOT bake the secret into anything that prevents rotation later.
   - Recommendation: the `BETTER_AUTH_SECRET` is consulted only on session signing; rotating it invalidates all live sessions (acceptable, document in `apps/api/SECRETS.md`).

3. **Sub-second outbox dispatch cadence.** pg-boss cron minimum is ~30s. Plan uses `work()` polling at 5s. Acceptable for Phase 1; if Phase 4 Tasks needs lower latency (push notifications), revisit.
   - Recommendation: 5s polling fine for v1; document the latency budget.

4. **PRIVATE → SHARED conversion flow UX.** Deferred per CONTEXT.md, but planner needs to either ship a stub (rejecting with 501 + i18n key) or delay to Phase 2. UI-SPEC doesn't include the screens.
   - Recommendation: Phase 1 ships the data model that supports it (kind enum is mutable at the row level for owner) but no UI/API endpoint. Add a TODO comment.

5. **Email port: do we need to emit anything to the EmailSender for password-reset and verification specifically in Phase 1, or is `StdoutEmailSender` enough for Better Auth callbacks?** Better Auth requires `sendVerificationEmail` and `sendResetPassword` callbacks to be defined and not throw. Stdout writer is enough as long as integration tests can read the URL out of the captured output.
   - Recommendation: yes, stdout writer is enough. Tests parse `stdout` for the URL.

6. **`comparison.*` schema empty in Phase 1 — does drizzle-kit emit an empty `CREATE SCHEMA` if no tables in TS schema declaration?** Need to verify; otherwise hand-add.
   - Recommendation: declare a single zero-column placeholder table or hand-add `CREATE SCHEMA comparison;` in the first migration.

---

## Environment Availability

| Dependency | Required By                                        | Available (this session) | Version | Fallback                                    |
| ---------- | -------------------------------------------------- | ------------------------ | ------- | ------------------------------------------- |
| Bun        | Runtime + tests + package mgr                      | ✓                        | 1.3.12  | —                                           |
| Node       | Drizzle migrate compatibility, occasional fallback | ✓                        | 22.22.2 | —                                           |
| Docker     | Compose stack (PLAT-02)                            | ✓                        | 29.3.1  | run services individually (degraded dev UX) |
| Postgres   | Database                                           | ✗ (no client installed)  | —       | Docker service in compose                   |
| npx        | Tooling                                            | ✓                        | 10.9.7  | —                                           |

**Missing dependencies, no blocker:** Postgres CLI not in research environment; not needed for research. Will be available via Compose `db` service in execution.

---

## Project Constraints (from CLAUDE.md)

Extracted directives the planner must enforce:

- **Stack lockfile is binding.** Hono v4, Drizzle ORM, Better Auth, pg-boss, Bun, Dinero v2, big.js, neverthrow, Vercel AI SDK, next-intl, Serwist, pino, OTel, Sentry, Resend, Twelve Data / CoinGecko / metals.dev. Must not introduce: Lucia, next-pwa, Prisma, NestJS, Sequelize/TypeORM, Yup/Joi/io-ts, moment.js/dayjs, Express, Redux Toolkit, node-cron in-process, raw NodeMailer, SendGrid, iron-session, Auth0/Clerk, float for money, Knex.
- **DDD bounded contexts; ports & adapters for every external integration.** Every external dep behind a port. Phase 1 ships ports for: FX, STT, LLM, prices, email, push, crypto-keys, outbox.
- **TDD-first.** Every domain rule has a failing test before code.
- **GSD Workflow Enforcement** (CLAUDE.md): file edits route through GSD commands. Phase 1 plans must use `/gsd-execute-phase`.
- **Money:** Dinero v2 + big.js for crypto; NUMERIC(19,4) fiat / NUMERIC(38,18) crypto; float arithmetic banned by lint rule.
- **Testing:** bun:test (backend), Vitest 4 (frontend), Playwright (E2E).
- **PWA:** Serwist (Phase 6), not next-pwa.
- **Auth:** Better Auth, not Lucia/Clerk/Auth0.
- **i18n:** next-intl day 1.
- **Observability:** pino + OTel + Sentry.
- **Compliance:** GDPR + CCPA — crypto-shredding pattern day 1 (D-16).

---

## Sources

### Primary (HIGH confidence — Context7 verified, npm registry verified, official docs)

- Context7 `/better-auth/better-auth` — organization plugin, additionalFields, hooks, emailAndPassword, emailVerification, drizzleAdapter
- Context7 `/drizzle-team/drizzle-orm-docs` — pgPolicy, pgRole, pgSchema, withRLS, RLS examples
- Context7 `/timgit/pg-boss` — constructor, schedule, work, queue, schema isolation
- Context7 `/jedisct1/libsodium-doc` — crypto_secretbox_easy, crypto_aead_xchacha20poly1305_ietf, key generation
- npm registry — version pins: better-auth 1.6.9, drizzle-orm 0.45.2, drizzle-kit 0.31.10, pg-boss 12.18.2, libsodium-wrappers 0.7.6, neverthrow 8.2.0, dinero.js 2.0.2, dependency-cruiser 17.4.0, next-intl 4.4.3, hono 4.11.0, big.js 7.0.1, zod 4.4.3
- [Drizzle RLS docs](https://orm.drizzle.team/docs/rls)
- [Drizzle pgSchema docs](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Better Auth changelog](https://better-auth.com/changelog) — 1.6.0 release April 2026
- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
- [pg-boss API: scheduling](https://github.com/timgit/pg-boss/blob/master/docs/api/scheduling.md)
- [pg-boss API: workers](https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md)
- [next-intl middleware (proxy.ts)](https://next-intl.dev/docs/routing/middleware)

### Secondary (MEDIUM confidence — WebSearch verified against authoritative source)

- [Bun workspaces docs](https://bun.com/docs/pm/workspaces)
- [pg-types npm](https://www.npmjs.com/package/pg-types)
- [node-postgres NUMERIC issue #811](https://github.com/brianc/node-postgres/issues/811)
- [drizzle-orm RLS push issue #3504](https://github.com/drizzle-team/drizzle-orm/issues/3504)
- [Better Auth issue #3233 — customSession + activeOrganizationId](https://github.com/better-auth/better-auth/issues/3233)
- [Bun + Next.js sub-package issue #25014](https://github.com/oven-sh/bun/issues/25014)
- [dependency-cruiser rules-reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [PostgreSQL row security docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [libsodium-wrappers npm](https://www.npmjs.com/package/libsodium-wrappers)

### Tertiary (LOW confidence — may need re-verification at planning time)

- 2026 SaaS RLS best-practices blog posts (oneuptime, techbuddies, dev.to articles) — corroborate but not authoritative
- "Better Auth 1.6 release notes" summary from search snippets — only the changelog page is authoritative

### Project-local prior research (rich, current as of 2026-05-05)

- `.planning/research/STACK.md` — original stack research (matches CLAUDE.md lockfile)
- `.planning/research/ARCHITECTURE.md` — bounded-context map and hexagonal layering
- `.planning/research/PITFALLS.md` — RLS leakage, money float, FX gaps, comparison reidentification, GDPR vs append-only

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — every package version verified via `npm view`; Context7 confirms current API surface
- Architecture: HIGH — patterns are well-trodden (RLS + DDD + outbox); CONTEXT.md locks all the choices
- Pitfalls: HIGH — major pitfalls verified via specific GitHub issues + official docs
- Validation Architecture: HIGH — every success criterion mapped to a runnable command + plan
- Library API integration (Better Auth × Drizzle × pgPolicy × organization plugin custom fields combo): MEDIUM — combinatorial integration not explicitly demonstrated end-to-end in Context7; planner must build a small spike before fanning out parallel plans

**Research date:** 2026-05-05
**Valid until:** 2026-06-05 (30 days; stack is mature). Re-verify Better Auth and drizzle-orm versions if planning slips past this date — both are on rapid release cadences.

## RESEARCH COMPLETE
