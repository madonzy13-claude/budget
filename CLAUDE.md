<!-- GSD:project-start source:PROJECT.md -->
## Project

**Budget — Family Budgeting & Wealth Tracker**

Web app that replaces an advanced personal Excel budget with a multi-tenant SaaS for households. Lets families plan and track expenses (per-category limits, dual normal/cushion budgets), manage a "reserve" buffer for irregular costs, monitor multi-asset investments (stocks, crypto, gold, real estate, bonds), and surface a "Tasks" action queue plus insights. Built mobile-first as an installable PWA.

**Core Value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.

### Constraints

- **Tech stack — runtime**: TypeScript on Bun — Stack pick driven by full-stack TS, fast startup, strong DDD ergonomics.
- **Tech stack — frontend**: Next.js (React) — SSR, large ecosystem, good for SaaS dashboards.
- **Tech stack — backend**: TypeScript service(s) on Bun, hexagonal architecture per bounded context.
- **Tech stack — database**: Postgres + tenant_id + Row-Level-Security. Append-only ledger table for transactions, versioned audit table for edits.
- **Tech stack — auth**: Self-hosted (Lucia or BetterAuth) — keeps users + sessions in own DB; cost predictable; no per-MAU pricing.
- **Tech stack — FX**: Frankfurter (ECB) via pluggable interface.
- **Tech stack — STT**: Pluggable; v1 ships Browser Web Speech API + Groq STT.
- **Tech stack — LLM**: Pluggable; v1 ships Claude Haiku + Groq.
- **Tech stack — investment prices**: Pluggable; v1 ships at least one provider for stocks, crypto, gold.
- **Deployment**: Docker — primary deployment unit. Compose for local dev, Docker images for prod.
- **Compliance**: GDPR (EU) + CCPA (US) — data export, right-to-delete, opt-in for analytics/comparison.
- **i18n**: Full i18n from start. EN + PL + UK at launch.
- **Engineering**: TDD-first; DDD bounded contexts; ports & adapters for every external integration (FX, STT, LLM, prices, email, push).
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR — The Stack in One Table
| Layer | Pick | Confidence | One-line rationale |
|---|---|---|---|
| Runtime | Bun 1.2.x | HIGH | Already locked. Native TS, fast install, fast boot. |
| HTTP framework | **Hono v4.12+** | HIGH | Bun-fast, runtime-agnostic (Node fallback if needed), Zod-OpenAPI + RPC client built-in. |
| Frontend framework | Next.js 16 (App Router) | HIGH | Already locked. App Router + Server Components mature in 2026. |
| Frontend↔Backend wire | **Hono RPC + Zod schemas** (not tRPC) | HIGH | Hono RPC gives same end-to-end TS as tRPC, no extra layer. tRPC wins on Next-only, loses when API is a separate Bun service. |
| ORM | **Drizzle ORM (latest stable)** | HIGH | First-class RLS support via `pgPolicy()`, SQL-like, hexagonal-friendly. Prisma has no native RLS. |
| Migrations | **drizzle-kit** (Atlas only if multi-ORM later) | HIGH | Tight integration; Atlas is overkill for single-stack v1. |
| Auth | **Better Auth (latest)** | HIGH | Lucia is deprecated since March 2025. Better Auth is the de-facto successor. Drizzle adapter, multi-session, organizations plugin → maps to "family workspace". |
| Validation | **Zod v3** | HIGH | Industry default, integrates with Hono, Drizzle, Better Auth, Vercel AI SDK. |
| Money | **Dinero.js v2** | HIGH | Purpose-built `Money(amount, currency)` value object — exactly the constraint. |
| Decimals (crypto only) | big.js | HIGH | Dinero's own FAQ recommends big.js for crypto precision. |
| Date/time | **Temporal API via `temporal-polyfill`** | MEDIUM-HIGH | TC39 Stage 4 March 2026, native in Chrome 144 / FF 139. Right primitive for a finance app handling FX historical dates and TZ-correct month boundaries. |
| Jobs / scheduler | **pg-boss** (primary) + node-cron-style triggers via pg-boss schedules | HIGH | Already running Postgres → no Redis to operate. Exactly-once via `SKIP LOCKED`. Right scale for v1. |
| i18n | **next-intl (latest)** | HIGH | Purpose-built for Next.js App Router + Server Components. EN/PL/UK out of the box. |
| LLM SDK | **Vercel AI SDK Core** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/groq`) | HIGH | Provider-pluggable by design — matches the ports/adapters constraint exactly. |
| STT | Browser Web Speech API + **groq-sdk** (Whisper-large-v3 on Groq) | HIGH | Already locked, both behind a `SpeechToText` port. |
| FX | Frankfurter (already locked) behind `FxProvider` port | HIGH | Constraint pinned. |
| Stocks/ETF feed | **Twelve Data** (free 800/day, paid path clean) | MEDIUM-HIGH | Better free tier than Alpha Vantage (25/day) and unified stock+forex+crypto API. |
| Crypto feed | **CoinGecko Public API** | HIGH | Free tier covers 14k+ assets; standard SaaS choice. |
| Gold feed | **metals.dev** (primary) / GoldAPI.io fallback | MEDIUM | Both have 100/mo free; metals.dev has cleaner DX and historical endpoint. |
| Email | **Resend** (v1) → reassess at >50k/mo | HIGH | Best DX, React Email components, 3k/mo free, $20/50k. |
| Web push | **web-push** npm + manual VAPID | HIGH | Provider-free, standard pattern in 2026. |
| PWA tooling | **Serwist** (`@serwist/next`) | HIGH | next-pwa is unmaintained (>2y); Serwist is its 2026 successor and supports App Router. |
| Test runner (backend) | **bun:test** | HIGH | Backend is pure TS on Bun → 3-10x faster than Vitest, native TS, native coverage. |
| Test runner (frontend) | **Vitest 4.x** + happy-dom | HIGH | Bun:test still has gaps for React Testing Library. Vitest is the default for component tests in 2026. |
| E2E | **Playwright** | HIGH | Industry default for PWA + SSR Next.js E2E. |
| Component testing | **@testing-library/react** under Vitest | HIGH | Same standard for a decade; aligns with TDD. |
| Logging | **pino 9.x** (JSON, stdout) | HIGH | Fastest Node logger; first-class OTel correlation. |
| Tracing | **OpenTelemetry SDK** (auto-instrumentation) | HIGH | Vendor-neutral; export to anything (Jaeger, Tempo, Datadog, Honeycomb). |
| Errors | **Sentry** (`@sentry/node` + `@sentry/nextjs`) | HIGH | OTel-native since v8; standard SaaS error tracking. |
| Container | Docker (locked) | HIGH | Compose for dev, multi-stage Bun image for prod. |
## Core Technologies (Detail)
### Hono v4 — HTTP framework
| Field | Value |
|---|---|
| Version | `hono@^4.12.16` (April 2026) |
| Confidence | HIGH |
### Drizzle ORM — Postgres access
| Field | Value |
|---|---|
| Version | `drizzle-orm` latest stable (with `drizzle-kit` for migrations) |
| Confidence | HIGH |
- Drizzle types and queries live ONLY in `src/<context>/adapters/persistence/`.
- Domain entities are plain classes with no Drizzle imports.
- Repositories are domain-defined interfaces; Drizzle implementations satisfy them.
- The `Money` value object converts to/from `{ amount_cents BIGINT, currency CHAR(3) }` columns at the adapter boundary — never inside the domain.
### Better Auth — Self-hosted auth
| Field | Value |
|---|---|
| Version | `better-auth` latest stable (1.4+ has Drizzle joins) |
| Confidence | HIGH |
### Validation: Zod v3
- Hono request validation (`@hono/zod-validator`)
- OpenAPI generation (`@hono/zod-openapi`)
- Drizzle schema → Zod inference (`drizzle-zod`)
- Vercel AI SDK structured output schemas
- Better Auth plugin schemas
### Money: Dinero.js v2
| Field | Value |
|---|---|
| Version | `dinero.js@^2` |
| Confidence | HIGH |
- `Money` is a domain value object. Dinero is an *implementation detail* sitting behind it.
- `Money.add()`, `Money.convertTo(rate)` are domain methods that delegate to Dinero internally.
- This shields the domain so the day Temporal-Money-style native primitive ships, we swap one file.
### Date/time: Temporal API (with polyfill in 2026)
| Field | Value |
|---|---|
| Version | `temporal-polyfill@latest` (~20KB gzip) |
| Confidence | MEDIUM-HIGH |
- FX rate as-of *date* (not datetime) — `Temporal.PlainDate`
- Month-end reserve sweeps in user's timezone — `Temporal.ZonedDateTime`
- Investment historical snapshots — TZ-aware without DST bugs
### Jobs: pg-boss
| Field | Value |
|---|---|
| Version | `pg-boss@^10` (latest stable) |
| Confidence | HIGH |
### LLM: Vercel AI SDK Core
| Field | Value |
|---|---|
| Version | `ai@^4` + `@ai-sdk/anthropic` + `@ai-sdk/groq` |
| Confidence | HIGH |
- `generateObject({ schema: zodSchema })` for structured Task output (the wizard's whole job)
- Streaming UX to Next.js out of the box
- Provider-level telemetry hooks (OTel-compatible)
### Frontend↔Backend: Hono RPC (NOT tRPC)
| Field | Value |
|---|---|
| Confidence | HIGH |
- (a) running tRPC *inside* Hono → two routers, two schema systems, doubled mental model, OR
- (b) running tRPC inside Next.js Route Handlers → backend is then split between Bun service and Next.js, kills the bounded-context separation
### i18n: next-intl
| Field | Value |
|---|---|
| Version | `next-intl` latest |
| Confidence | HIGH |
### PWA: Serwist (`@serwist/next`)
| Field | Value |
|---|---|
| Version | `@serwist/next` latest |
| Confidence | HIGH |
### Investment price feeds
| Asset class | Provider | Confidence |
|---|---|---|
| Stocks / ETFs | **Twelve Data** (free 800/day, $79/mo paid) | MEDIUM-HIGH |
| Crypto | **CoinGecko Public API** (free, paid plan exists) | HIGH |
| Gold | **metals.dev** primary, **GoldAPI.io** fallback | MEDIUM |
| Real estate / bonds | Manual snapshots only | HIGH |
### Email: Resend
| Field | Value |
|---|---|
| Version | `resend@^4` |
| Confidence | HIGH |
### Observability: pino + OpenTelemetry + Sentry
- **`pino@9`** — fastest Node logger, JSON output, child loggers per request for `tenantId` / `userId` correlation.
- **`@opentelemetry/sdk-node`** with auto-instrumentations — vendor-neutral; export to Jaeger or Tempo or Honeycomb later.
- **`@sentry/node`** + **`@sentry/nextjs`** — Sentry v8+ is OTel-native, so traces correlate. Use for errors and performance.
## Supporting Libraries
| Library | Version | Purpose | When to use |
|---|---|---|---|
| `drizzle-zod` | latest | Drizzle schema → Zod | Auto-derive DTOs from DB schema |
| `@hono/zod-validator` | latest | Hono middleware | Per-route request validation |
| `@hono/zod-openapi` | ^1.3 | OpenAPI generation | All public endpoints |
| `bcrypt` (or `argon2`) | latest | Password hashing | Better Auth uses one of these under the hood; configure |
| `jose` | latest | JWT/JWS if needed (e.g. webhook signatures) | Skip if Better Auth covers all session needs |
| `nanoid` | ^5 | Tenant/family/category IDs | Public-facing IDs (don't expose serial PKs) |
| `react-email` | latest | Email templates as JSX | Transactional + alert emails |
| `lucide-react` | latest | Icon set | Standard for shadcn/Tailwind stack |
| `tailwindcss@4` | ^4 | Styling | Industry default for Next.js dashboards |
| `shadcn/ui` (copied components, not npm) | n/a | Component library | Owned components + Tailwind primitives |
| `@tanstack/react-query` | ^5 | Client cache for non-RSC data | If client components fetch outside RSC boundary |
| `recharts` or `visx` | latest | Charts (insights page) | recharts simpler; visx more flexible — pick recharts v1 |
## Development Tools
| Tool | Purpose | Notes |
|---|---|---|
| `bun` 1.2.x | Runtime + package manager + test runner (backend) | Already locked. Use `bun install`, `bun run`, `bun test`. |
| `vitest` 4.x | Frontend test runner | App Router + RTL + happy-dom |
| `@testing-library/react` | React component tests | Standard with Vitest |
| `playwright` | E2E | Especially for PWA install + push notification flows |
| `eslint` 9 (flat config) + `@typescript-eslint` | Lint | Airbnb-style or strict-type-checked preset |
| `prettier` 3 | Format | Standard |
| `tsx` (or just `bun run`) | Script runner | Bun handles TS scripts natively — `tsx` rarely needed |
| `husky` + `lint-staged` | Git hooks | TDD discipline — block commits on failing tests |
| `docker` + `docker-compose` | Local stack | postgres + api (Bun) + web (Next) + worker |
## Installation (representative; pin actual versions during scaffolding)
# Backend (Bun service)
# bun:test is built-in
# Frontend (Next.js app)
## Alternatives Considered (the honest table)
| Recommended | Alternative | When alternative wins |
|---|---|---|
| Hono | Elysia | Pure-Bun shop with no Node fallback worry, want max raw RPS, OK with smaller community |
| Hono RPC | tRPC | Backend collapses into Next.js Route Handlers (then tRPC is friendlier than Hono inside Next) |
| Drizzle | Prisma | Team has deep Prisma experience and is willing to write raw SQL for RLS policies (we are not) |
| Drizzle | Kysely | You want a query builder only and own your schema source-of-truth in raw SQL files |
| Better Auth | Clerk / Auth0 | You can absorb per-MAU pricing and want fewer auth UI flows to build (constraint says no) |
| Better Auth | NextAuth/Auth.js | Backend was Next.js Route Handlers only (it isn't — Bun service) |
| pg-boss | BullMQ | >1k jobs/sec or need streams/pub-sub patterns |
| pg-boss | Inngest / Trigger.dev | Workflows are multi-step durable processes with human-in-the-loop |
| Vercel AI SDK | Direct provider SDKs | Pinning to one provider forever (we are not — pluggability is a constraint) |
| next-intl | i18next | Existing i18next translation memory + pipeline you can't migrate |
| next-intl | Lingui | Bundle size is critical; willing to add Babel/SWC plugin |
| Dinero v2 | currency.js | UI-only formatting with no server-side math (we have server-side math) |
| Temporal polyfill | date-fns v4 | Team unfamiliar with Temporal and v1 is time-pressured (acceptable v1 fallback, migrate to Temporal in v2) |
| Twelve Data | Alpha Vantage | Already have Alpha Vantage premium account |
| Twelve Data | Polygon.io / Finnhub | Need >800/day on free tier or specific data (Finnhub has 60/min free) |
| Resend | Postmark | Deliverability is mission-critical from day one (e.g. password reset SLA) |
| Resend | AWS SES | >500k/mo and cost dominates DX |
| bun:test (backend) | Vitest | Need jsdom-style mocking that bun:test doesn't yet support; or you want one runner everywhere |
| Vitest (frontend) | bun:test | bun:test catches up to RTL support (track this — could collapse to one runner later) |
| Serwist | next-pwa | Don't (next-pwa is unmaintained) |
| Serwist | manual SW + Workbox | Want full control and don't mind boilerplate |
## What NOT to Use
| Avoid | Why | Use instead |
|---|---|---|
| **Lucia auth** | Deprecated since March 2025; author closed maintenance | Better Auth |
| **next-pwa** | Unmaintained >2 years; doesn't track Next.js App Router properly | Serwist |
| **Prisma for RLS-heavy multi-tenant** | No native RLS; raw SQL escape hatch fights ORM | Drizzle |
| **NestJS** | Decorator/DI heavy; fights hexagonal composition; cold-start cost on Bun | Hono + manual composition |
| **Sequelize / TypeORM** | Older generation, weaker TS, slower roadmap | Drizzle |
| **Yup / Joi / io-ts** | Zod is the ecosystem standard; everything integrates with it | Zod |
| **moment.js** | Maintenance-mode since 2020; mutable; large | Temporal API (or date-fns v4 as fallback) |
| **dayjs** | Mutable defaults; weaker semantics for finance | Temporal API |
| **Express** | Slower than Hono; older middleware patterns; not designed for Bun | Hono |
| **Redux Toolkit** | RSC + React Query covers state needs in 2026 Next.js | Server Components + React Query for client cache |
| **node-cron in-process** | Loses jobs on deploy; no persistence, no retries | pg-boss schedules |
| **NodeMailer with raw SMTP** | DIY deliverability nightmare for SaaS | Resend / Postmark / SES |
| **SendGrid** | Pricing & deliverability regressions reported in 2026 | Resend (v1), Postmark (deliverability-critical) |
| **iron-session** | Lower-level than Better Auth; rebuilds adjacent features by hand | Better Auth |
| **Auth0 / Clerk for v1** | Per-MAU pricing kills SaaS margins on a budgeting product | Better Auth (constraint) |
| **Float for money** | Floating-point arithmetic in finance = production incident | Dinero.js v2 (+ big.js for crypto) |
| **GraphQL (Apollo) for internal API** | Schema overhead unjustified with one client | Hono RPC + OpenAPI |
| **Knex** | Older, weaker types, no schema-as-source | Drizzle (or Kysely if you only want a builder) |
## Stack Patterns by Variant
- Add a connection pool keyed by tenant (PgBouncer with prepared-statement pinning) OR
- Move to schema-per-tenant (Drizzle supports this with the `drizzle-multitenant` toolkit) OR
- Sharded Postgres (e.g. Citus / pg_partman by tenant_id)
- *Don't* preempt — RLS + tenant_id covers v1 comfortably.
- Layer Inngest or Trigger.dev *on top of* pg-boss (not replace) — reserve sweep stays on pg-boss; complex flows go to Inngest.
- AI SDK's `streamText` with `experimental_telemetry` lets us measure per-tenant token cost.
- Gate to Groq (10-50x cheaper for open models) for the wizard's high-volume turns.
- Add Dexie / IndexedDB on the client + a "pending mutation" queue replayed when online.
- Serwist already covers offline reads.
## Version Compatibility Notes
| Package A | Compatible with | Notes |
|---|---|---|
| Bun 1.2.x | Hono 4.12+ | Verified; Hono is a tier-1 Bun citizen |
| Bun 1.2.x | Drizzle latest | Verified — Bun is a documented runtime |
| Drizzle latest | Better Auth 1.4+ | Drizzle adapter requires `experimental.joins: true` for full functionality |
| Next.js 16 | Serwist | Requires Webpack for build (Turbopack incompatible as of May 2026) |
| Next.js 16 | next-intl | Full App Router + RSC support |
| pg-boss 10.x | Postgres 13+ | `SKIP LOCKED` requires PG 9.5+ — comfortably supported |
| Vercel AI SDK 4.x | Anthropic / Groq | `@ai-sdk/anthropic` and `@ai-sdk/groq` track upstream model releases |
| Temporal polyfill | All runtimes | `globalThis.Temporal` shim; verify browser support per target |
| `hc` (Hono client) | Next.js Server Actions | Works inside Server Components and Server Actions both |
## How the Stack Maps to the DDD Bounded Contexts
| Bounded Context | Owns (domain) | Adapter libraries |
|---|---|---|
| **Identity** | User, Credential, Session, Language | Better Auth + Drizzle (auth tables) |
| **Tenancy** | FamilyWorkspace, Membership, Role | Drizzle + RLS policies + Better Auth `organization` plugin |
| **Budgeting** | Category, BudgetPeriod, Limit, CushionLimit | Drizzle (read/write) + Dinero.js (Money) |
| **Expense Capture** | Expense (ledger entry), CaptureSource | Drizzle + Hono (form), `@ai-sdk/groq` (Whisper STT), browser Web Speech (frontend) |
| **Reserves** | ReserveBalance, ReserveMove (Task) | Drizzle + pg-boss (month-end sweep job) |
| **Cushion** | CushionTarget, Holding | Drizzle + Dinero (target valuation) |
| **Investments** | Position, Snapshot, AssetClass | Drizzle + `PriceProvider` port (Twelve Data, CoinGecko, metals.dev impls) |
| **Tasks** | Task, TaskStatus | Drizzle + pg-boss (Task generators run on schedules) |
| **Insights** | TimeSeries, Aggregation | Drizzle (read-replica eventually) + recharts on frontend |
| **Comparison** | AnonymizedAggregate, ConsentToken | Drizzle (separate schema, no tenant_id) + pg-boss (nightly aggregation job) |
| **Notifications** | NotificationChannel, NotificationPreference | Resend (email port), `web-push` (push port), pg-boss (delivery worker) |
| **Onboarding** | WizardSession, WizardOutput | Vercel AI SDK + Zod schemas for `generateObject` |
| **FX** | ExchangeRate (historical) | `FxProvider` port → Frankfurter impl + pg-boss (daily fetch job) |
## Sources
- [Hono v4 docs + RPC + Zod-OpenAPI](https://hono.dev/docs/guides/rpc) — verified version & features
- [Drizzle ORM RLS docs](https://orm.drizzle.team/docs/rls) — `pgPolicy()` / `crudPolicy()` confirmed
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) — version 1.4+ joins
- [Better Auth changelog](https://better-auth.com/changelog) — active maintenance verified
- [Lucia deprecation announcement (GitHub Discussion #1714)](https://github.com/lucia-auth/lucia/discussions/1714) — deprecated March 2025
- [Wisp CMS: Lucia Auth is Dead](https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth) — community consensus on Better Auth as successor
- [Drizzle vs Prisma 2026 (Bytebase)](https://www.bytebase.com/blog/drizzle-vs-prisma/) — RLS comparison
- [Drizzle vs Prisma 2026 (Makerkit)](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — multi-tenant context
- [pg-boss npm](https://www.npmjs.com/package/pg-boss) — features and SKIP LOCKED guarantees
- [pg-boss vs BullMQ analysis (DEV)](https://dev.to/aws-builders/i-removed-redis-from-my-stack-and-used-postgresql-for-job-queues-instead-2lp5) — operational tradeoffs
- [Dinero.js v2 docs](https://www.dinerojs.com/) — value object + multi-currency
- [Dinero.js big.js recommendation for crypto](https://github.com/dinerojs/dinero.js/) — FAQ
- [Temporal Stage 4 / browser support (Bryntum, 2026)](https://bryntum.com/blog/javascript-temporal-is-it-finally-here/) — Stage 4 March 2026
- [temporal-polyfill bundle size](https://www.pkgpulse.com/guides/date-fns-v4-vs-temporal-api-vs-dayjs-date-handling-2026) — ~20KB
- [next-intl Internationalization docs (Next.js)](https://nextjs.org/docs/app/guides/internationalization) — App Router
- [Serwist (next-pwa successor) docs](https://serwist.pages.dev/docs/next/getting-started) — App Router PWA
- [Vercel AI SDK docs](https://ai-sdk.dev/docs/introduction) — provider abstraction
- [Resend pricing 2026](https://www.buildmvpfast.com/api-costs/email) — free tier + scaling
- [Twelve Data API](https://twelvedata.com/) — 800/day free
- [CoinGecko API](https://www.coingecko.com/learn/top-5-best-crypto-exchange-data-apis) — free tier
- [metals.dev docs](https://metals.dev/docs) — gold price API
- [bun:test vs Vitest 2026 (PkgPulse)](https://www.pkgpulse.com/blog/bun-test-vs-vitest-vs-jest-2026) — performance + RTL gap
- [pino + OpenTelemetry guide 2026 (DEV)](https://dev.to/1xapi/how-to-add-structured-logging-to-nodejs-apis-with-pino-9-opentelemetry-2026-guide-3jd2) — production logging stack
- [Sentry OTel integration](https://www.mintlify.com/getsentry/sentry-javascript/guides/advanced/opentelemetry) — v8+ OTel-native
- [web-push + Next.js push notifications 2026 (Medium)](https://medium.com/@amirjld/implementing-push-notifications-in-next-js-using-web-push-and-server-actions-f4b95d68091f) — VAPID pattern
- Project context: `.planning/PROJECT.md`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
