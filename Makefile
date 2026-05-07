ENV ?= dev

# Load .env.local overrides when present (machine-specific, not committed)
ENV_FILE_LOCAL := $(shell test -f .env.local && echo "--env-file .env.local")
COMPOSE := docker compose --env-file .env $(ENV_FILE_LOCAL)

.PHONY: dev dev-build stop down destroy logs ps build \
        migrate seed shell-db \
        test test-watch test-e2e ci-gate \
        lint typecheck fmt \
        secrets secrets-set help

# ── Stack ─────────────────────────────────────────────────────────────────────

dev: ## Start full stack (secrets injected from Infisical)
	infisical run --env=$(ENV) -- $(COMPOSE) up -d

dev-build: ## Build images then start
	infisical run --env=$(ENV) -- $(COMPOSE) up --build -d

stop: ## Stop containers, preserve volumes
	$(COMPOSE) stop

down: ## Remove containers, preserve volumes
	$(COMPOSE) down

destroy: ## Remove containers + volumes (full reset)
	$(COMPOSE) down -v

logs: ## Follow all service logs
	$(COMPOSE) logs -f

logs-%: ## Follow one service: make logs-api
	$(COMPOSE) logs -f $*

ps: ## Show service status
	$(COMPOSE) ps

build: ## Build images only (no start)
	infisical run --env=$(ENV) -- $(COMPOSE) build

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run migrator manually
	infisical run --env=$(ENV) -- $(COMPOSE) run --rm migrator

seed: ## Seed dev data via HTTP API
	infisical run --env=$(ENV) -- bun run scripts/seed-dev.ts

shell-db: ## Open psql in db container
	docker compose exec db psql -U postgres budget

# ── Testing ───────────────────────────────────────────────────────────────────

test: ## Run backend unit tests
	bun test

test-watch: ## Run tests in watch mode
	bun test --watch

test-e2e: ## Run Playwright E2E tests against running stack
	PLAYWRIGHT_BASE_URL=$${PLAYWRIGHT_BASE_URL:-http://localhost:3000} bunx playwright test

test-e2e-ui: ## Run Playwright E2E tests with UI
	PLAYWRIGHT_BASE_URL=$${PLAYWRIGHT_BASE_URL:-http://localhost:3000} bunx playwright test --ui

ci-gate: ## Run tenant-leak CI gate (needs local postgres)
	bun run test:ci-gate

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
