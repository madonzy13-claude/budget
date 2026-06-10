<!-- GSD:project-start source:PROJECT.md -->

## Project

**Budget — Family Budgeting & Wealth Tracker**

Multi-tenant SaaS that replaces an advanced personal Excel budget for households. Plan/track expenses (per-category limits, dual normal/cushion budgets), manage a "reserve" buffer, monitor multi-asset investments (stocks, crypto, gold, real estate, bonds), surface a "Tasks" action queue + insights. Mobile-first installable PWA.

**Core Value:** Replace a personal-budget spreadsheet with a multi-user, multi-currency tool whose Tasks queue tells the family exactly what to do this week to keep budget, reserve, and cushion healthy.

### Constraints

- **Runtime**: TypeScript on Bun. **Frontend**: Next.js (App Router). **Backend**: TS on Bun, hexagonal per bounded context.
- **DB**: Postgres + tenant_id + RLS. Append-only ledger; versioned audit table.
- **Auth**: Self-hosted (Better Auth) — no per-MAU pricing.
- **Pluggable adapters**: FX (Frankfurter), STT (Web Speech + Groq), LLM (Claude Haiku + Groq), prices (stocks/crypto/gold), email, push.
- **Deployment**: Docker (compose for dev, images for prod).
- **Compliance**: GDPR + CCPA — data export, right-to-delete, opt-in analytics.
- **i18n**: EN + PL + UK at launch.
- **Engineering**: TDD-first; DDD bounded contexts; ports & adapters for every external integration.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

| Layer      | Pick                                                                    | Note                                                                         |
| ---------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Runtime    | Bun 1.2.x                                                               | Native TS                                                                    |
| HTTP       | Hono v4.12+                                                             | Bun-fast, Zod-OpenAPI + RPC built-in                                         |
| Frontend   | Next.js 16 (App Router)                                                 | RSC mature                                                                   |
| FE↔BE wire | Hono RPC + Zod (NOT tRPC)                                               | API is separate Bun service                                                  |
| ORM        | Drizzle (latest) + drizzle-kit                                          | First-class RLS via `pgPolicy()`                                             |
| Auth       | Better Auth (1.4+)                                                      | Lucia deprecated; Drizzle adapter, organizations plugin → "family workspace" |
| Validation | Zod v3                                                                  | Hono / Drizzle / AI SDK / Better Auth all integrate                          |
| Money      | Dinero.js v2 (+ big.js for crypto)                                      | Domain `Money` value object wraps it                                         |
| Date/time  | Temporal API via `temporal-polyfill`                                    | TZ-correct month boundaries, FX as-of-date                                   |
| Jobs       | pg-boss v10                                                             | SKIP LOCKED, no Redis                                                        |
| i18n       | next-intl                                                               | App Router + RSC                                                             |
| LLM        | Vercel AI SDK Core (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/groq`)        | Provider-pluggable                                                           |
| STT        | Browser Web Speech + groq-sdk Whisper                                   | Behind `SpeechToText` port                                                   |
| FX         | Frankfurter                                                             | Behind `FxProvider` port                                                     |
| Prices     | Twelve Data (stocks/ETF) · CoinGecko (crypto) · metals.dev (gold)       | Behind `PriceProvider` ports                                                 |
| Email      | Resend (v1)                                                             | React Email components                                                       |
| Web push   | `web-push` + manual VAPID                                               | Provider-free                                                                |
| PWA        | Serwist (`@serwist/next`)                                               | next-pwa is unmaintained                                                     |
| Test       | bun:test (backend) · Vitest 4 + happy-dom (frontend) · Playwright (E2E) | RTL under Vitest                                                             |
| Logging    | pino 9 (JSON)                                                           | Child loggers per request for tenantId/userId                                |
| Tracing    | OpenTelemetry SDK                                                       | Vendor-neutral export                                                        |
| Errors     | Sentry (`@sentry/node` + `@sentry/nextjs`)                              | OTel-native v8+                                                              |
| Container  | Docker                                                                  | Compose dev, multi-stage Bun image prod                                      |

### Key rules

- Drizzle types/queries live ONLY in `src/<context>/adapters/persistence/`. Domain entities are plain classes with no Drizzle imports.
- `Money` value object converts to `{ amount_cents BIGINT, currency CHAR(3) }` at adapter boundary — never inside domain.

### What NOT to use

Lucia (deprecated) · next-pwa (unmaintained) · Prisma (no native RLS) · NestJS (cold-start on Bun) · Yup/Joi/io-ts (use Zod) · moment.js / dayjs (use Temporal) · Express (use Hono) · node-cron in-process (loses jobs) · NodeMailer raw SMTP · iron-session (use Better Auth) · Auth0/Clerk (per-MAU pricing) · Float for money (use Dinero) · GraphQL for internal API (use Hono RPC + OpenAPI).

### Bounded contexts → adapters

Identity (Better Auth + Drizzle) · Tenancy (Drizzle + RLS + Better Auth orgs plugin) · Budgeting (Drizzle + Dinero) · Expense Capture (Drizzle + Hono + Groq Whisper + Web Speech) · Reserves (Drizzle + pg-boss month-end sweep) · Cushion (Drizzle + Dinero) · Investments (Drizzle + PriceProvider port) · Tasks (Drizzle + pg-boss generators) · Insights (Drizzle + recharts) · Comparison (separate schema, no tenant_id) · Notifications (Resend + web-push + pg-boss worker) · Onboarding (Vercel AI SDK + Zod) · FX (FxProvider port + pg-boss daily fetch).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

### Testing — TDD First (MANDATORY)

**Write the failing test before writing implementation. No exceptions.** Claude must run tests itself before asking the user to manually test anything. Use Playwright for UI flows; only escalate to user for final confirmation.

| Type                    | Tool                     | Location           | Coverage                      |
| ----------------------- | ------------------------ | ------------------ | ----------------------------- |
| Unit (domain)           | bun:test                 | `packages/*/test/` | 80% enforced                  |
| Component               | Vitest + RTL + happy-dom | `apps/web/test/`   | All interactive               |
| Integration (routes/DB) | bun:test                 | `apps/api/test/`   | All HTTP routes + DB adapters |
| E2E (user flows)        | Playwright               | `tests/e2e/`       | Every user-facing flow        |

**Non-negotiable rules:**

0. Bug reports imply missing tests — write a failing reproducer first, then fix.
1. TDD cycle: red → green → refactor.
2. Claude runs `make test` / `make test-e2e` before asking user to click anything.
3. No DB mocking in integration tests — real Postgres (Docker or testcontainers).
4. E2E covers golden path + main error cases for every user-facing flow.
5. BDD naming: `describe('Sign Up') > test('creates account and shows verification banner')`.
6. Playwright base URL from `PLAYWRIGHT_BASE_URL` env (defaults `http://localhost:3000`).
7. 80% domain coverage threshold in `bunfig.toml` — do not lower.
8. Every API route gets at least one integration test in `apps/api/test/routes/`.

```bash
make test          # bun:test — backend unit + integration
make test-e2e      # Playwright E2E against running stack
make ci-gate       # tenant-leak CI gate (6 security tests)
cd apps/web && bun run test   # Vitest component tests
```

E2E against Tailscale dev host: `PLAYWRIGHT_BASE_URL=http://claude-code.tail4b2401.ts.net make test-e2e`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Not yet mapped. Follow existing patterns found in the codebase.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

None. Add to `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index.

<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit/Write tools, start work through a GSD command so planning artifacts and execution context stay in sync.

- `/gsd-quick` — small fixes, doc updates, ad-hoc tasks
- `/gsd-debug` — investigation and bug fixing
- `/gsd-execute-phase` — planned phase work

No direct repo edits outside a GSD workflow unless user explicitly asks to bypass.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Not yet configured. Run `/gsd-profile-user`. Section managed by `generate-claude-profile` — do not edit manually.

<!-- GSD:profile-end -->

## Local Development

### Seeing UI / email template changes

`web` and `api` services run from **prebuilt Docker images**. Source edits do NOT hot-reload — rebuild affected image + restart service.

**After editing `apps/web/**`, `apps/api/**`, `packages/**`:\*\*

```bash
make dev-build                                    # rebuild all + restart
docker compose build web && make restart-web     # one service
docker compose build api && make restart-api
```

`make restart-<service>` wraps in `infisical run` so secrets (DATABASE*URL*\*, BUDGET_KEK, BETTER_AUTH_SECRET) interpolate. Plain `docker compose up -d <service>` fails with "DATABASE_URL_MIGRATOR required" — secrets live in Infisical, not `.env`.

- i18n JSON edits (`apps/web/messages/*.json`) → rebuild `web` (bundled at build time).
- Email template edits (`packages/platform/src/email/templates.ts`) → rebuild `api` + `worker`.

## graphify

Knowledge graph at `graphify-out/`.

- Before architecture/codebase questions, read `graphify-out/GRAPH_REPORT.md` (god nodes, communities).
- If `graphify-out/wiki/index.md` exists, navigate it instead of raw files.
- Cross-module "how does X relate to Y" — prefer `graphify query`, `graphify path`, `graphify explain` over grep (traverses EXTRACTED + INFERRED edges).
- After modifying code, run `graphify update .` (AST-only, no API cost).
