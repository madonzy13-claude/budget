---
phase: 01-foundations
plan: 09
plan_id: 01.09
type: execute
wave: 3
depends_on: ["01.02", "01.03", "01.05", "01.07", "01.08"]
files_modified:
  - docker-compose.yml
  - docker-compose.override.yml.example
  - .env.example
  - infra/postgres/init/00-roles.sh
  - infra/postgres/init/00-roles.sql.tpl
  - infra/postgres/init/01-schemas.sql
  - infra/postgres/init/02-grants.sql
  - infra/postgres/postgresql.conf
  - scripts/dev.sh
  - scripts/seed-dev.ts
  - tests/compose-up.sh
  - README.md
autonomous: true
requirements: [PLAT-02, PLAT-12]
provides:
  - Single-command dev stack via `docker compose up`
  - Postgres 17 init SQL creating app_role + worker_role + migrator (all NOBYPASSRLS) and four schemas
  - Dev SMTP capture via mailpit for StdoutEmailSender → SMTP fallback
  - Compose smoke test validating all services healthy under 90s
  - scripts/dev.sh shortcuts: up / down / logs / migrate / seed / reset
  - PC-19: 00-roles.sh shell wrapper that templates passwords from env into 00-roles.sql.tpl, then runs psql with -v variables
must_haves:
  truths:
    - "docker compose up brings db, migrator, api, web, worker, mailpit to healthy in <90s on Linux/macOS dev laptop (PLAT-02)"
    - "PC-19: infra/postgres/init/00-roles.sh is the entrypoint script (auto-run by Postgres image's docker-entrypoint-initdb.d) — it reads APP_ROLE_PASSWORD / WORKER_ROLE_PASSWORD / MIGRATOR_ROLE_PASSWORD from env and runs `psql -v app_pwd=$APP_ROLE_PASSWORD -v worker_pwd=$WORKER_ROLE_PASSWORD -v migrator_pwd=$MIGRATOR_ROLE_PASSWORD -f /docker-entrypoint-initdb.d/00-roles.sql.tpl`"
    - "PC-19: 00-roles.sql.tpl uses :'app_pwd' / :'worker_pwd' / :'migrator_pwd' psql variables — no hardcoded passwords"
    - "PC-19: docker-compose.yml passes APP_ROLE_PASSWORD / WORKER_ROLE_PASSWORD / MIGRATOR_ROLE_PASSWORD env vars from .env to the db service"
    - "infra/postgres/init/00-roles.sql.tpl creates app_role, worker_role, migrator — all explicitly declared NOBYPASSRLS (D-18, T-3 mitigation)"
    - "infra/postgres/init/01-schemas.sql creates identity, tenancy, shared_kernel, comparison schemas (D-17)"
    - "infra/postgres/init/02-grants.sql grants USAGE per role per schema; comparison schema accessible only by future comparison_role"
    - "migrator service runs apps/migrator with pg_advisory_lock + drizzle-kit migrate (NEVER push) per Pitfall 1, D-18, schema_push_requirement"
    - "api service depends_on migrator with condition: service_completed_successfully (drizzle migrate exits 0 before api boots)"
    - "web service depends_on api healthy"
    - "worker service depends_on migrator completed"
    - "mailpit captures dev SMTP; StdoutEmailSender (plan 05) optionally targets mailpit:1025 for visible inbox"
    - "psql convenience: choose psql shell embedded in db service via docker exec — pgAdmin REJECTED (heavier image, browser session adds attack surface, dev cycle slower than psql)"
    - "All secrets in compose come from .env (committed sample is .env.example only — never .env)"
    - ".gitignore blocks .env (verified in plan 00) AND docker-compose.override.yml"
    - "docker-compose.override.yml.example documents developer-local overrides (port mapping, custom volumes) without committing real secrets"
    - "Compose timing target: services-healthy < 90s on cold cache (PLAT-02 dev quickstart)"
    - "scripts/dev.sh provides up/down/logs/migrate/seed/reset/psql shortcuts (single source of dev verbs)"
    - "infra/postgres/postgresql.conf sets log_statement=ddl + shared_preload_libraries=pg_stat_statements for dev observability"
    - "T-12 mitigation: zero real secrets in docker-compose.yml; values pulled from .env which is git-ignored"
    - "T-3 mitigation: SQL `CREATE ROLE` statements explicitly include NOBYPASSRLS; init SQL is idempotent via `DO $$ ... $$ IF NOT EXISTS` blocks"
  artifacts:
    - path: docker-compose.yml
      provides: "Dev stack: db + migrator + api + web + worker + mailpit (D-30, PLAT-02)"
      contains: "service_completed_successfully"
    - path: infra/postgres/init/00-roles.sh
      provides: "PC-19: shell wrapper that runs psql -v with passwords from env, executes 00-roles.sql.tpl"
      contains: "psql -v app_pwd"
    - path: infra/postgres/init/00-roles.sql.tpl
      provides: "psql template — uses :'app_pwd' / :'worker_pwd' / :'migrator_pwd' variables; NOBYPASSRLS for all"
      contains: "NOBYPASSRLS"
    - path: infra/postgres/init/01-schemas.sql
      provides: "identity, tenancy, shared_kernel, comparison schema creation (D-17)"
      contains: "CREATE SCHEMA"
    - path: infra/postgres/init/02-grants.sql
      provides: "Per-role per-schema USAGE grants; cross-schema grants forbidden"
      contains: "GRANT USAGE"
    - path: scripts/dev.sh
      provides: "Single source of dev verbs: up/down/logs/migrate/seed/reset/psql"
      contains: "migrate"
    - path: tests/compose-up.sh
      provides: "Smoke test: docker compose up --wait + curl health endpoints"
      contains: "docker compose up"
    - path: docker-compose.override.yml.example
      provides: "Developer-local overrides template (port mapping, named volumes)"
      contains: "services:"
    - path: .env.example
      provides: "Enumerates dev compose env vars with safe placeholders"
      contains: "POSTGRES_PASSWORD="
  key_links:
    - from: "docker-compose.yml api service"
      to: "docker-compose.yml migrator service"
      via: "depends_on.migrator.condition: service_completed_successfully"
      pattern: "service_completed_successfully"
    - from: "docker-compose.yml db service"
      to: "infra/postgres/init/*.sh + *.sql"
      via: "/docker-entrypoint-initdb.d mount"
      pattern: "/docker-entrypoint-initdb.d"
    - from: "infra/postgres/init/00-roles.sh"
      to: "infra/postgres/init/00-roles.sql.tpl"
      via: "psql -v -f"
      pattern: "00-roles.sql.tpl"
    - from: "scripts/dev.sh migrate"
      to: "docker-compose.yml migrator service"
      via: "docker compose run --rm migrator"
      pattern: "compose run --rm migrator"
    - from: "tests/compose-up.sh"
      to: "apps/web /[locale]/health (plan 08)"
      via: "curl http://localhost:3000/en/health"
      pattern: "/en/health"
---

<read_first>

- .planning/phases/01-foundations/01-CONTEXT.md (D-18 migration role, D-30 compose stack)
- .planning/phases/01-foundations/01-RESEARCH.md §Pattern 10, §Pitfall 1, §Pattern 6
- .planning/phases/01-foundations/01-02-SUMMARY.md (apps/migrator role separation, advisory lock signature)
- .planning/phases/01-foundations/01-03-SUMMARY.md (apps/worker entrypoint, pg-boss schema)
- .planning/phases/01-foundations/01-07-SUMMARY.md (apps/api Dockerfile signature)
- .planning/phases/01-foundations/01-08-SUMMARY.md (apps/web Dockerfile signature, /en/health route)
- CLAUDE.md (Postgres ≥17 supports SKIP LOCKED + JSONB; Bun 1.2.x base image)
- Postgres docker-entrypoint-initdb.d behavior: scripts ending in `.sh` are executed; `.sql` files are run via psql automatically — `.sql.tpl` files are NOT auto-run, allowing the shell wrapper to template them.
  </read_first>

<truths>
- Postgres image: postgres:17-alpine (Postgres 17 ships uuid_generate_v7 natively per RESEARCH §A5; matches drizzle/drizzle-kit support)
- Mailpit image: axllent/mailpit:latest (lightweight; SMTP on 1025, web UI on 8025)
- pgAdmin REJECTED in favor of `docker compose exec db psql` (lighter, faster, less attack surface in dev)
- D-30: services are db, migrator (one-shot), api, web, worker — Phase 1 ALSO includes mailpit for visible dev inbox
- Pitfall 1 + schema_push_requirement: migrator runs `drizzle-kit migrate` — NEVER `drizzle-kit push`
- D-18: migrator role uses pg_advisory_lock(hashtext('budget-migrations')) — declared in plan 02; this plan only invokes the migrator service
- T-12 (compose dev secrets): real secrets live in .env (git-ignored); docker-compose.yml references ${VAR}; .env.example ships safe placeholders only
- T-3 (BYPASSRLS): roles declared NOBYPASSRLS in 00-roles.sql.tpl; plan 10 verifies via pg_roles query
- PLAT-02 healthy timing: 90s cold cache target on Linux/macOS dev laptops; documented in README dev quickstart
- PC-19: Postgres docker-entrypoint-initdb.d runs scripts in lexical order; .sh files are executed by the entrypoint, .sql files are auto-piped through psql. We use 00-roles.sh (executable) which templates and runs 00-roles.sql.tpl (NOT auto-run because of the .tpl extension). Subsequent files (01-schemas.sql, 02-grants.sql) are auto-run by the entrypoint after 00-roles.sh completes.
</truths>

<acceptance_criteria>

- [ ] `test -f docker-compose.yml`
- [ ] `test -f docker-compose.override.yml.example && test ! -f docker-compose.override.yml`
- [ ] `grep -E "image: postgres:17" docker-compose.yml` exits 0
- [ ] `grep -E "image: axllent/mailpit" docker-compose.yml` exits 0
- [ ] PC-19: `test -x infra/postgres/init/00-roles.sh` exits 0 (executable shell wrapper)
- [ ] PC-19: `test -f infra/postgres/init/00-roles.sql.tpl` exits 0 (NOT 00-roles.sql — that would be auto-run with literal `:'app_pwd'` strings instead of templated values)
- [ ] PC-19: shell wrapper invokes psql with -v variables: `grep -E "psql.*-v\s+app_pwd=\\\\\"\\\\\$APP_ROLE_PASSWORD\\\\\"" infra/postgres/init/00-roles.sh || grep -F 'psql -v app_pwd' infra/postgres/init/00-roles.sh` exits 0
- [ ] PC-19: shell wrapper references all three password env vars: `for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do grep -F "$v" infra/postgres/init/00-roles.sh; done` exits 0
- [ ] PC-19: 00-roles.sql.tpl uses psql variables: `grep -F ":'app_pwd'" infra/postgres/init/00-roles.sql.tpl && grep -F ":'worker_pwd'" infra/postgres/init/00-roles.sql.tpl && grep -F ":'migrator_pwd'" infra/postgres/init/00-roles.sql.tpl` exits 0
- [ ] PC-19: docker-compose.yml passes the password env vars to the db service: `for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do grep -F "$v" docker-compose.yml; done` exits 0
- [ ] `grep -E "NOBYPASSRLS" infra/postgres/init/00-roles.sql.tpl` returns 3+ lines
- [ ] `grep -E "BYPASSRLS" infra/postgres/init/00-roles.sql.tpl | grep -v NOBYPASSRLS | grep -v '^--' | wc -l` returns 0
- [ ] `grep -E "CREATE SCHEMA.*identity" infra/postgres/init/01-schemas.sql` exits 0
- [ ] `grep -E "CREATE SCHEMA.*tenancy" infra/postgres/init/01-schemas.sql` exits 0
- [ ] `grep -E "CREATE SCHEMA.*shared_kernel" infra/postgres/init/01-schemas.sql` exits 0
- [ ] `grep -E "CREATE SCHEMA.*comparison" infra/postgres/init/01-schemas.sql` exits 0
- [ ] `grep -E "service_completed_successfully" docker-compose.yml` exits 0
- [ ] `grep -E "drizzle-kit push" docker-compose.yml` returns nothing
- [ ] migrator service command/entrypoint references `migrate`
- [ ] No real secret literals in docker-compose.yml: all secret values are `${VAR}` references
- [ ] .env.example contains POSTGRES_PASSWORD, APP_ROLE_PASSWORD, WORKER_ROLE_PASSWORD, MIGRATOR_ROLE_PASSWORD, BUDGET_KEK, BETTER_AUTH_SECRET placeholders
- [ ] scripts/dev.sh is executable AND contains up/down/logs/migrate/seed/reset/psql case branches
- [ ] tests/compose-up.sh is executable
- [ ] README.md has a "Dev Quickstart" section
- [ ] `docker compose config` exits 0
- [ ] Smoke test: `bash tests/compose-up.sh` exits 0 within 90s wall-clock (PLAT-02)
      </acceptance_criteria>

<tasks>

<task id="01.09.01" type="auto">
  <description>PC-19: Author infra/postgres/init/00-roles.sh as an executable shell wrapper that templates passwords from env into the SQL. The Postgres image's docker-entrypoint-initdb.d will execute *.sh files (with bash) and auto-pipe *.sql files through psql; we name the template `.sql.tpl` so it is NOT auto-run, and the shell wrapper takes responsibility. Steps for 00-roles.sh: `set -euo pipefail`; check that APP_ROLE_PASSWORD, WORKER_ROLE_PASSWORD, MIGRATOR_ROLE_PASSWORD are set (fail with helpful message if not); run `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_pwd="$APP_ROLE_PASSWORD" -v worker_pwd="$WORKER_ROLE_PASSWORD" -v migrator_pwd="$MIGRATOR_ROLE_PASSWORD" -f /docker-entrypoint-initdb.d/00-roles.sql.tpl`. Make it executable: `chmod +x`. Author 00-roles.sql.tpl using psql variables: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_role') THEN EXECUTE 'CREATE ROLE app_role LOGIN PASSWORD ' || quote_literal(:'app_pwd') || ' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE'; END IF; END $$;` — repeat for worker_role and migrator (migrator needs CREATEDB on its own dev DB but stays NOBYPASSRLS). Author 01-schemas.sql: `CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION migrator;` repeated for tenancy, shared_kernel, comparison. Author 02-grants.sql: `GRANT USAGE ON SCHEMA identity TO app_role, worker_role;` for identity/tenancy/shared_kernel; comparison schema gets NO grants in Phase 1. Add a custom postgresql.conf (log_statement=ddl, max_connections=100). Add comments referencing T-3 / PC-19 mitigation.</description>
  <files>infra/postgres/init/00-roles.sh, infra/postgres/init/00-roles.sql.tpl, infra/postgres/init/01-schemas.sql, infra/postgres/init/02-grants.sql, infra/postgres/postgresql.conf</files>
  <verify>
    <automated>bash -c 'set -e; test -x infra/postgres/init/00-roles.sh; test -f infra/postgres/init/00-roles.sql.tpl; test ! -f infra/postgres/init/00-roles.sql; grep -F "set -euo pipefail" infra/postgres/init/00-roles.sh; for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do grep -F "$v" infra/postgres/init/00-roles.sh; done; grep -F "psql" infra/postgres/init/00-roles.sh; grep -F "00-roles.sql.tpl" infra/postgres/init/00-roles.sh; grep -F ":\x27app_pwd\x27" infra/postgres/init/00-roles.sql.tpl; grep -F ":\x27worker_pwd\x27" infra/postgres/init/00-roles.sql.tpl; grep -F ":\x27migrator_pwd\x27" infra/postgres/init/00-roles.sql.tpl; test "$(grep -c NOBYPASSRLS infra/postgres/init/00-roles.sql.tpl)" -ge 3; test "$(grep -v NOBYPASSRLS infra/postgres/init/00-roles.sql.tpl | grep -v "^--" | grep -c BYPASSRLS)" -eq 0; for s in identity tenancy shared_kernel comparison; do grep -qE "CREATE SCHEMA IF NOT EXISTS $s" infra/postgres/init/01-schemas.sql; done; for s in identity tenancy shared_kernel; do grep -qE "GRANT USAGE ON SCHEMA $s" infra/postgres/init/02-grants.sql; done; ! grep -E "GRANT.*comparison.*TO (app_role|worker_role)" infra/postgres/init/02-grants.sql; bash -n infra/postgres/init/00-roles.sh'</automated>
  </verify>
  <deps>01.02</deps>
</task>

<task id="01.09.02" type="auto">
  <description>Author docker-compose.yml with six services. (1) `db`: postgres:17-alpine, env POSTGRES_USER=postgres POSTGRES_PASSWORD=${POSTGRES_PASSWORD} POSTGRES_DB=budget AND APP_ROLE_PASSWORD=${APP_ROLE_PASSWORD} WORKER_ROLE_PASSWORD=${WORKER_ROLE_PASSWORD} MIGRATOR_ROLE_PASSWORD=${MIGRATOR_ROLE_PASSWORD} (PC-19: passed through to the init shell wrapper); volume named budget_db_data; mounts ./infra/postgres/init:/docker-entrypoint-initdb.d:ro and ./infra/postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro; healthcheck `pg_isready -U postgres -d budget` interval 2s timeout 1s retries 30. (2) `migrator`: builds apps/migrator/Dockerfile; env DATABASE_URL_MIGRATOR=${DATABASE_URL_MIGRATOR}; depends_on db service_healthy; restart: 'no' (one-shot); command runs the apps/migrator/src/migrate.ts entry that calls drizzle-kit migrate + post-migration.sql (NEVER push). (3) `api`: builds apps/api/Dockerfile; env DATABASE_URL_APP=${DATABASE_URL_APP} BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET} BETTER_AUTH_URL=${BETTER_AUTH_URL} BUDGET_KEK=${BUDGET_KEK} APP_URL=http://localhost:3000 EMAIL_SMTP_HOST=mailpit EMAIL_SMTP_PORT=1025 OTEL_SERVICE_NAME=api; depends_on migrator service_completed_successfully + db service_healthy + mailpit started; ports 3001:3001; healthcheck curl http://localhost:3001/health. (4) `web`: builds apps/web/Dockerfile; env NEXT_PUBLIC_API_URL=http://api:3001; depends_on api service_healthy; ports 3000:3000; healthcheck curl http://localhost:3000/en/health. (5) `worker`: builds apps/worker/Dockerfile; env DATABASE_URL_WORKER=${DATABASE_URL_WORKER} BUDGET_KEK=${BUDGET_KEK}; depends_on migrator service_completed_successfully + db service_healthy. (6) `mailpit`: axllent/mailpit:latest; ports 8025:8025 (UI) 1025:1025 (SMTP). All secret-bearing env entries reference ${VAR} ONLY — zero literal secrets. NO drizzle-kit push anywhere.</description>
  <files>docker-compose.yml</files>
  <verify>
    <automated>bash -c 'set -e; docker compose -f docker-compose.yml config >/dev/null; for svc in db migrator api web worker mailpit; do grep -qE "^  $svc:" docker-compose.yml || { echo "missing service $svc"; exit 1; }; done; grep -q "service_completed_successfully" docker-compose.yml; grep -q "/docker-entrypoint-initdb.d" docker-compose.yml; for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do grep -F "$v" docker-compose.yml; done; ! grep -E "drizzle-kit push" docker-compose.yml; ! grep -E "(secret|password|key|kek)\\s*[:=]\\s*[\\x27\\x22]?[A-Za-z0-9+/=]{20,}" docker-compose.yml'</automated>
  </verify>
  <deps>01.09.01, 01.02, 01.03, 01.07, 01.08</deps>
</task>

<task id="01.09.03" type="auto">
  <description>Update .env.example (created in plan 00) to enumerate every variable docker-compose.yml references. Add: POSTGRES_PASSWORD=changeme-dev-only, APP_ROLE_PASSWORD=changeme-dev-only, WORKER_ROLE_PASSWORD=changeme-dev-only, MIGRATOR_ROLE_PASSWORD=changeme-dev-only, DATABASE_URL_APP=postgresql://app_role:changeme-dev-only@db:5432/budget, DATABASE_URL_MIGRATOR=postgresql://migrator:changeme-dev-only@db:5432/budget, DATABASE_URL_WORKER=postgresql://worker_role:changeme-dev-only@db:5432/budget, BUDGET_KEK= (32-byte base64 — generation command in comment: `openssl rand -base64 32`), BETTER_AUTH_SECRET= (generation command in comment: `openssl rand -base64 32`), BETTER_AUTH_URL=http://localhost:3001, APP_URL=http://localhost:3000, NEXT_PUBLIC_API_URL=http://localhost:3001, EMAIL_SMTP_HOST=mailpit, EMAIL_SMTP_PORT=1025, REGION=eu-central-1. Every value is a placeholder; the comment block at the top warns: "NEVER COMMIT real .env — copy to .env locally". Verify .gitignore blocks .env (set in plan 00).</description>
  <files>.env.example</files>
  <verify>
    <automated>bash -c 'set -e; for v in POSTGRES_PASSWORD APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD DATABASE_URL_APP DATABASE_URL_MIGRATOR DATABASE_URL_WORKER BUDGET_KEK BETTER_AUTH_SECRET BETTER_AUTH_URL APP_URL NEXT_PUBLIC_API_URL EMAIL_SMTP_HOST REGION; do grep -qE "^${v}=" .env.example || { echo "missing $v"; exit 1; }; done; grep -qE "^\\.env$" .gitignore || grep -qE "^\\.env\\b" .gitignore; ! test -f .env'</automated>
  </verify>
  <deps>01.09.02</deps>
</task>

<task id="01.09.04" type="auto">
  <description>Author scripts/dev.sh (executable bash) implementing dev verbs as a case statement. Verbs: `up` (docker compose up -d --wait), `down` (docker compose down), `logs <svc>` (docker compose logs -f $svc), `migrate` (docker compose run --rm migrator), `seed` (bun run scripts/seed-dev.ts — one workspace + one shared workspace + two users for dev), `reset` (docker compose down -v && bash scripts/dev.sh up && bash scripts/dev.sh migrate && bash scripts/dev.sh seed), `psql` (docker compose exec db psql -U postgres -d budget). Header pins safety: `set -euo pipefail`. Author scripts/seed-dev.ts using packages/identity + packages/tenancy application services (NOT raw drizzle) to create deterministic dev fixtures. Author docker-compose.override.yml.example documenting common developer-local overrides (port mapping, named volumes, log level) — file is a template, never auto-applied. Add docker-compose.override.yml to .gitignore.</description>
  <files>scripts/dev.sh, scripts/seed-dev.ts, docker-compose.override.yml.example, .gitignore</files>
  <verify>
    <automated>bash -c 'set -e; test -x scripts/dev.sh; for verb in up down logs migrate seed reset psql; do grep -qE "[\"\x27 ]$verb[\"\x27\\)]" scripts/dev.sh || { echo "missing verb $verb"; exit 1; }; done; grep -q "set -euo pipefail" scripts/dev.sh; test -f docker-compose.override.yml.example; grep -qE "^docker-compose\\.override\\.yml$" .gitignore || grep -qE "docker-compose\\.override\\.yml" .gitignore; bash -n scripts/dev.sh'</automated>
  </verify>
  <deps>01.09.02, 01.09.03</deps>
</task>

<task id="01.09.05" type="auto">
  <description>Author tests/compose-up.sh (executable bash; CI smoke gate). Header `set -euo pipefail`. Steps: (1) ensure .env exists locally (CI: copy .env.example → .env with deterministic dev secrets generated via openssl rand). (2) `docker compose up -d --wait --wait-timeout 120` — fails if any service fails healthcheck within 120s. (3) Record timestamps for PLAT-02 90s target: log start + healthy times. (4) Sanity probes: curl http://localhost:3001/health (api → expect 200), curl http://localhost:3000/en/health (web → expect 200 with status:ok JSON), curl http://localhost:8025/api/v1/info (mailpit), psql connection probe to db as app_role. (5) On any failure: dump `docker compose logs --tail 100 db migrator api web worker` and exit 1. (6) Always teardown: `trap 'docker compose down -v' EXIT`. Update README.md with a "Dev Quickstart" section pinning the canonical sequence: `cp .env.example .env` → `bash scripts/dev.sh up` → `bash scripts/dev.sh migrate` → `bash scripts/dev.sh seed`. Document the 90s target + Pitfall 7 fallback (Bun + Next dev) — link to apps/web/README.md.</description>
  <files>tests/compose-up.sh, README.md</files>
  <verify>
    <automated>bash -c 'set -e; test -x tests/compose-up.sh; grep -q "docker compose up -d --wait" tests/compose-up.sh; grep -q "/en/health" tests/compose-up.sh; grep -q "trap" tests/compose-up.sh; grep -q "set -euo pipefail" tests/compose-up.sh; grep -q "Dev Quickstart\\|## Dev" README.md; grep -q "docker compose up" README.md; grep -q "scripts/dev.sh" README.md; bash -n tests/compose-up.sh'</automated>
  </verify>
  <deps>01.09.04</deps>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                                 | Description                                                         |
| ---------------------------------------- | ------------------------------------------------------------------- |
| Developer host → docker compose          | dev secrets pass through .env (git-ignored)                         |
| Postgres init → role creation            | one-time DDL bootstrap of NOBYPASSRLS roles via PC-19 shell wrapper |
| api/web/worker containers → db container | DB connections via service-name DNS only                            |

## STRIDE Threat Register

| Threat ID | Category                   | Component                                                   | Disposition                                  | Mitigation Plan                                                                                                                                                                                               |
| --------- | -------------------------- | ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-12      | I (Information disclosure) | docker-compose.yml committed to git                         | mitigated                                    | Every secret referenced as `${VAR}`; .env is git-ignored; .env.example ships safe placeholders only; CI grep gate blocks accidental literal-secret commits                                                    |
| T-3       | E (Elevation of privilege) | Postgres roles created at init                              | mitigated                                    | infra/postgres/init/00-roles.sh shell wrapper templates env passwords into 00-roles.sql.tpl with explicit NOBYPASSRLS for all 3 roles; plan 10 verifies via `pg_roles WHERE rolbypassrls=true` returns 0 rows |
| T-1       | I                          | Cross-tenant leak via misconfigured app_role                | mitigated (transferred to plan 02 + plan 10) | This plan only ensures roles boot NOBYPASSRLS; plan 02 enforces FORCE ROW LEVEL SECURITY; plan 10 is the leak-CI gate                                                                                         |
| T-13      | T                          | Greenwashed dev tests against an empty DB                   | mitigated                                    | scripts/seed-dev.ts seeds two users + one PRIVATE + one SHARED workspace using application services                                                                                                           |
| T-14      | I                          | PC-19: hardcoded passwords in 00-roles.sql leaking via repo | mitigated                                    | 00-roles.sql.tpl uses psql variables; passwords supplied via env at container start by 00-roles.sh; nothing in the repo holds a real password                                                                 |

</threat_model>

<verification>
Run from repo root; each must exit 0 (CI smoke runs the full sequence):

```bash
bash -c '
set -e
# 1. Files
test -f docker-compose.yml
test -f docker-compose.override.yml.example
test -x infra/postgres/init/00-roles.sh
test -f infra/postgres/init/00-roles.sql.tpl
test ! -f infra/postgres/init/00-roles.sql
test -f infra/postgres/init/01-schemas.sql
test -f infra/postgres/init/02-grants.sql
test -x scripts/dev.sh
test -x tests/compose-up.sh

# 2. Compose validity
docker compose -f docker-compose.yml config >/dev/null

# 3. NOBYPASSRLS invariant (T-3)
test "$(grep -c NOBYPASSRLS infra/postgres/init/00-roles.sql.tpl)" -ge 3
test "$(grep -v NOBYPASSRLS infra/postgres/init/00-roles.sql.tpl | grep -v "^--" | grep -c BYPASSRLS)" -eq 0

# 4. PC-19 shell wrapper invokes psql with -v variables
grep -F "psql" infra/postgres/init/00-roles.sh
grep -F "00-roles.sql.tpl" infra/postgres/init/00-roles.sh
for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do
  grep -F "$v" infra/postgres/init/00-roles.sh
done

# 5. PC-19 docker-compose passes the password env vars
for v in APP_ROLE_PASSWORD WORKER_ROLE_PASSWORD MIGRATOR_ROLE_PASSWORD; do
  grep -F "$v" docker-compose.yml
done

# 6. Schema declarations
for s in identity tenancy shared_kernel comparison; do
  grep -qE "CREATE SCHEMA IF NOT EXISTS $s" infra/postgres/init/01-schemas.sql || exit 1
done

# 7. comparison schema NOT granted to app_role / worker_role in Phase 1
! grep -E "GRANT.*comparison.*TO (app_role|worker_role)" infra/postgres/init/02-grants.sql

# 8. T-12: zero literal secrets in compose file
! grep -E "(secret|password|kek|key)\\s*[:=]\\s*[\\x27\\x22]?[A-Za-z0-9+/=]{20,}[\\x27\\x22]?" docker-compose.yml

# 9. drizzle-kit push BANNED
! grep -E "drizzle-kit push" docker-compose.yml
! grep -E "drizzle-kit push" scripts/dev.sh

# 10. service_completed_successfully wiring
grep -q "service_completed_successfully" docker-compose.yml

# 11. PLAT-02 dev quickstart in README
grep -q "Dev Quickstart\\|## Dev" README.md
grep -q "docker compose up" README.md

# 12. Smoke (gated to environments with docker; CI only):
if command -v docker >/dev/null && [ "${RUN_COMPOSE_SMOKE:-0}" = "1" ]; then
  bash tests/compose-up.sh
fi

echo "compose plan checks pass"
'
```

</verification>

<success_criteria>

- docker compose up brings db + migrator + api + web + worker + mailpit to healthy in <90s on Linux/macOS
- PC-19: 00-roles.sh shell wrapper templates passwords from env into 00-roles.sql.tpl via psql -v variables; no hardcoded secrets in repo
- app_role, worker_role, migrator created with NOBYPASSRLS verified at SQL level
- Four schemas (identity, tenancy, shared_kernel, comparison) created at init
- Migrator runs apps/migrator (drizzle-kit migrate + post-migration.sql) — never push
- Zero literal secrets in docker-compose.yml; .env.example enumerates all vars
- scripts/dev.sh provides up/down/logs/migrate/seed/reset/psql shortcuts
- tests/compose-up.sh smoke validates the full stack and tears down cleanly
- README documents the dev quickstart with the canonical command sequence
  </success_criteria>

<output>
.planning/phases/01-foundations/01-09-SUMMARY.md
</output>
