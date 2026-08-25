ENV ?= dev

# Load .env.local overrides when present (machine-specific, not committed)
ENV_FILE_LOCAL := $(shell test -f .env.local && echo "--env-file .env.local")
COMPOSE := docker compose --env-file .env $(ENV_FILE_LOCAL)

# Wrap every compose / docker invocation in `infisical run` so the secrets-only
# variables (POSTGRES_PASSWORD, BUDGET_KEK, BETTER_AUTH_SECRET, DATABASE_URL_*, …)
# are injected as environment for compose's variable interpolation. Without this
# the compose CLI prints "The X variable is not set. Defaulting to a blank string."
# warnings on every command because those secrets live in Infisical, not .env.
INFISICAL := infisical run --env=$(ENV) --

.PHONY: dev dev-build build-% stop down destroy logs ps build restart \
        perf-top perf-slow perf-window perf-reset \
        obs-up obs-down obs-traces \
        migrate seed shell-db \
        test test-watch test-e2e test-clean ci-gate \
        lint typecheck fmt \
        secrets secrets-set help

# ── Stack ─────────────────────────────────────────────────────────────────────

dev: ## Start full stack (secrets injected from Infisical)
	$(INFISICAL) $(COMPOSE) up -d

dev-build: ## Build images then start
	$(INFISICAL) $(COMPOSE) up --build -d

# Rebuild + restart ONE service without touching the rest of the stack. Use this
# rather than a bare `docker compose build <svc>`: the web bundle INLINES
# NEXT_PUBLIC_VAPID_PUBLIC_KEY at BUILD time, so a build without Infisical in
# front of it silently ships an image where push notifications cannot be turned
# on at all — no error, just a dead toggle (hit twice, 260803 + 260806). The
# guard below fails loudly instead of shipping that.
build-%: ## Rebuild + recreate ONE service with secrets injected (e.g. make build-web)
	@if [ "$*" = "web" ]; then 		$(INFISICAL) sh -c 'test -n "$$NEXT_PUBLIC_VAPID_PUBLIC_KEY"' 			|| { echo "ERROR: NEXT_PUBLIC_VAPID_PUBLIC_KEY is empty — the web bundle would ship without push. Check Infisical."; exit 1; }; 	fi
	$(INFISICAL) $(COMPOSE) build $*
	$(INFISICAL) $(COMPOSE) up -d --no-deps --force-recreate $*

stop: ## Stop containers, preserve volumes
	$(INFISICAL) $(COMPOSE) stop

down: ## Remove containers, preserve volumes
	$(INFISICAL) $(COMPOSE) down

destroy: ## Remove containers + volumes (full reset)
	$(INFISICAL) $(COMPOSE) down -v

logs: ## Follow all service logs
	$(INFISICAL) $(COMPOSE) logs -f

logs-%: ## Follow one service: make logs-api
	$(INFISICAL) $(COMPOSE) logs -f $*

restart-%: ## Recreate one service (picks up .env changes): make restart-api
	$(INFISICAL) $(COMPOSE) up -d $*

ps: ## Show service status
	$(INFISICAL) $(COMPOSE) ps

build: ## Build images only (no start)
	$(INFISICAL) $(COMPOSE) build

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run migrator manually
	$(INFISICAL) $(COMPOSE) run --rm migrator

seed: ## Seed dev data via HTTP API
	$(INFISICAL) bun run scripts/seed-dev.ts

shell-db: ## Open psql in db container
	$(INFISICAL) $(COMPOSE) exec db psql -U postgres budget

# ── Backups ───────────────────────────────────────────────────────────────────
# Hourly pg_dump → age → Cloudflare R2 (EU). See docs/runbooks/backup-and-restore.md.

backup-now: ## Take one backup immediately (outside the hourly schedule)
	$(INFISICAL) $(COMPOSE) run --rm backup backup.sh

# The age PRIVATE key is passed through ONLY here — never in the compose service
# definition, so the long-running sidecar can write backups it cannot read.
# `-e VAR` with no value forwards it from the Infisical-injected environment.
restore-check: ## Restore the newest backup into a throwaway DB and assert it carries data
	$(INFISICAL) $(COMPOSE) run --rm -e BACKUP_AGE_PRIVATE_KEY backup restore-check.sh

# restore-check proves the BYTES came back. This proves the SYSTEM came back:
# it keeps the restored database and recomputes KEK-keyed email hashes against
# it, which is the difference between "the dump restores" and "people can still
# sign in". Drops the scratch database whether the check passes or fails.
restore-drill: ## Full drill — restore, then prove BUDGET_KEK still matches the data
	@set -e; \
	db=$$($(INFISICAL) $(COMPOSE) run --rm -T \
	        -e BACKUP_AGE_PRIVATE_KEY -e KEEP_RESTORED_DB=1 \
	        backup restore-check.sh | tee /dev/stderr | grep '^RESTORED_DB=' | cut -d= -f2 | tr -d '\r'); \
	test -n "$$db" || { echo "restore-check did not report a database"; exit 1; }; \
	trap "$(INFISICAL) $(COMPOSE) exec -T db psql -U postgres -q -c \"DROP DATABASE IF EXISTS \\\"$$db\\\";\" >/dev/null 2>&1 || true" EXIT; \
	$(INFISICAL) sh -c "PGPASSWORD=\$$POSTGRES_PASSWORD bun scripts/verify-restored-kek.ts $$db"

backup-status: ## Show what is actually in the bucket, per tier
	$(INFISICAL) $(COMPOSE) run --rm --entrypoint sh backup -c '\
	  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
	         RCLONE_S3_NO_CHECK_BUCKET=true \
	         RCLONE_CONFIG_R2_ACCESS_KEY_ID="$$R2_ACCESS_KEY_ID" \
	         RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$$R2_SECRET_ACCESS_KEY" \
	         RCLONE_CONFIG_R2_ENDPOINT="https://$$R2_ACCOUNT_ID.$${R2_JURISDICTION:-eu.}r2.cloudflarestorage.com"; \
	  for t in hourly daily weekly monthly; do \
	    printf "%-8s %s objects, newest %s\n" "$$t" \
	      "$$(rclone lsf r2:$$R2_BUCKET/$$t/ 2>/dev/null | wc -l)" \
	      "$$(rclone lsf r2:$$R2_BUCKET/$$t/ 2>/dev/null | sort | tail -1)"; \
	  done'

# ── Testing ───────────────────────────────────────────────────────────────────

# Scopes are explicit because a bare `bun test` globs apps/web/test too — those
# are VITEST files (vi.*, happy-dom) and bun:test cannot run them. It does not
# merely fail them: something in there never releases the event loop, so the run
# HANGS for ever. A 4-day-old hung `bun test` was found on this box on 260825,
# and because the process never exits, the global afterAll in
# test/global-teardown.ts never fires and the run's data is never cleaned up.
# Web components are covered by `cd apps/web && bunx vitest run`.
# --timeout, not bunfig: bun 1.3.12 ignores a `timeout` key in bunfig.toml, so
# every test ran on the 5000ms default. Integration tests here talk to a real,
# shared Postgres (and testcontainers pull + migrate), so they intermittently
# blew that bound — a different test each run, always at ~5002ms.
test: ## Run backend unit + integration tests (NOT apps/web — that is Vitest)
	$(INFISICAL) bun test --timeout 120000 packages apps/api/test tests

test-watch: ## Run tests in watch mode
	bun test --watch

# Resolve PLAYWRIGHT_BASE_URL from APP_URL (.env.local first, then .env). This
# matches the canonical user-visible host and catches origin/cookie/RLS edge
# cases that don't manifest on localhost. Override by exporting PLAYWRIGHT_BASE_URL.
PLAYWRIGHT_BASE_URL_RESOLVED := $(or \
  $(PLAYWRIGHT_BASE_URL), \
  $(shell test -f .env.local && grep -E '^APP_URL=' .env.local | head -1 | cut -d= -f2-), \
  $(shell test -f .env && grep -E '^APP_URL=' .env | head -1 | cut -d= -f2-), \
  http://localhost:3000)

test-e2e: ## Run Phase 3+ Playwright E2E tests against running stack (uses APP_URL from .env.local, Infisical for DATABASE_URL_APP)
	cd apps/web && $(INFISICAL) sh -c 'PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx bddgen && PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx playwright test'

test-e2e-ui: ## Run Phase 3+ Playwright E2E tests with UI (uses APP_URL from .env.local)
	cd apps/web && $(INFISICAL) sh -c 'PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx bddgen && PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx playwright test --ui'

ci-gate: ## Run tenant-leak CI gate (needs local postgres)
	$(INFISICAL) bun run test:ci-gate

test-clean: ## Remove leaked test postgres containers (orphans from killed test runs)
	@$(INFISICAL) sh -c 'docker ps -aq --filter "label=budget-testcontainer=1" | xargs -r docker rm -fv'
	@echo "leaked testcontainers removed"

# ── Performance ───────────────────────────────────────────────────────────────
# One command for "what is slow". Reads pg_stat_statements, which collects
# cluster-wide since the last reset — on a dev box that includes E2E traffic, so
# read TOTAL time for "where does the DB spend its life" and MEAN for "which
# single query is expensive". PERF_LIMIT=n to widen.
PERF_LIMIT ?= 15

perf-top: ## Top queries by TOTAL execution time (pg_stat_statements)
	@docker exec budget-db-1 psql -U postgres -d budget -c "\
	  SELECT round(total_exec_time::numeric/1000,1) AS total_s, calls, \
	         round(mean_exec_time::numeric,1) AS mean_ms, \
	         left(regexp_replace(query,'\s+',' ','g'),90) AS query \
	  FROM pg_stat_statements \
	  WHERE query NOT LIKE '%pg_stat_statements%' \
	  ORDER BY total_exec_time DESC LIMIT $(PERF_LIMIT);"

perf-slow: ## Slowest queries per call, min 20 calls (pg_stat_statements)
	@docker exec budget-db-1 psql -U postgres -d budget -c "\
	  SELECT round(mean_exec_time::numeric,1) AS mean_ms, calls, \
	         round(total_exec_time::numeric/1000,1) AS total_s, \
	         left(regexp_replace(query,'\s+',' ','g'),90) AS query \
	  FROM pg_stat_statements \
	  WHERE calls >= 20 AND query NOT LIKE '%pg_stat_statements%' \
	  ORDER BY mean_exec_time DESC LIMIT $(PERF_LIMIT);"

perf-window: ## How long pg_stat_statements has been accumulating
	@docker exec budget-db-1 psql -U postgres -d budget -c \
	  "SELECT stats_reset, now()-stats_reset AS age FROM pg_stat_statements_info;"

perf-reset: ## Reset query stats — do this before a measured run
	@docker exec budget-db-1 psql -U postgres -d budget -c "SELECT pg_stat_statements_reset();" >/dev/null
	@echo "pg_stat_statements reset — stats now measure from this point"

# ── Observability (opt-in) ────────────────────────────────────────────────────
# Tracing is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so these targets set
# it AND recreate api/worker — an env change alone does not reach a running
# container.
OTEL_ENDPOINT ?= http://otel-collector:4318

obs-up: ## Start the trace collector and restart api/worker with tracing ON
	$(INFISICAL) $(COMPOSE) --profile obs up -d otel-collector
	OTEL_EXPORTER_OTLP_ENDPOINT=$(OTEL_ENDPOINT) $(INFISICAL) $(COMPOSE) up -d --force-recreate api worker
	@echo "tracing ON -> $(OTEL_ENDPOINT)  (make obs-traces to watch spans)"

obs-down: ## Stop the collector and restart api/worker with tracing OFF
	$(INFISICAL) $(COMPOSE) --profile obs stop otel-collector
	$(INFISICAL) $(COMPOSE) up -d --force-recreate api worker
	@echo "tracing OFF"

obs-traces: ## Follow spans as the collector receives them
	$(INFISICAL) $(COMPOSE) --profile obs logs -f otel-collector

# ── Code quality ──────────────────────────────────────────────────────────────

lint: ## ESLint
	bun run lint

typecheck: ## TypeScript type check
	bun run typecheck

fmt: ## Prettier format
	bun run format

# ── Secrets ───────────────────────────────────────────────────────────────────

secrets: ## List Infisical secrets for current ENV
	infisical secrets --env=$(ENV)

secrets-set: ## Set a secret: make secrets-set KEY=FOO VALUE=bar
	infisical secrets set $(KEY)=$(VALUE) --env=$(ENV)

# ── Help ──────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_%/-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
