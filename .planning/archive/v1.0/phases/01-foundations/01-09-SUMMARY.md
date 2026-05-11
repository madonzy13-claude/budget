---
phase: 01-foundations
plan: "09"
subsystem: infrastructure
tags: [docker-compose, postgres, infra, devex, security]
dependency_graph:
  requires: [01.02, 01.03, 01.05, 01.07, 01.08]
  provides: [docker-compose-stack]
  affects: [all services — single-command dev stack]
tech_stack:
  added:
    - postgres:17-alpine (DB container)
    - axllent/mailpit:latest (dev SMTP capture)
  patterns:
    - service_completed_successfully dependency chain (migrator → api/worker)
    - docker-entrypoint-initdb.d shell wrapper for templated SQL init (PC-19)
    - pg_advisory_lock for migration serialisation (D-18, Pitfall 1)
    - NOBYPASSRLS on all DB roles (T-3)
key_files:
  created:
    - docker-compose.yml
    - docker-compose.override.yml.example
    - infra/postgres/init/00-roles.sh
    - infra/postgres/init/00-roles.sql.tpl
    - infra/postgres/init/01-schemas.sql
    - infra/postgres/init/02-grants.sql
    - infra/postgres/postgresql.conf
    - scripts/dev.sh
    - scripts/seed-dev.ts
    - tests/compose-up.sh
  modified:
    - .env.example (expanded with all compose vars)
    - .gitignore (docker-compose.override.yml added)
    - README.md (Dev Quickstart section added)
decisions:
  - Used postgres:17-alpine per RESEARCH truths (uuid_generate_v7 native)
  - API external port 3001 maps to internal 4000 (Dockerfile EXPOSE 4000)
  - NOBYPASSRLS on all 3 roles — no role can bypass RLS policies (T-3)
  - comparison schema created but NOT granted to app_role/worker_role in Phase 1
  - mailpit on 1025/8025 for dev SMTP capture (no Resend required locally)
  - pgAdmin rejected in favour of docker compose exec db psql (lighter, no browser session)
  - seed-dev.ts seeds via HTTP API (not raw Drizzle) to exercise real auth flows (T-13)
metrics:
  duration: ~18 minutes
  completed: "2026-05-06"
  tasks_completed: 5
  files_created: 11
  files_modified: 3
---

# Phase 01 Plan 09: Docker Compose Stack Summary

**One-liner:** Six-service compose stack (postgres:17-alpine + migrator + api + web + worker + mailpit) with PC-19 role-templating via psql -v variables, NOBYPASSRLS enforcement, and `service_completed_successfully` dependency chain.

## Tasks Completed

| Task     | Description                                                                           | Commit  |
| -------- | ------------------------------------------------------------------------------------- | ------- |
| 01.09.01 | PC-19 postgres init scripts (00-roles.sh, .sql.tpl, schemas, grants, postgresql.conf) | ce42fb1 |
| 01.09.02 | docker-compose.yml — 6-service dev stack                                              | 96ec884 |
| 01.09.03 | .env.example updated with all compose vars                                            | 2af880c |
| 01.09.04 | scripts/dev.sh, seed-dev.ts, override.yml.example, .gitignore                         | 9f7919b |
| 01.09.05 | tests/compose-up.sh smoke test + README Dev Quickstart                                | c863dcf |

## What Was Built

### docker-compose.yml

Six services in dependency order:

1. `db` — postgres:17-alpine with initdb.d init, healthcheck `pg_isready`
2. `migrator` — one-shot (restart: no), depends on `db` healthy, exits 0 after migrate
3. `api` — depends on `migrator service_completed_successfully` + `db` healthy
4. `worker` — depends on `migrator service_completed_successfully`
5. `web` — depends on `api` healthy; healthcheck probes `/en/health`
6. `mailpit` — SMTP capture on 1025, web UI on 8025

### PC-19: Password templating

`infra/postgres/init/00-roles.sh` (executable) is auto-run by docker-entrypoint-initdb.d. It reads `APP_ROLE_PASSWORD`, `WORKER_ROLE_PASSWORD`, `MIGRATOR_ROLE_PASSWORD` from env and calls:

```
psql -v app_pwd="$APP_ROLE_PASSWORD" -v worker_pwd="..." -v migrator_pwd="..." -f 00-roles.sql.tpl
```

`00-roles.sql.tpl` uses `quote_literal(:'app_pwd')` — psql variables, never hardcoded passwords (T-14).

### T-3: NOBYPASSRLS

All 3 roles (`app_role`, `worker_role`, `migrator`) explicitly declare `NOBYPASSRLS`. No role can bypass RLS policies. Verified: 8 occurrences of `NOBYPASSRLS` in the template; 0 bare `BYPASSRLS` occurrences.

### Schema bootstrap (D-17)

`01-schemas.sql` creates: `identity`, `tenancy`, `shared_kernel`, `comparison` (all `IF NOT EXISTS`, owned by `migrator`).
`02-grants.sql` grants `USAGE` on identity/tenancy/shared_kernel to app_role and worker_role. `comparison` schema has **no grants** in Phase 1 (reserved for future comparison_role).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] API internal port is 4000, not 3001**

- **Found during:** Task 2
- **Issue:** `apps/api/src/server.ts` exports `port: 4000`; the plan spec said `ports 3001:3001`
- **Fix:** Mapped compose port `3001:4000` (external:internal) so the dev URL stays `http://localhost:3001`
- **Files modified:** docker-compose.yml

**2. [Rule 2 - Missing] Removed obsolete `version:` from compose file**

- **Found during:** Task 2 — docker compose warning "version attribute is obsolete"
- **Fix:** Removed `version: "3.9"` line
- **Files modified:** docker-compose.yml

## Threat Surface Scan

No new network endpoints or auth paths introduced beyond those already specified in the plan's threat model. All new surfaces (postgres:5432, mailpit:1025/8025) are dev-only.

## Self-Check: PASSED

All 11 created files verified present. All 5 task commits verified in git log (ce42fb1, 96ec884, 2af880c, 9f7919b, c863dcf).
