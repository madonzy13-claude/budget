# Budget — Family Budgeting & Wealth Tracker

Web app that replaces an advanced personal Excel budget with a multi-tenant SaaS for households.

## Tech Stack

See `CLAUDE.md` for the full technology stack lockfile, including version pins and rationale.

Key picks: Bun + Hono (API) · Next.js 16 App Router (web) · Drizzle ORM + Postgres + RLS (DB) · Better Auth (auth) · Dinero.js v2 (money) · Temporal API (dates) · pg-boss (jobs) · Vercel AI SDK (LLM) · Serwist (PWA) · bun:test + Vitest + Playwright (testing).

## Local Development

```bash
# Start all services (postgres + api + web + worker)
docker compose up

# Install dependencies
bun install

# Run backend tests
bun test

# Run frontend tests
cd apps/web && bunx vitest run

# Type-check all packages
bun run typecheck

# Lint
bun run lint

# Dependency architecture gate (D-27)
bun run depcheck
```

## Single-Region v1 (PLAT-11)

v1 ships single-region (region selection deferred to v1.x per PLAT-11). The `REGION` env var documents the chosen region for ops; multi-region routing is NOT in v1. Set `REGION=eu-central-1` (or your preferred region) in `.env`.

## Environment Variables

Copy `.env.example` to `.env` and fill in real values. **Never commit `.env`** — it is gitignored.

Required vars:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_APP` | Postgres DSN for the app role (RLS-enforced) |
| `DATABASE_URL_WORKER` | Postgres DSN for the worker role |
| `DATABASE_URL_MIGRATOR` | Postgres DSN for migrations (elevated) |
| `BETTER_AUTH_SECRET` | Auth session signing secret (32+ chars) |
| `BETTER_AUTH_URL` | Auth server base URL |
| `APP_URL` | Frontend base URL |
| `BUDGET_KEK` | Crypto-shredding key-encryption key (32-byte base64) |
| `REGION` | Deployment region (e.g. `eu-central-1`) |

## Architecture

Hexagonal (ports & adapters) per bounded context. See `.planning/phases/01-foundations/01-CONTEXT.md` for architecture decisions.

Domain layers never import ORM, HTTP framework, or AI SDK directly — enforced by `dependency-cruiser` CI gate.
