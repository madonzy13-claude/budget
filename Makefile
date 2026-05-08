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

.PHONY: dev dev-build stop down destroy logs ps build restart \
        migrate seed shell-db \
        test test-watch test-e2e test-clean ci-gate \
        lint typecheck fmt \
        secrets secrets-set help

# ── Stack ─────────────────────────────────────────────────────────────────────

dev: ## Start full stack (secrets injected from Infisical)
	$(INFISICAL) $(COMPOSE) up -d

dev-build: ## Build images then start
	$(INFISICAL) $(COMPOSE) up --build -d

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

# ── Testing ───────────────────────────────────────────────────────────────────

test: ## Run backend unit tests
	bun test

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

test-e2e: ## Run Playwright E2E tests against running stack (uses APP_URL from .env.local)
	PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx bddgen && PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx playwright test

test-e2e-ui: ## Run Playwright E2E tests with UI (uses APP_URL from .env.local)
	PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx bddgen && PLAYWRIGHT_BASE_URL=$(PLAYWRIGHT_BASE_URL_RESOLVED) bunx playwright test --ui

ci-gate: ## Run tenant-leak CI gate (needs local postgres)
	$(INFISICAL) bun run test:ci-gate

test-clean: ## Remove leaked test postgres containers (orphans from killed test runs)
	@$(INFISICAL) sh -c 'docker ps -aq --filter "label=budget-testcontainer=1" | xargs -r docker rm -f'
	@echo "leaked testcontainers removed"

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
