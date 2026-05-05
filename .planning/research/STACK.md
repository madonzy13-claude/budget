# Stack Research

**Domain:** Multi-tenant SaaS family budgeting & wealth tracker (Bun + Next.js + Postgres)
**Researched:** 2026-05-05
**Confidence:** HIGH (most picks verified against current docs and 2026 ecosystem signals)

> All picks below are prescriptive. "Choose X. Here's why. Don't choose Y." The downstream
> consumer is a roadmap, so each entry includes confidence + how the choice interacts with
> multi-tenancy / DDD / TDD / hexagonal constraints.

---

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

---

## Core Technologies (Detail)

### Hono v4 — HTTP framework

| Field | Value |
|---|---|
| Version | `hono@^4.12.16` (April 2026) |
| Confidence | HIGH |

**Why Hono over Elysia / NestJS / raw Bun.serve:**

1. **Runtime-agnostic.** If Bun has a deal-breaker bug in production, Hono runs unchanged on Node.js or Deno. Elysia is Bun-only — that's a serious lock-in risk for a SaaS that has to stay up.
2. **Type-safe RPC built in.** `hc<typeof app>` gives the same end-to-end TS that tRPC gives, but without an extra protocol layer over a Bun HTTP server we're already running.
3. **OpenAPI for free.** `@hono/zod-openapi` (v1.3.0) generates Swagger from the same Zod schemas the validators already use. Critical because the comparison feature, future bank-API integrations, and possible mobile clients need a stable public spec.
4. **Operational footprint is tiny.** ~14 KB minified, no DI container, no decorator metaplumbing. Plays perfectly with hexagonal architecture: routes are thin adapters that call use-cases — no framework magic to fight.
5. **Used in production by Cloudflare, Clerk, Unkey, OpenStatus** — well past "experimental".

**Why NOT NestJS:** Decorator-heavy DI fights hexagonal architecture (the framework wants to own composition; we want use-cases to). Heavier cold start. Overkill for a small set of bounded contexts.

**Why NOT Elysia:** Faster on Bun but Bun-only. Eden Treaty is Elysia-only. Smaller community (~500k weekly vs Hono's ~1.8M). The 2x perf difference is irrelevant — DB queries dominate.

**Why NOT raw `Bun.serve`:** Re-implementing routing, validation, OpenAPI, RPC client = months of yak-shaving. Don't.

**DDD/hexagonal interaction:**
Routes live in `src/<context>/adapters/http/` and call use-cases. Hono `Context` never leaks into the domain. Validators are Zod schemas owned by the application layer.

---

### Drizzle ORM — Postgres access

| Field | Value |
|---|---|
| Version | `drizzle-orm` latest stable (with `drizzle-kit` for migrations) |
| Confidence | HIGH |

**Why Drizzle over Prisma / Kysely / raw pg:**

1. **First-class RLS support.** `pgPolicy()` declares policies inline with the schema; `crudPolicy()` helper generates four-policy CRUD bundles. This is the single biggest reason — RLS *is* our tenant-isolation contract.
2. **Connection-context pattern works.** Drizzle's transaction API lets us `SET LOCAL app.tenant_id = '<uuid>'` per request → RLS policies key off it. Prisma's transaction API + connection pooling makes this fragile (search "prisma RLS gotchas" — it's a known pain point).
3. **SQL-shaped API.** Domain repositories in adapter layers read like SQL. No leaky `findMany({ include: { posts: { where: ... } } })` query-by-shape that drifts from the actual SQL the DB sees. Predictability matters in finance code.
4. **No code generation step.** Schema is TS source. Types update in the editor instantly — TDD loop stays tight.
5. **Smaller bundle, no Rust engine, no Prisma Accelerate dependency.**

**Why NOT Prisma:** No built-in RLS, the official guidance is "use raw SQL and hope it doesn't conflict with our query engine". For a tenant-isolation primitive, that's unacceptable. Prisma 7's TS rewrite is impressive but doesn't fix the RLS gap.

**Why NOT Kysely:** Excellent type-safe query builder, but no schema-as-source-of-truth, no migration tool, no RLS helpers. You'd reinvent half of Drizzle.

**Why NOT raw `pg` / `postgres.js`:** Fine for one-off scripts, but every repository becomes hand-written SQL string assembly. Loss of compile-time column-existence checking is a TDD downgrade.

**DDD/hexagonal interaction (CRITICAL):**
- Drizzle types and queries live ONLY in `src/<context>/adapters/persistence/`.
- Domain entities are plain classes with no Drizzle imports.
- Repositories are domain-defined interfaces; Drizzle implementations satisfy them.
- The `Money` value object converts to/from `{ amount_cents BIGINT, currency CHAR(3) }` columns at the adapter boundary — never inside the domain.

**Multi-tenant pattern (lock this in early):**
```ts
// adapter
await db.transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
  return tx.select()...; // RLS now active
});
```
Test this with `drizzle-orm-test` (auto-context-switching for RLS test suites).

---

### Better Auth — Self-hosted auth

| Field | Value |
|---|---|
| Version | `better-auth` latest stable (1.4+ has Drizzle joins) |
| Confidence | HIGH |

**Why Better Auth over Lucia:**

Lucia v3 was officially deprecated March 2025 — author's stated reason: database adapters became a complexity tax. Better Auth is the community-recognized successor (LogRocket, multiple migration guides 2025-2026). Continuing on Lucia in 2026 means owning a dead dependency.

**Why Better Auth specifically:**

1. **Drizzle adapter is first-class.** Same ORM, same migrations, no parallel schema universe.
2. **Plugin architecture matches our needs:**
   - `organization` plugin → maps directly to "family workspace" (multi-member, role-based)
   - `multi-session` → required for shared family device flows
   - `email-otp` / `magic-link` → optional later
3. **TypeScript-first** — full type inference on `auth.api.getSession()`.
4. **Sessions live in our Postgres, in our schema** — RLS can apply uniformly. No external SaaS lock-in, no per-MAU pricing. This is the core constraint.
5. **Active maintenance** — recent fixes for Drizzle date handling, Cloudflare D1 support added.

**Why NOT NextAuth/Auth.js:** Tightly coupled to Next.js. Our auth has to work for the Bun API service too (server-to-server, mobile-future). Better Auth is framework-agnostic.

**Why NOT roll-your-own (the Lucia "fresh start" path):** It's seductive (full control, no dep) but you re-implement: CSRF, secure cookie flags, session rotation, password hashing standards, OAuth state machines, rate limiting, account-linking edge cases, password-reset token lifetimes. Better Auth gets all of these right and lets you focus on domain.

**DDD/hexagonal interaction:**
Better Auth lives in an `Identity` bounded context adapter. Domain entities (`User`, `FamilyWorkspace`, `Membership`) are owned by us; Better Auth tables (`session`, `account`, `verification`) are infrastructure. The `organization` plugin's `members` table can either *be* our membership table or sit alongside — pick one in the roadmap.

---

### Validation: Zod v3

`zod@^3.x`. Universal pick. Drives:
- Hono request validation (`@hono/zod-validator`)
- OpenAPI generation (`@hono/zod-openapi`)
- Drizzle schema → Zod inference (`drizzle-zod`)
- Vercel AI SDK structured output schemas
- Better Auth plugin schemas

One schema language across the entire stack. Don't import Yup, Joi, or io-ts.

---

### Money: Dinero.js v2

| Field | Value |
|---|---|
| Version | `dinero.js@^2` |
| Confidence | HIGH |

**Why:** Constraint says `Money(amount, currency)` value object everywhere. Dinero v2 *is* that value object — immutable, integer-cents storage, multi-currency, formatter, allocator (for proportional splits, e.g. category cushion calculations).

**Crypto exception:** Dinero stores amounts as integers; crypto needs 8-18 decimal precision and very large amounts (Satoshis, Wei). Use **big.js** for crypto positions only — Dinero's own FAQ recommends this. Wrap both behind the domain's `Money` and `AssetQuantity` types so the domain never knows which library handles which currency.

**DDD interaction:**
- `Money` is a domain value object. Dinero is an *implementation detail* sitting behind it.
- `Money.add()`, `Money.convertTo(rate)` are domain methods that delegate to Dinero internally.
- This shields the domain so the day Temporal-Money-style native primitive ships, we swap one file.

**Why NOT bare numbers:** Floating-point in finance = production incident. Non-negotiable.
**Why NOT decimal.js:** Generic; reimplements currency-awareness; bigger API surface.

---

### Date/time: Temporal API (with polyfill in 2026)

| Field | Value |
|---|---|
| Version | `temporal-polyfill@latest` (~20KB gzip) |
| Confidence | MEDIUM-HIGH |

**Why:** Stage 4 at TC39 March 2026. Native in Chrome 144+ and Firefox 139+. The right primitive for:
- FX rate as-of *date* (not datetime) — `Temporal.PlainDate`
- Month-end reserve sweeps in user's timezone — `Temporal.ZonedDateTime`
- Investment historical snapshots — TZ-aware without DST bugs

The discriminated union (`PlainDate` vs `PlainDateTime` vs `ZonedDateTime` vs `Instant`) makes a category of bugs un-typable.

**Pragmatic note:** If the team is unfamiliar with Temporal, **date-fns v4** is acceptable v1 fallback (functional, TZ-aware via `date-fns-tz`). But Temporal is the 2026 direction and a finance app benefits most.

**Why NOT dayjs:** Mutable API by default; smaller but worse semantics. Avoid.
**Why NOT moment.js:** Officially in maintenance mode since 2020. Don't.

---

### Jobs: pg-boss

| Field | Value |
|---|---|
| Version | `pg-boss@^10` (latest stable) |
| Confidence | HIGH |

**Why pg-boss over BullMQ / Inngest:**

1. **Zero new infrastructure.** Postgres is already the system of record. BullMQ requires a Redis (another DB to backup, monitor, secure, replicate). For a SaaS at v1 scale that's wasted complexity.
2. **Exactly-once semantics via `SKIP LOCKED`** — Postgres-native, no edge cases around Redis persistence modes.
3. **Cron-style scheduling built in.** Daily FX fetch, end-of-month reserve sweep, weekly insights snapshot — all native pg-boss schedules.
4. **Transactional job creation.** `pg-boss.send()` inside the same transaction as the domain write means "create expense + emit Task" is atomic. BullMQ can't do that with Redis.
5. **Throughput is fine.** pg-boss tops out around 100-200 jobs/sec — a family budgeting SaaS won't get near that for years.

**Why NOT BullMQ:** Faster (thousands/sec) but requires Redis. Not justified at v1 scale.
**Why NOT Inngest:** Excellent DX and durable execution, but managed-service vendor lock-in for a feature that's straightforward to do in Postgres. Reconsider later if workflows get complex (e.g. multi-step approval flows).
**Why NOT Trigger.dev:** Same managed concern; great if we needed durable workflows; we don't yet.

**DDD interaction:**
pg-boss handlers live in `adapters/jobs/` and call domain use-cases. Domain emits intent (`emitTask(...)`); the adapter persists the job. Same pattern as HTTP adapters.

---

### LLM: Vercel AI SDK Core

| Field | Value |
|---|---|
| Version | `ai@^4` + `@ai-sdk/anthropic` + `@ai-sdk/groq` |
| Confidence | HIGH |

**Why over direct Anthropic/Groq SDKs:**

The constraint says **pluggable LLM provider** — that's literally what AI SDK Core's unified interface gives us. Switching `model: anthropic('claude-haiku-...')` to `groq('llama-...')` is one line. Direct SDKs require an internal abstraction layer that we'd build, maintain, and bug-fix ourselves.

Bonus features:
- `generateObject({ schema: zodSchema })` for structured Task output (the wizard's whole job)
- Streaming UX to Next.js out of the box
- Provider-level telemetry hooks (OTel-compatible)

**DDD interaction:**
The `LLMProvider` port in domain takes a prompt template and a `Zod` schema, returns a typed object. AI SDK is the *only* implementation in v1. Adding a new provider = adding a new `@ai-sdk/X` adapter.

**Caveat:** AI SDK is Vercel-led but Apache-2.0 OSS, no Vercel-platform lock-in. Confirmed.

---

### Frontend↔Backend: Hono RPC (NOT tRPC)

| Field | Value |
|---|---|
| Confidence | HIGH |

**Why Hono RPC over tRPC:**

We already chose Hono for the backend. Hono's RPC client (`hc<typeof app>`) gives the same end-to-end TS that tRPC does — but reuses the same routes that serve our REST/OpenAPI surface. tRPC would mean either:
- (a) running tRPC *inside* Hono → two routers, two schema systems, doubled mental model, OR
- (b) running tRPC inside Next.js Route Handlers → backend is then split between Bun service and Next.js, kills the bounded-context separation

**Why NOT GraphQL:** Schema-first wins when you have many heterogeneous clients. We have one (Next.js). Apollo overhead is unjustified.

**Why NOT plain REST:** We *also* expose REST (auto-generated OpenAPI) for future bank-API webhooks and possible mobile clients. Hono RPC is a typed *consumer* on top of the same routes. Best of both.

**Pattern:** Frontend uses `hc` for typed calls in client components / Server Actions; the same routes serve OpenAPI for external consumers.

---

### i18n: next-intl

| Field | Value |
|---|---|
| Version | `next-intl` latest |
| Confidence | HIGH |

**Why over i18next / Lingui:**

next-intl is purpose-built for Next.js App Router + Server Components + middleware locale detection. EN/PL/UK is exactly the load it was designed for. Compile-time key checking with TS plugin catches missing translations in CI.

i18next ecosystem is bigger but App Router support is verbose and bolted-on. Lingui has the smallest bundle but adds a Babel/SWC build step — friction we don't need.

**Constraint match:** "New languages added without code changes" → next-intl loads JSON catalogs; adding a locale is adding `messages/<lang>.json` + middleware config.

---

### PWA: Serwist (`@serwist/next`)

| Field | Value |
|---|---|
| Version | `@serwist/next` latest |
| Confidence | HIGH |

**Why:** `next-pwa` has been unmaintained for >2 years. Serwist is its actively-maintained 2026 successor, App Router-native, Workbox-based.

**Operational note:** Next.js 16 default-uses Turbopack, but Serwist still requires Webpack for the build step. Means `bun run build` falls back to Webpack — acceptable trade-off.

**Web push:** `web-push` npm + manual VAPID — that's the standard pattern. Generate keys with `npx web-push generate-vapid-keys`. Public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, private in server env. Notifications context dispatches via a `PushNotifier` port.

---

### Investment price feeds

| Asset class | Provider | Confidence |
|---|---|---|
| Stocks / ETFs | **Twelve Data** (free 800/day, $79/mo paid) | MEDIUM-HIGH |
| Crypto | **CoinGecko Public API** (free, paid plan exists) | HIGH |
| Gold | **metals.dev** primary, **GoldAPI.io** fallback | MEDIUM |
| Real estate / bonds | Manual snapshots only | HIGH |

**Why Twelve Data over Alpha Vantage:** Alpha Vantage free is 25/day with 5/min rate limit — too tight to support cron-driven daily refreshes for a multi-tenant SaaS. Twelve Data's 800/day fits early customers; clean upgrade path. Single API for stocks + ETFs + forex + crypto reduces our adapter count.

**Why CoinGecko:** 14k+ assets covered, generous free tier, the de-facto standard for non-trading crypto valuation. CoinMarketCap is the obvious alternative; CoinGecko's free tier is more permissive.

**Why metals.dev for gold:** Cleaner DX, JSON API, historical endpoint. GoldAPI.io is a reasonable backup; both have ~100/mo free.

**All four behind the `PriceProvider` port:** v1 ships these implementations; per the constraint, real estate and bonds remain manual.

---

### Email: Resend

| Field | Value |
|---|---|
| Version | `resend@^4` |
| Confidence | HIGH |

**Why Resend at v1:** Best DX in 2026 (founded by the React Email author), 3k/mo free, $20 for 50k. React Email components compose like normal React — fits the Next.js mental model.

**When to switch:** At sustained >50k/mo, Postmark wins on per-email cost AND on deliverability for transactional flows. At >500k/mo, raw SES via a managed layer (AWS SES + SST) is the cost-optimal choice. v1 starts at Resend; the `EmailProvider` port makes the swap trivial.

**Why NOT SendGrid:** Twilio's pricing has drifted upward; deliverability has slipped per multiple 2026 reports.

---

### Observability: pino + OpenTelemetry + Sentry

- **`pino@9`** — fastest Node logger, JSON output, child loggers per request for `tenantId` / `userId` correlation.
- **`@opentelemetry/sdk-node`** with auto-instrumentations — vendor-neutral; export to Jaeger or Tempo or Honeycomb later.
- **`@sentry/node`** + **`@sentry/nextjs`** — Sentry v8+ is OTel-native, so traces correlate. Use for errors and performance.

Bun supports OTel auto-instrumentation as of late 2025, but verify in spike. Fallback: log + Sentry, add OTel after smoke test.

---

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

---

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

---

## Installation (representative; pin actual versions during scaffolding)

```bash
# Backend (Bun service)
bun add hono @hono/zod-validator @hono/zod-openapi
bun add drizzle-orm postgres                       # postgres-js as the driver
bun add better-auth
bun add zod
bun add dinero.js big.js
bun add temporal-polyfill
bun add pg-boss
bun add ai @ai-sdk/anthropic @ai-sdk/groq groq-sdk
bun add resend react-email @react-email/components
bun add web-push
bun add pino @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @sentry/node
bun add nanoid

bun add -d drizzle-kit
bun add -d @types/web-push @types/pg-boss
# bun:test is built-in

# Frontend (Next.js app)
bun add next react react-dom
bun add next-intl
bun add @serwist/next serwist
bun add zod
bun add hono                                       # client (hc) only
bun add @tanstack/react-query
bun add tailwindcss @tailwindcss/postcss
bun add lucide-react recharts
bun add temporal-polyfill dinero.js                # shared with backend

bun add -d vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom happy-dom
bun add -d playwright @playwright/test
bun add -d eslint @typescript-eslint/eslint-plugin prettier
```

---

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

---

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

---

## Stack Patterns by Variant

**If we hit RLS performance issues at scale (>50k tenants):**
- Add a connection pool keyed by tenant (PgBouncer with prepared-statement pinning) OR
- Move to schema-per-tenant (Drizzle supports this with the `drizzle-multitenant` toolkit) OR
- Sharded Postgres (e.g. Citus / pg_partman by tenant_id)
- *Don't* preempt — RLS + tenant_id covers v1 comfortably.

**If background jobs become workflow-heavy (multi-step approval flows):**
- Layer Inngest or Trigger.dev *on top of* pg-boss (not replace) — reserve sweep stays on pg-boss; complex flows go to Inngest.

**If LLM costs spike:**
- AI SDK's `streamText` with `experimental_telemetry` lets us measure per-tenant token cost.
- Gate to Groq (10-50x cheaper for open models) for the wizard's high-volume turns.

**If we need offline-first writes:**
- Add Dexie / IndexedDB on the client + a "pending mutation" queue replayed when online.
- Serwist already covers offline reads.

---

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

---

## How the Stack Maps to the DDD Bounded Contexts

(This is the part that matters for the roadmap.)

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

**Hexagonal rule (non-negotiable):** No library from the right column appears in domain code. They live in `adapters/`. Domain depends on ports (interfaces), implementations are wired in `composition/` (the only place that imports concrete adapters).

---

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

---
*Stack research for: multi-tenant SaaS family budgeting & wealth-tracker (Bun + Next.js + Postgres)*
*Researched: 2026-05-05*
