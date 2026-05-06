# Budget — Family Budgeting & Wealth Tracker

Web app that replaces an advanced personal Excel budget with a multi-tenant SaaS for households.

## Tech Stack

See `CLAUDE.md` for the full technology stack lockfile, including version pins and rationale.

Key picks: Bun + Hono (API) · Next.js 16 App Router (web) · Drizzle ORM + Postgres + RLS (DB) · Better Auth (auth) · Dinero.js v2 (money) · Temporal API (dates) · pg-boss (jobs) · Vercel AI SDK (LLM) · Serwist (PWA) · bun:test + Vitest + Playwright (testing).

## Dev Quickstart

Get the full stack running with a single sequence (PLAT-02: target <90s on cold cache).
Requires Docker and `docker compose` v2.

```bash
# 1. Copy env template and fill in secrets (first time only)
cp .env.example .env
# Edit .env and replace placeholder values with generated secrets:
#   openssl rand -base64 32   # for BUDGET_KEK and BETTER_AUTH_SECRET
#   openssl rand -hex 16      # for role passwords

# 2. Start all services (db + migrator + api + web + worker + mailpit)
# Equivalent to: docker compose up -d --wait
bash scripts/dev.sh up

# 3. Run DB migrations (first time or after schema changes)
bash scripts/dev.sh migrate

# 4. Seed dev fixtures (alice@example.com + bob@example.com)
bash scripts/dev.sh seed
```

Services once healthy:

- **API**: http://localhost:3001
- **Web**: http://localhost:3000
- **Mailpit** (dev email inbox): http://localhost:8025

### Dev shortcuts (`scripts/dev.sh`)

```bash
bash scripts/dev.sh up        # Start all services
bash scripts/dev.sh down      # Stop containers (keep volumes)
bash scripts/dev.sh logs api  # Tail service logs
bash scripts/dev.sh migrate   # Run drizzle-kit migrate
bash scripts/dev.sh seed      # Seed dev fixtures
bash scripts/dev.sh reset     # Full reset: down -v + up + migrate + seed
bash scripts/dev.sh psql      # Open psql shell (postgres user)
```

### Pitfall 7 — Bun + Next.js native dev (without Docker)

If Docker is unavailable, you can run services natively. You still need a running Postgres
instance (e.g. `brew services start postgresql`). Then:

```bash
bun install
DATABASE_URL_APP=... DATABASE_URL_MIGRATOR=... bun run apps/api/src/server.ts
# In another terminal:
cd apps/web && bun run dev
```

See `apps/web/README.md` for Next.js-specific dev notes.

## Local Development

```bash
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

| Variable                | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `DATABASE_URL_APP`      | Postgres DSN for the app role (RLS-enforced)         |
| `DATABASE_URL_WORKER`   | Postgres DSN for the worker role                     |
| `DATABASE_URL_MIGRATOR` | Postgres DSN for migrations (elevated)               |
| `BETTER_AUTH_SECRET`    | Auth session signing secret (32+ chars)              |
| `BETTER_AUTH_URL`       | Auth server base URL                                 |
| `APP_URL`               | Frontend base URL                                    |
| `BUDGET_KEK`            | Crypto-shredding key-encryption key (32-byte base64) |
| `REGION`                | Deployment region (e.g. `eu-central-1`)              |

## Architecture

Hexagonal (ports & adapters) per bounded context. See `.planning/phases/01-foundations/01-CONTEXT.md` for architecture decisions.

Domain layers never import ORM, HTTP framework, or AI SDK directly — enforced by `dependency-cruiser` CI gate.
