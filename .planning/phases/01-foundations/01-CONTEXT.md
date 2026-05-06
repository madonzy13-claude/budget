# Phase 1: Foundations - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 establishes the multi-tenant TypeScript-on-Bun monorepo where any tenant-leak test fails closed, the shared kernel (`Money`, `Clock`, `Result`, `TenantId`, `UserId`) is in place, RLS-enforced tenancy is end-to-end, Better Auth ships email/password with a multi-workspace membership model, and the architectural rails (DDD bounded contexts, ports/adapters, append-only ledger primitive, `audit_history`, transactional outbox skeleton, Drizzle schema-per-context, dependency-cruiser CI rule, crypto-shredding key store, i18n, Docker Compose) make every subsequent phase trivial to plug into.

Ships Identity + Tenancy bounded contexts plus shared kernel and platform. **No** Budgeting / Accounts / Categories / Expense capture (that's Phase 2). **No** contribution-share math, share-aware reserve, share-mismatch Tasks (storage of global shares ships here per TENT-13; the math + Tasks ship in Phase 2/4).

</domain>

<decisions>
## Implementation Decisions

### Workspace & Tenancy Model

- **D-01 — Multi-workspace membership.** A user can belong to many workspaces. A workspace is either `PRIVATE` (exactly 1 member, the owner) or `SHARED` (2+ members, invite-driven). User can create unlimited PRIVATE workspaces ad-hoc and accept unlimited invites to SHARED workspaces. (Replaces the old "one personal + one family" model.) [TENT-04, TENT-09, TENT-10]
- **D-02 — Workspace `kind` is explicit.** Stored as a Postgres enum (`PRIVATE` | `SHARED`) on the `workspaces` row. Drives UI grouping ("Private" / "Shared" sections in the workspace switcher). Inviting a member to a PRIVATE workspace is rejected at the application layer — owner must convert via an explicit "convert to shared" flow (or invite at SHARED creation time). [TENT-10]
- **D-03 — No auto-creation at signup.** Signup completes with zero workspaces. The post-signup landing surface presents a "create your first workspace" empty state. Workspace creation is intentional and explicit. [TENT-09]
- **D-04 — Workspace `default_currency` immutable post-creation.** Each workspace has exactly one `default_currency` (ISO-4217) chosen at creation time. The column is enforced immutable at the application layer (and via a CHECK trigger if practical). All ledger entries in that workspace settle into this currency. [TENT-11, MONY-02]
- **D-05 — User `display_currency` is independent and global.** Stored on `users` (or Better-Auth user-extension). Drives cross-workspace dashboards / multi-select rollups via FX. Per-workspace single-workspace views always use the workspace's own `default_currency`. [MONY-09]
- **D-06 — SHARED workspace stores per-member global contribution shares (storage only in Phase 1).** Table: `shared_workspace_member_shares (workspace_id, user_id, percentage NUMERIC(5,2))` with a CHECK that all rows for a workspace sum to 100.00 (deferred-row-by-row constraint or owner-edit transactional invariant). Owner-only edit endpoint. Audit-tracked via `audit_history`. The math that consumes shares (computing owed amounts vs deposits, emitting Tasks) ships in Phase 2/4 — Phase 1 ships the schema + edit page + audit. [TENT-13]
- **D-07 — Persisted "active workspaces" filter per user.** Stored on `user_preferences` (or Better-Auth user-extension): `active_workspace_ids UUID[]`. Default = empty array on first login (UI prompts user to pick). Restored across sessions. UI = checkbox list grouped under `Private budgets` and `Shared budgets` headers. [TENT-12]

### RLS / Tenant Context

- **D-08 — Array GUC for tenant context.** Per-request middleware sets `app.tenant_ids` (Postgres GUC, comma-separated text or JSON array) to the user's currently-active workspace IDs (intersection of `active_workspace_ids` and the user's actual memberships, computed once at the auth layer). RLS predicate on every user-data table: `tenant_id = ANY(current_setting('app.tenant_ids')::uuid[])`. Single query reads can span multiple workspaces (cross-workspace dashboard). [TENT-07, TENT-12]
- **D-09 — `withTenantTx(tenantIds, fn)` is the only writable transaction primitive.** No domain code can open a `db.transaction(...)` directly — `withTenantTx` is enforced via dependency-cruiser. For writes the wrapper restricts to a single `tenant_id` (writes are always single-workspace; the array form is for reads only). For reads the wrapper accepts the array. [TENT-07, ENGR-10]
- **D-10 — Worker tenant propagation.** Every pg-boss job payload carries `tenantIds: UUID[]` (typically a single ID). The job handler MUST call `withTenantTx(payload.tenantIds, ...)` before any DB read or write. A unit test fails any job handler that opens a query outside `withTenantTx`. Worker DB role has no `BYPASSRLS` and `FORCE ROW LEVEL SECURITY` is set on all user-data tables. [TENT-08]
- **D-11 — Tenant-leak CI gate.** A dedicated test suite, run on every CI build, asserts: (a) request without `app.tenant_ids` returns zero rows from every user-data table; (b) job omitting `tenantIds` errors before any DB read; (c) `pg_roles` query confirms app and worker roles do NOT have `BYPASSRLS`; (d) `information_schema` query confirms `FORCE ROW LEVEL SECURITY` set on every user-data table. Test fails closed. [TENT-07, TENT-08, ENGR-10]

### Better Auth Integration

- **D-12 — Better Auth `organization` plugin = `workspaces`.** Each workspace is one Better-Auth organization. Owner/member maps directly to the plugin's role system. Invite flow uses the plugin's email-invite token. Domain-owned tables (`workspaces`, `workspace_members`) are derived from / kept in sync with the plugin's `organization`/`member` tables — single source of truth lives in Better-Auth tables; the domain queries them through a port. (STATE.md flagged this open — resolved here.) [TENT-01, TENT-02, TENT-03]
- **D-13 — Email verification policy: grace login.** User can sign in immediately after signup; an unverified user sees a persistent banner and CANNOT create or join workspaces until email is verified. (Avoids the worst dead-end, still gates risky actions.) Verification email TTL = 24h; resend rate-limited (1/min). [IDNT-01, IDNT-02]
- **D-14 — Password reset TTL = 30 min.** Single-use token; consumed on first valid POST. [IDNT-03]
- **D-15 — Session storage: Better-Auth default (Postgres-backed, cookie-id).** No JWT. Session table colocated in Better-Auth's schema. User-revokable from settings (lists all active sessions; revoke deletes the row). [IDNT-04]

### Crypto-Shredding Key Store

- **D-16 — App-side libsodium (sealed-box) + KEK from env, DEK per user, ciphertext columns in Postgres.** Phase 1 ships the primitive only:
  - `KEK` is provided to the container via env var `BUDGET_KEK` (32-byte base64, generated at deploy time, stored in deployment secret manager). Compose sets it; production sets it via the secret store of choice.
  - On user creation, generate a per-user 32-byte DEK; store the DEK encrypted-with-KEK in a `user_keys` table. Decryption key cache is in-process (request-scoped).
  - PII columns (`email`, `display_name`, etc.) are stored as ciphertext (`bytea`) in dedicated `_encrypted` columns; lookup-via-equality uses a deterministic hash column (`email_hash`) for `WHERE email_hash = :h`.
  - Phase 6 adds the actual destroy flow (overwrite the DEK row with NULL) — Phase 1 just wires the primitive so the schema is right and reversible.
  - **Not chosen:** pgcrypto (couples encryption to DB role permissions, makes role rotation hard), external KMS (operational overhead unjustified for v1; pluggable port preserved so KMS adapter is a v1.x swap). (STATE.md flagged this open — resolved here.) [PLAT-08, ENGR-13]

### Postgres Schema Layout

- **D-17 — Real Postgres schemas, one per bounded context.** `identity.*`, `tenancy.*`, `shared_kernel.*` (audit, outbox, user_keys), plus reserved `comparison.*` (no rows yet — created in Phase 1, populated in Phase 5). Postgres role grants on a per-schema basis: `app_role` gets `USAGE` on `identity`, `tenancy`, `shared_kernel`; `comparison_role` gets `USAGE` on `comparison`; cross-schema reads from app are explicitly forbidden via missing grants (CI gate). Drizzle's schema-per-file maps 1:1 to one Postgres schema per `src/<context>/adapters/persistence/schema.ts`. [ENGR-03, ENGR-04, CMPR-07]
- **D-18 — Migration role separation.** Migrations apply via a separate `migrator` role with DDL privileges; app and worker roles have only DML. `migrator` role uses Postgres advisory lock `pg_advisory_lock(hashtext('budget-migrations'))` to serialize multi-replica boots. Migration container is a one-shot init container in Compose; in production it's a separate Job step before app rollout. [PLAT-12]

### Shared Kernel

- **D-19 — `Money` value object.** Domain class wrapping Dinero.js v2 internally; `big.js` for crypto precision (NUMERIC(38,18) columns; Dinero handles NUMERIC(19,4) for fiat). Persistence adapter converts Money ↔ `{amount_minor BIGINT, currency CHAR(3)}` columns. Float arithmetic on money banned via custom ESLint rule (`no-float-money`) scanning AST for arithmetic operators on identifiers typed as `Money | number`. [MONY-01, MONY-07]
- **D-20 — `Clock` port + `SystemClock` adapter + `FakeClock` fixture.** Injected into all domain code; deterministic time in tests. [ENGR-11]
- **D-21 — `Result<T, E>` type: `neverthrow` library.** Standard ecosystem choice; well-typed; chainable. Domain returns `Result` for expected failures; throws only for programmer errors. [ENGR-12]
- **D-22 — `TenantId`, `UserId` are branded UUIDs.** Generated via `nanoid` for public-facing IDs is rejected — these are internal; they stay UUID v7 (time-sortable). Public-facing IDs (workspace slugs in URLs) use `nanoid(12)` separately on a `slug` column. [ENGR-05]

### Append-Only Ledger Primitive (skeleton in Phase 1)

- **D-23 — `expense_ledger` table created in Phase 1, populated in Phase 2.** Table definition includes the full MONY-06 column shape (`amount_orig`, `currency_orig`, `amount_default`, `currency_default`, `fx_rate`, `fx_rate_date`, `fx_provider`, `corrects_id`, `corrected_by_id`, `created_at`, `tenant_id`). DB-level `REVOKE UPDATE, DELETE FROM app_role` ON `expense_ledger`. RLS policy. CI test asserts the REVOKE is in place. [ENGR-06]
- **D-24 — `audit_history` table — typed-event log shape.** `(id, tenant_id, entity_type, entity_id, action, actor_user_id, occurred_at, before_jsonb, after_jsonb)`. Generic across all non-ledger entities. Triggers attach automatically when a context's adapter declares "audit-tracked"; no column-level diff (we store full row before/after). [ENGR-07]

### Transactional Outbox Skeleton

- **D-25 — Outbox + dispatcher.** Single `outbox` table (`id, tenant_id, aggregate_type, aggregate_id, event_type, payload_jsonb, created_at, dispatched_at`). Producer writes outbox rows in the same transaction as the aggregate. Dispatcher = pg-boss scheduled job (every 5s) that `SELECT FOR UPDATE SKIP LOCKED ... WHERE dispatched_at IS NULL`, fans out to in-process bus, sets `dispatched_at`. Idempotent (consumers handle duplicate dispatch via natural keys; outbox itself never double-dispatches because of `SKIP LOCKED` + `dispatched_at`). [ENGR-08]

### Repo Layout & Tooling

- **D-26 — Bun workspaces (monorepo).** No Turborepo / pnpm / Nx for v1. Top-level `package.json` declares workspaces: `apps/web` (Next.js 16), `apps/api` (Hono on Bun), `apps/worker` (pg-boss + handlers), `packages/shared-kernel`, `packages/identity`, `packages/tenancy` (each context = one package). Bun's native workspace handling is sufficient for v1 scale; revisit at >10 packages. [ENGR-04]
- **D-27 — Dependency-cruiser CI rule.** Single `.dependency-cruiser.cjs` with rules: (a) `domain/**` cannot import `drizzle-orm`, `hono`, `ai`, `@ai-sdk/*`, or any sibling package's `adapters/`; (b) only `contracts/**` is cross-package importable; (c) `withTenantTx` is the only allowed transaction entry point. CI fails on violation. [ENGR-10]
- **D-28 — Tests: bun:test (backend + shared) + Vitest 4 (apps/web) + Playwright (E2E).** Backend integration tests use a shared Compose `test-db` service with per-test schema reset (truncate-and-reseed), not testcontainers (faster on CI; testcontainers is a v1.x option if isolation pain emerges). [ENGR-01, ENGR-02]
- **D-29 — i18n catalogs.** `next-intl` for frontend; backend translations only for transactional emails (React Email + locale-keyed templates). Catalogs: `apps/web/messages/{en,pl,uk}.json` and `apps/api/locales/{en,pl,uk}/email.ftl` (or JSON if Fluent feels heavy). PLAT-06 satisfied: adding a language = adding a JSON file + listing it in `i18n.config.ts`. No code changes. [PLAT-05, PLAT-06]
- **D-30 — Docker Compose stack.** Services: `db` (Postgres 17), `migrator` (one-shot, depends on `db` healthy), `api` (Hono + Bun, depends on `migrator` exit-0), `web` (Next.js 16 dev server in dev / production build behind Bun in prod), `worker` (pg-boss + handlers, depends on `migrator`). Single `docker compose up` brings up the whole stack locally. [PLAT-02]

### Claude's Discretion

- ESLint flat config (typescript-eslint strict-type-checked + jsx-a11y for web)
- Prettier 3 default config
- Husky + lint-staged pre-commit (block on failing types + tests-of-changed-files)
- Environment-variable validation: `zod` schema at boot; fail-fast on missing vars
- pg-boss schema named `jobs` (default) — kept out of bounded-context schemas
- Nanoid alphabet & length for public slugs
- Specific Better-Auth plugin set (organization + admin + email-otp resend) — implementer decides exact version

### Changelog (revision pass — 2026-05-06)

These entries DOCUMENT carve-outs / extensions to the original D-NN decisions surfaced during Phase 1 plan-checker review. The original D-09 / D-27 / D-28 text above is preserved as written; this changelog records the additional primitives and conventions that downstream plans rely on. Carve-outs are minimal and bounded.

- **CHG-2026-05-06-A — Extends D-09 (transaction primitives).** The transaction primitive set grows from one (`withTenantTx`) to FIVE, all defined in `packages/platform/src/db/tx.ts` (the SOLE call site of `.transaction(` repo-wide; PC-26 reconciled the canonical location to `packages/platform/src/db/tx.ts` — `tx.ts` is platform infrastructure, `db` is a leaf concern):
  1. `withTenantTx(tenantId, userId, fn)` — single-tenant write; sets BOTH `app.tenant_ids` AND `app.current_user_id` GUCs in the same SET LOCAL pair (extended signature, was `(tenantId, fn)`).
  2. `withTenantTxRead(tenantIds, userId, fn)` — multi-tenant read; same dual-GUC behavior.
  3. `withUserContext(userId, fn)` — USER-scoped tx (sets ONLY `app.current_user_id`). Required for user-scoped tables (`shared_kernel.user_keys`, `identity.sessions`, `identity.accounts`, `identity.user_preferences`). Never use for tenant-scoped data. (Resolves the conflict where Better Auth user-creation hooks and DEK persistence touch tables that have no `tenant_id`.)
  4. `withInfraTx(fn)` — INFRASTRUCTURE-ONLY carve-out (sets NEITHER GUC). Bounded use cases: outbox dispatcher, migration runner. NEVER call from tenant-scoped code paths.
  5. `withBootstrapUserContext(userId, fn)` — BOOTSTRAP carve-out (PC-27). Identical mechanics to `withUserContext` (BEGIN + `SET LOCAL app.current_user_id` + body + COMMIT) but documented as the SOLE legitimate primitive used by `apps/api/src/middleware/tenant-guard.ts` to query `tenancy.workspace_members` BEFORE `app.tenant_ids` is set. Honors the `workspace_members_self` RLS policy keyed off `app.current_user_id` (Plan 06). Defined here so tenant-guard does not need to call raw `appPool().connect()`, keeping the PC-03 grep gate clean.

  Documented invariant — CI grep gate enforces single non-test call site for `.transaction(` (PC-26: file-level `--exclude=tx.ts`; PC-28: also `--exclude-dir=test`). Underlying RLS rule from D-09 (no domain code opens `db.transaction(...)` directly) holds; the wrappers above replace what was previously one. [PC-03, PC-04, PC-07, PC-26, PC-27, PC-28]

- **CHG-2026-05-06-B — Extends D-27 (cross-package imports).** D-27 says "only `contracts/**` is cross-package importable" — extended with the **factory surface convention**: every `packages/*/src/index.ts` re-exports a documented factory (`createIdentityModule`, `createTenancyModule`, `createPlatformModule`, etc.) defined under `packages/<ctx>/src/contracts/factory.ts`. Apps consume packages exclusively via the factory output (Better Auth instance, organization plugin, repos, etc.). The dep-cruiser rule `apps-only-public-package-surface` (Plan 00) enforces apps may import from `packages/*/src/index.ts` AND `packages/*/src/contracts/**`, but is BANNED from `packages/*/src/{domain,application,adapters,ports}/**`. The original D-27 contracts/** rule continues to govern cross-package imports between sibling packages. [PC-02, PC-15]

- **CHG-2026-05-06-C — Refines D-28 (test infrastructure).** D-28's note "testcontainers is a v1.x option if isolation pain emerges" is exercised earlier than expected: Wave-1 + Wave-2 integration tests need a real DB at unit-test time, before the Wave-3 compose stack lands. Resolution: `packages/db/test/testcontainer.ts` exposes a `startTestcontainer()` helper (used in `beforeAll`) that boots a Postgres 17 container, creates the three NOBYPASSRLS roles and five schemas, runs drizzle migrations + post-migration.sql, and sets `DATABASE_URL_*` env vars. PC-28 adds `--exclude-dir=test` to the grep gates so testcontainer.ts is not flagged. PC-29: `bunx drizzle-kit generate` is owned by Plan 06's close-out task (the last Wave-2 plan) — earlier waves declare schema files but generation runs after all Phase-1 schemas exist. The testcontainer reads the generated migration files at TEST TIME (during `beforeAll`), so the order is: Plan 06 generates → Wave-2 + later integration tests run. Plan 09's compose stack remains the deployment artifact (Wave 3); it is no longer a Wave-2 test prerequisite. The "shared Compose test-db" hint in D-28 still applies for end-to-end smoke tests; testcontainers handles unit/integration tests within a single Bun process. [PC-06, PC-28, PC-29]

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Inputs

- `CLAUDE.md` — Tech stack lockfile (Hono v4, Drizzle, Better Auth, Bun, pg-boss, neverthrow, Dinero v2, etc.). HIGH-confidence picks must not be revisited unless explicitly unblocked.
- `.planning/PROJECT.md` — Project charter, core value, constraints.
- `.planning/REQUIREMENTS.md` §IDNT, §TENT, §MONY (Phase 1 portion), §PLAT, §ENGR — all 43 Phase 1 requirements. **Re-read after Phase 1 discuss-phase: now includes TENT-09..13 + MONY-09**.
- `.planning/ROADMAP.md` Phase 1 — goal, success criteria, dependencies. **Re-read: success criterion #2 was rewritten in this discuss-phase**.
- `.planning/STATE.md` §Decisions, §Blockers/Concerns — initial open items (key store, organization mechanic) resolved here as D-12 and D-16.

### Research & Decisions

- `.planning/research/STACK.md` (if present) — original stack research.
- `.planning/research/ARCHITECTURE.md` (if present) — bounded-context map and architectural patterns.
- `.planning/research/PITFALLS.md` (if present) — RLS + worker leakage patterns, GDPR + ledger reconciliation, FX weekend gaps.

### External Library Docs (resolve at planning time, not now)

- Better Auth `organization` plugin — invite flow, role enforcement (D-12).
- Drizzle ORM `pgPolicy()` + `pgSchema()` — RLS DSL + schema-per-file (D-08, D-17).
- pg-boss `SKIP LOCKED` semantics (D-25).
- libsodium `crypto_secretbox` / `crypto_aead_xchacha20poly1305_ietf` (D-16).

(No project-local code yet — repo is empty except `CLAUDE.md` and `.planning/`. No prior CONTEXT.md or DECISIONS-INDEX.md exists.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

(None — repo is empty. Phase 1 is greenfield.)

### Established Patterns

- `CLAUDE.md` is the sole binding document on tech choices; it explicitly forbids Lucia, next-pwa, Prisma, NestJS, etc. — planner must not reintroduce any of these.
- `.planning/PROJECT.md` Engineering principle: "TDD-first; DDD bounded contexts; ports & adapters for every external integration" — every new external dep must land behind a port.

### Integration Points

- Phase 1 is the *first* phase, so its integration surface is downward (later phases plug in). Planner must explicitly publish:
  - `withTenantTx` primitive signature
  - `Money`, `Clock`, `Result<T, E>`, `TenantId`, `UserId` types
  - `audit_history` write helper
  - `outbox` write helper + dispatcher entry-point
  - Better-Auth integration shape (port to query org membership)
  - Crypto-shredding port (`encryptForUser(userId, plaintext)` / `decryptForUser(userId, ciphertext)`)
  - `FxProvider` port (skeleton only — Phase 2 adds Frankfurter adapter)
  - `EmailSender` port (skeleton only — Phase 4 adds Resend adapter; Phase 1 wires it for Better-Auth verify/reset emails using a no-op-then-stdout dev adapter)

</code_context>

<specifics>
## Specific Ideas

- **User-given UI mental model:** "checkbox list, default = private only, restorable across sessions, multiple workspaces selected at once". Implementation in D-07 + D-08 mirrors this exactly. Cross-workspace dashboard is a real product surface — RLS needs to support it without app-layer fan-out.
- **User-given financial mechanic on shared workspaces** ("Alice 20% / Bob 80% of 10K = Alice owes 2K, Bob owes 8K; if Alice deposits 3K, system either tells Bob to top up or refunds Alice 1K"): captured as TENT-13 (storage, Phase 1) + BDGT-08 (per-category override, Phase 2) + EXPN-13 (deposit FX-preview, Phase 2) + RSRV-08 (share-aware reserve, Phase 3) + TASK-07 / TASK-08 (mismatch Tasks, Phase 4). REQUIREMENTS.md and ROADMAP.md were updated mid-discussion to bake these in.
- **Currency display rule** ("each workspace shown in its own currency; cross-workspace totals shown in user's display-currency setting"): captured as MONY-09 (Phase 1) and reinforces that Insights (Phase 4) must do per-workspace + cross-workspace rollups.
- User explicitly does NOT want auto-created workspace at signup — the empty state is intentional.

</specifics>

<deferred>
## Deferred Ideas

(All deferred items below were promoted to formal v1 requirements during this discuss-phase and are tracked in `REQUIREMENTS.md` + `ROADMAP.md`. Listed here as a reading guide, not a TODO.)

- **BDGT-08** — per-category contribution share overrides (Phase 2, depends on Categories).
- **EXPN-13** — FX-preview shared-wallet deposit (Phase 2, depends on FX adapter + ledger).
- **RSRV-08** — share-aware reserve accounting (Phase 3, depends on Reserve mechanic).
- **TASK-07 / TASK-08** — contribution-mismatch Task generators (Phase 4, deterministic, depends on Phase 2 share math + Phase 3 reserve).
- **PRIVATE → SHARED conversion flow** — implementation detail of TENT-10. Decide UX in Phase 1 plan; mechanic = update `kind` enum + open invite flow + initialize shares table.
- **Workspace deletion / archive** — not in v1 scope per REQUIREMENTS.md; accounts can be archived (ACCT-03) but workspaces cannot. Note for v1.x.
- **Cross-workspace transfer** (move money between two SHARED workspaces a user belongs to) — explicitly NOT in v1; ledger entries are workspace-local. Note for v2+.

</deferred>

---

*Phase: 1-Foundations*
*Context gathered: 2026-05-05*
*Revision pass: 2026-05-06 (changelog appended to <decisions>)*
*Pass-2 cleanup: 2026-05-06 — CHG-2026-05-06-A path corrected to `packages/platform/src/db/tx.ts` per PC-26; CHG-2026-05-06-A grew to FIVE primitives (added withBootstrapUserContext per PC-27); CHG-2026-05-06-C now references PC-28 grep test exclude + PC-29 generate-migration ownership in Plan 06.*
</content>
