# Research Summary

**Project:** Budget — multi-tenant SaaS family budgeting & wealth tracker
**Stack constraints (locked):** TypeScript on Bun, Next.js 16 (App Router), Postgres + RLS, DDD bounded contexts, hexagonal per context, TDD non-negotiable
**Researched:** 2026-05-05
**Inputs:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md

---

## Executive Summary

Budget is a **family-native, multi-currency-native, opinionated budgeting + wealth-tracking SaaS** — a fourth archetype distinct from behavioral budgeters (YNAB), aggregators (Monarch/Copilot), and self-hosted (Firefly/Actual). The reserve+cushion+anonymous-comparison combo has no direct competitor; multi-currency at every Money input plus EU-language coverage (EN/PL/UK) is a defensible moat for EU/multi-jurisdiction families.

The recommended build is a **modular monolith** in TypeScript on Bun: one HTTP process (Hono v4 + Drizzle + Better Auth) and one worker process (pg-boss) over a single Postgres with RLS-enforced tenancy. Eleven bounded contexts (Identity, Tenancy, Budgeting, Reserves, Cushion, Investments, Tasks, Insights, Comparison, Notifications, Onboarding) communicate via a transactional outbox + in-process event bus for async fan-out, and via published synchronous APIs for queries. Domain layers are pure TypeScript with `Money` value objects (Dinero.js v2; big.js for crypto), Temporal for dates, and **no ORM/Hono/AI-SDK imports** — adapters live behind ports.

The **dominant risk surface is correctness, not performance**: float-for-money, FX conversion at the wrong time, RLS bypass on pooled connections or background jobs, GDPR right-to-erasure colliding with append-only ledger, and re-identification of "anonymous" comparison cohorts. Each is a CRITICAL pitfall with a concrete defense (Money value object + lint rule, ledger row stores `(amount, currency, fx_rate, fx_date, fx_provider)`, `SET LOCAL` inside a tx with no `BYPASSRLS` workers, crypto-shredding for PII columns, k-anonymity floor with closed taxonomy). These defenses must land in Phase 1 — retrofitting is rewrite-class.

---

## Key Findings — Stack

| Layer | Pick | Rationale (one line) |
|---|---|---|
| Runtime | **Bun 1.2.x** | Locked; native TS, fast install/boot |
| HTTP | **Hono v4.12+** | Bun-fast, runtime-agnostic (Node fallback if needed), built-in Zod-OpenAPI + RPC client |
| FE↔BE wire | **Hono RPC** (NOT tRPC) | End-to-end TS without an extra protocol layer over the same routes that serve OpenAPI |
| ORM | **Drizzle** (NOT Prisma) | First-class RLS via `pgPolicy()`; Prisma has no native RLS — disqualifying for this product |
| Auth | **Better Auth** (NOT Lucia) | Lucia deprecated March 2025; BA has Drizzle adapter + `organization` plugin = family workspace |
| Validation | **Zod v3** | One schema language across Hono, Drizzle, BA, AI SDK |
| Money | **Dinero.js v2** + **big.js** (crypto) | Dinero IS the `Money(amount, currency)` value object; big.js for 8–18 decimal crypto precision |
| Date/time | **Temporal API** via `temporal-polyfill` | Stage 4 March 2026; right primitive for FX-as-of-date and TZ-correct month boundaries |
| Jobs | **pg-boss v10** | Postgres-native exactly-once via `SKIP LOCKED`; transactional job creation; no Redis at v1 |
| LLM | **Vercel AI SDK Core** + Anthropic + Groq | Provider abstraction matches ports/adapters; `generateObject` for structured wizard output |
| FX | **Frankfurter** (locked) + cache table + fallback (open.er-api) | Free, ECB-backed; weekend semantics + crypto-pair gap require fallback |
| Stocks | **Twelve Data** (free 800/day) | Single API for stocks+ETFs+forex+crypto; better free tier than Alpha Vantage |
| Crypto | **CoinGecko** | 14k+ assets; SaaS standard for non-trading valuation |
| Gold | **metals.dev** primary, GoldAPI.io fallback | Cleaner DX, historical endpoint |
| i18n | **next-intl** | App Router + RSC; JSON catalogs, no codegen |
| PWA | **Serwist (`@serwist/next`)** (NOT next-pwa, unmaintained) | Active 2026 successor; App Router-native |
| Email | **Resend** (v1) | Best DX; React Email; reassess at >50k/mo |
| Push | **`web-push` + manual VAPID** | Standard 2026 pattern; no vendor lock-in |
| Test (BE) | **bun:test** | Native TS, 3-10x faster than Vitest |
| Test (FE) | **Vitest 4 + happy-dom + RTL** | bun:test still has gaps for RTL |
| E2E | **Playwright** | PWA install + push flows |
| Logging | **pino 9** | Fastest Node logger, JSON, OTel-correlated |
| Tracing | **OpenTelemetry SDK** | Vendor-neutral exporter |
| Errors | **Sentry v8+** | OTel-native, traces correlate |

**Avoid:** Lucia (deprecated), next-pwa (unmaintained), Prisma for RLS-heavy multi-tenant, NestJS, Sequelize/TypeORM, moment.js, dayjs, SendGrid, iron-session, float for money, GraphQL/Apollo for internal API.

---

## Key Findings — Features

### Table stakes (v1 must-have)
- Account CRUD (cash, checking, savings, credit, loan, investment) + manual balance + archive
- Manual expense/income/transfer with audit-tracked edit; search/filter; **recurring transactions**; split transactions; tags; CSV import/export
- User-defined categories per scope; one-level groups; bulk re-categorize (P2); category archival
- Monthly normal limit + cushion limit per category; budget vs actual viz; templates
- Net worth + trend; spending by category + trend; income vs expense; monthly digest
- Family invite + roles (owner/member); per-member personal+shared scopes; "who paid" attribution; visible audit trail
- Email/password registration + verification + reset; session revoke; **RLS tenant isolation**; encryption; **GDPR export + delete**; CCPA opt-out
- i18n EN/PL/UK day-one; multi-currency input on every Money field; FX historical-rate-at-txn-date

### Differentiators (the moat)
- **Reserve mechanism** — logical balance vs real external account, suggested-transfer Tasks. **Novel.**
- **Dual budget per category (normal + cushion)** — austerity scenario pre-modeled. **Novel.**
- **Cushion adequacy across multi-asset holdings** — values cash/bonds/gold in default currency
- **Tasks queue (active, not passive alerts)** — dismiss/snooze/done; deterministic generators, never LLM
- **Multi-currency-native + family-native combined** — no competitor has both
- **Anonymous family comparison opt-in, privacy-pipeline-first**
- **Conversational onboarding (text + voice)** with LLM bounded to structured Zod-validated output
- **Pluggable provider per asset class** for investments
- **PWA-first installable** — closes 95% of native-mobile gap
- **Append-only ledger + visible audit history**

### Anti-features (deferred or rejected)
Bank API (Plaid/Open Banking) → v2+ pluggable; receipt OCR / email forwarding → out; native mobile → out; tax filing/crypto custody/trade execution → out (regulatory); generic chat-with-data LLM → out; ML auto-categorization → rule-based v1.x only; real-time collaboration → eventual + push; goal feature beyond cushion → Reserve covers it.

### v1.x / v2+ defer
- v1.x: 2FA TOTP, bulk re-categorize, rule-based auto-categorization, tags, "who paid", monthly digest, more price providers, bond yield/coupon
- v2+: Bank API, native mobile, OCR, ML categorization, custom budget periods, kid accounts, projections, public API/webhooks

---

## Key Findings — Architecture

### Shape: modular monolith, ready to split
- Single Bun HTTP process + single Bun worker (pg-boss) + single Postgres + Redis (sessions/idempotency/rate-limit)
- 11 BCs under `src/contexts/<name>/{domain, application, ports, adapters, contracts}`; only `contracts/` is cross-context-importable
- Tiny `shared-kernel/` (Money, Currency, TenantId, UserId, Clock, Result) — no business logic
- `platform/` for cross-cutting infra (db pool, tx helper, RLS, outbox, event bus, i18n, logging, tracing, feature flags)
- Microservices NOT v1 — boundaries are real, splittable later at 50k+ families

### Multi-tenancy (CRITICAL contract)
- **Postgres + tenant_id + RLS** (single DB, not schema-per-tenant)
- Per-request `withTenantTx(tenantId, fn)` does `BEGIN; SET LOCAL app.tenant_id = $1` — never `SET` (pool-leak)
- App role has **no `BYPASSRLS`**; all tables `FORCE ROW LEVEL SECURITY`; migrations use separate role
- Worker jobs receive `tenantId` arg, set GUC same way HTTP does
- UUID v7 aggregate IDs (not composite); repo asserts `row.tenant_id === tenantId` belt-and-braces

### Ledger + audit + projections
- **Append-only `expense_ledger`** stores `(amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider)` + corrections via new rows linked by `corrects_id`/`corrected_by_id`
- DB-level guard: `REVOKE UPDATE, DELETE` on ledger from app role
- **Generic `audit_history` table** for non-ledger entities (entity_type, entity_id, version, actor_id, diff JSONB, snapshot JSONB) — visible in UI
- **Projections** (`proj_spending_by_category_month` etc.) updated in same tx as ledger writes; reconciliation cron + replay-from-ledger command
- **Transactional outbox** committed in same tx as domain change; worker dispatches to in-process bus; pattern survives later move to Kafka/NATS

### Communication
- **Sync (published API)**: Identity→Tenancy, Onboarding→Budgeting (seed), any→Identity (read-only)
- **Async (events)**: Tenancy→all, Budgeting→Reserve/Insights, Reserve/Cushion/Investments→Tasks, Tasks→Notifications, Comparison← (one-way through anonymizer ACL)
- **Three mandatory ACLs**: Comparison anonymizer, Onboarding→Budgeting (LLM JSON → CategoryDraft), External price/FX → domain value objects

### LLM placement (non-negotiable)
- LLM is **adapter inside Onboarding only**; never imported by domain
- Structured outputs only (Zod); ACL re-validates every field
- Tasks generation is **deterministic policy code**, never LLM
- Per-user provider selection (Claude Haiku / Groq) by factory; per-user daily token cap

### Build order (dependency-driven)
- **Phase A (sequential):** Platform + Shared Kernel + Identity + Tenancy
- **Phase B (sequential, blocking):** Budgeting (with FX adapter)
- **Phase C (parallel):** Reserve | Investments | Cushion
- **Phase D (parallel after C):** Tasks | Insights | Notifications
- **Phase E (parallel):** Onboarding | Comparison
- **Phase F (sequential):** PWA polish, exports, GDPR/CCPA tooling, deploy hardening

---

## Cross-Dimension Tensions (must reconcile in roadmap)

| # | Tension | Resolution |
|---|---|---|
| 1 | **RLS + pg-boss handlers** — workers run outside HTTP middleware; tempting "BYPASSRLS worker role" guts isolation | Worker role = standard role, no BYPASSRLS. Every job carries `tenantId` and uses same `withTenantTx`. CI test asserts a job omitting `tenantId` fails fast. |
| 2 | **Append-only ledger + GDPR Article 17** — "never delete" vs "delete in 30 days" | Crypto-shredding: PII fields (notes, voice, custom labels, attachments) live in encrypted columns with per-user DEK; "forget" = destroy DEK; ledger amount/date rows survive. Schema separates PII columns from ledger from day 1. |
| 3 | **Multi-tenant + comparison crosses tenant boundary** | Dedicated "anonymizer" worker role with narrower RLS policies that read across tenants only via the anonymizing event handler ACL; output goes to `comparison.*` schema with no per-row `tenant_id`. k-anonymity floor enforced at query layer. |
| 4 | **PWA offline writes + idempotency + transactional outbox** | `Idempotency-Key` header on every mutating endpoint; Redis cache `(tenantId, key)` 24h TTL; replay returns cached response. Outbox dispatcher idempotent via `dispatched_at`. |
| 5 | **Family member leaves + append-only + personal-vs-shared** | Personal data keyed to *personal workspace tenant_id*, not family tenant_id. `leaveFamily` is a domain state machine: validates not-last-owner, transfers ownership, invalidates sessions ≤15 min, audit row. Re-invite = explicit rejoin. |
| 6 | **`generateObject` LLM + domain invariants** — schema can pass while invariants fail | Onboarding ACL: Zod validates *shape*; domain factory `CategoryDraft.create` enforces invariants and returns `Result<CategoryDraft, ValidationError>`. LLM never directly creates rows — wizard's domain state machine does. |
| 7 | **FX historical rate + back-dated expenses + Frankfurter weekend** | Local `fx_rates` cache; on miss fetch+persist; if fail, use most-recent-prior + flag `fx_rate_stale=true`. Crypto needs separate provider (CoinGecko). |
| 8 | **Hono RPC + Next.js RSC / Server Actions** | `hc<typeof app>` works in RSC + Server Actions + client. Same Hono routes serve OpenAPI for future external/mobile. No tRPC. |
| 9 | **bun:test (BE) + Vitest (FE) duality** | Accept for v1 (bun:test 3–10x faster on BE; Vitest needed for RTL). Track bun:test RTL support. Domain tests are pure → both runners run them fast. |
| 10 | **TDD/DDD + ORM-generated types → anemic models** | CI rule (dependency-cruiser): `domain/` cannot import `drizzle-orm` or `adapters/`. Drizzle types live in `adapters/persistence/`. Mapper in repository. Domain factories return `Result<T, E>`. |
| 11 | **Cushion target = N × cushion-budget** — budget changes silently shift target | Snapshot cushion-budget at config time; user explicitly re-baselines; UI shows "target set on YYYY-MM-DD". |
| 12 | **i18n + LLM + STT** — different language coverage per layer | Per-user UI locale + per-user voice locale (separate setting); LLM prompt includes locale; rejected mismatches require explicit fallback. |

---

## Confirmed Tech Stack Picks

1. **Bun 1.2.x** — runtime + package manager + backend test runner; constraint-locked.
2. **Next.js 16 (App Router)** — frontend; constraint-locked; works with Hono RPC + Serwist.
3. **Hono v4.12+** — backend HTTP; runtime-agnostic, RPC + OpenAPI from same routes.
4. **Drizzle ORM** — Postgres access; first-class `pgPolicy()` RLS, no codegen, SQL-shaped.
5. **Better Auth** — self-hosted auth; Lucia successor; Drizzle + `organization` plugin = family workspace.
6. **Postgres + RLS + tenant_id** — multi-tenancy primitive; `FORCE`, `SET LOCAL`, no `BYPASSRLS`.
7. **Zod v3** — universal schema/validation across stack.
8. **Dinero.js v2 (+ big.js for crypto)** — Money value object.
9. **Temporal API via temporal-polyfill** — TZ-aware finance dates.
10. **pg-boss v10** — jobs; exactly-once; transactional job creation.
11. **Vercel AI SDK Core + @ai-sdk/anthropic + @ai-sdk/groq** — pluggable LLM.
12. **Frankfurter** (+ open.er-api fallback) — FX; cache table + stale flag.
13. **Twelve Data + CoinGecko + metals.dev** — investment price feeds, each behind `PriceProvider` port.
14. **next-intl** — i18n; new languages without code changes.
15. **Serwist (`@serwist/next`)** — PWA service worker.
16. **`web-push` + manual VAPID** — push notifications.
17. **Resend** — email v1 (reassess at >50k/mo).
18. **bun:test (BE) + Vitest 4 + happy-dom + RTL (FE) + Playwright (E2E)**.
19. **pino 9 + OpenTelemetry + Sentry v8** — observability.
20. **Docker + Docker Compose** — deployment; multi-arch buildx.

---

## Top 10 Pitfalls

1. **Float / `number` for money (CRITICAL)** — `Money` value object backed by Dinero + bigint/decimal; `NUMERIC(19,4)` columns; lint rule bans arithmetic on `Money` types.
2. **FX conversion at wrong time (CRITICAL)** — ledger stores `(amount_orig, currency_orig, amount_default, currency_default, fx_rate, fx_rate_date, fx_provider)`; convert at entry using rate-as-of-txn-date; never recompute analytics from current rates.
3. **RLS bypass via forgotten session var or pooled connection (CRITICAL)** — every tx uses `withTenantTx`/`SET LOCAL` inside `BEGIN`; app+worker roles have no `BYPASSRLS`; `FORCE ROW LEVEL SECURITY`; CI test asserts unset GUC = zero rows.
4. **Anonymous comparison re-identifies users (CRITICAL)** — k-anonymity floor (k≥20, configurable); closed system-category taxonomy; quasi-identifier generalization; suppression for small cohorts; explicit revocable consent.
5. **GDPR right-to-erasure vs append-only ledger (CRITICAL)** — crypto-shredding: PII columns encrypted with per-user DEK; "forget" destroys DEK; ledger amount/date rows survive immutably; PII-vs-ledger split from day 1.
6. **Tenant context leak across requests / connections (CRITICAL)** — `AsyncLocalStorage` or explicit context arg; no module-level mutable singleton; pool checkout opens tx + sets `LOCAL` GUC + releases on tx end; parallel-tenant stress test in CI.
7. **End-of-month reserve sweep duplicates Tasks on retry (HIGH)** — period-scoped idempotency key (`sweep_run(family_id, period, kind)` UNIQUE); sweep produces a projection row that's source of truth; deterministic `Clock` port.
8. **Append-only ledger accidentally `UPDATE`d (HIGH)** — DB role-level `REVOKE UPDATE, DELETE` on ledger from app role; edits = new correction row; mistakes fail at SQL level.
9. **Prompt injection via expense note / category name into LLM (HIGH)** — structured output only; no tools with side effects; tagged delimiters in system prompt; cross-user content isolation; output validation against domain invariants.
10. **STT amount mis-transcription with no confirmation step (HIGH)** — always show structured preview before save; two-stage pipeline (STT → deterministic locale-aware amount extractor → LLM only for category/note); confidence threshold gates form fallback; phonetic fixtures for EN/PL/UK.

**Honorable mentions for roadmap DoDs:** ORM types leaking into domain, family-leave state machine, stale prices without `asOf`, projection drift from ledger, missing tenant_id in indexes, service worker stale assets after deploy, migration race on container boot, email in dev hits real users, cross-border data transfer / region selection.

---

## Architectural Decisions Ratified by Research

| # | Decision (from PROJECT.md) | Verdict |
|---|---|---|
| 1 | Postgres + tenant_id + RLS | **Confirmed.** Drizzle's `pgPolicy()` makes this correct at v1 scale; schema-per-tenant only justified at 50k+. |
| 2 | Append-only ledger + versioned audit | **Confirmed.** Projections are caches rebuildable from ledger; crypto-shredding handles GDPR. |
| 3 | Multi-tenant SaaS from v1 | **Confirmed and emphasized.** Tenant_id NOT NULL + RLS on every user-data table from migration #001. |
| 4 | `Money(amount, currency)` everywhere | **Confirmed.** Dinero.js v2 implementation; lint rule bans `number` arithmetic. |
| 5 | Frankfurter FX with provider abstraction | **Confirmed with caveats.** Cache + weekend semantics + crypto-pair gap require fallback + stale flag. |
| 6 | Pluggable provider interfaces (STT, LLM, FX, prices, email, push) | **Confirmed.** Each port has in-memory fake. |
| 7 | Self-hosted auth (Lucia/BetterAuth) | **Confirmed — Better Auth.** Lucia deprecated. |
| 8 | Conversational Q&A onboarding | **Confirmed and bounded.** LLM in Onboarding adapter only; `generateObject` + Zod; ACL re-validates. |
| 9 | Anonymous comparison built in v1 | **Confirmed but gated.** Privacy pipeline + DPIA must precede launch. Privacy-review gate. |
| 10 | TDD + DDD non-negotiables; bounded contexts as boundary | **Confirmed.** 11-context list correct and stable. CI rule enforced. |
| 11 | Reserve = logical balance | **Confirmed.** UI must label "Logical reserve · cash sits in your bank · we suggest moves". |
| 12 | LLM bounded to onboarding + structured Task gen | **Confirmed AND tightened.** v1 LLM = onboarding only. Tasks gen is deterministic. |

### New decisions surfaced by research

| # | Decision | Rationale |
|---|---|---|
| A | Hono v4 (not Elysia/NestJS/raw Bun.serve) | Runtime-agnostic, RPC + OpenAPI built-in, hexagonal-friendly |
| B | Hono RPC (not tRPC) | Same TS without extra protocol; works in RSC + Server Actions |
| C | Drizzle (not Prisma) | First-class RLS; Prisma's RLS gap is disqualifying |
| D | pg-boss (not BullMQ/Inngest/node-cron) | Postgres-native exactly-once; transactional job creation |
| E | Temporal via polyfill (date-fns v4 fallback OK) | Right primitive for FX-as-of-date and TZ-correct months |
| F | Modular monolith with two processes (API + worker) | One product, small team; BCs are splittable later |
| G | Transactional outbox + in-process bus | Atomic domain change + event publication; idempotent dispatcher |
| H | UUID v7 aggregate IDs (not composite) | RLS enforces tenant boundary at row level |
| I | Schema-per-context inside one Postgres | Logical isolation; cross-BC queries via published API |
| J | bun:test (BE) + Vitest (FE) — accept duality v1 | Track bun:test RTL support |
| K | Crypto-shredding for PII (per-user DEK in key store) | Reconciles append-only ledger with GDPR Article 17 |
| L | k-anonymity floor (k≥20, configurable) | Hard gate before any comparison number is served |
| M | `Idempotency-Key` header on all mutating endpoints | Required for PWA offline→reconnect and sweep retries |
| N | `Result<T, E>` for expected domain failures | Throw only for programmer errors |
| O | `Clock` port injected into all domain code | TDD requires deterministic time |

---

## Open Questions to Resolve in Roadmap

1. **Identity ↔ Tenancy mechanics** — does Better Auth `organization` plugin's `members` *become* `family_members`, or sit alongside? Pick in Phase A.
2. **Crypto-shredding key storage** — Postgres `pgcrypto` + KEK env var, or external KMS (Vault/AWS KMS/GCP KMS)? Decide before migration #001.
3. **Initial k value** — start k=20, but tenant-policy-configurable. Confirm with first DPIA.
4. **EU vs US hosting region selection at signup** — single-region v1 or region-per-family? Affects deployment architecture.
5. **Bond yield/coupon depth** — v1 manual snapshots; when does structured manual + accrual graduate?
6. **Comparison cohort exact bucketing** — region (country level?), household size (1, 2, 3-4, 5+ confirmed), currency (top-5 + other confirmed).
7. **LLM cost guardrails** — per-user daily token cap value; per-tenant budget; behavior at cap (block/degrade/notify).
8. **Voice STT default** — Browser Web Speech (limits on iOS) auto-fallback to Groq, or always-Groq.
9. **Push permission UX trigger** — empty workspace → first meaningful Task may take days. Define trigger (first expense? wizard complete?).
10. **Real-estate inclusion in net worth** — default exclude with opt-in + disclaimer; legal review timing.
11. **Cushion target re-baselining cadence** — manual only, or annual prompt? UX flow open.
12. **Read-replica timing** — research suggests 500–5k families. Cutover plan and projection-write-replica-aware patterns.

---

## Confidence Assessment

| Dimension | Confidence | Notes |
|---|---|---|
| Stack | **HIGH** | All picks verified vs current docs and 2026 ecosystem signals. MEDIUM-HIGH for Temporal (Stage 4 March 2026 is recent) and Twelve Data (track free-tier limits). MEDIUM for gold provider. |
| Features | **HIGH** | Competitive landscape well-documented. **LOW** comparables for reserve+cushion combo specifically — novel — so v1 is first user validation of those mental models. |
| Architecture | **HIGH** | Modular monolith + RLS + outbox + hexagonal-per-context is well-trodden. Patterns drawn from kgrzybek, Crunchy Data RLS, AWS RLS, pgledger, Oskar Dudycz. |
| Pitfalls | **HIGH** | Verified vs OWASP LLM top-10, GDPR + event-sourcing literature, Postgres RLS practice, Frankfurter API behavior, PWA 2026 state. |

### Gaps

- **Reserve + cushion mental-model validation** — no competitor reference; UX language testing needed early in Reserve/Onboarding phases.
- **Comparison feature value vs cost** — k-anonymity floor + closed taxonomy + quasi-id generalization is significant engineering. Confirm with founder it's still v1 differentiator vs deferral candidate.
- **EU vs US hosting** — affects DPA scope, subprocessor list, region-selection-at-signup UX. Resolve before Phase A deployment design.
- **Bun production maturity for OTel auto-instrumentation** — research notes "verify in spike"; fallback = pino + Sentry only, OTel post-smoke.

---

*Synthesized: 2026-05-05 from STACK.md (HIGH) · FEATURES.md (HIGH/LOW-novel) · ARCHITECTURE.md (HIGH) · PITFALLS.md (HIGH).*
