ENV ?= dev

.PHONY: dev dev-build stop down destroy logs ps build \
        migrate seed shell-db \
        test test-watch ci-gate \
        lint typecheck fmt \
        secrets secrets-set help

# ── Stack ─────────────────────────────────────────────────────────────────────

dev: ## Start full stack (secrets injected from Infisical)
	infisical run --env=$(ENV) -- docker compose up -d

dev-build: ## Build images then start
	infisical run --env=$(ENV) -- docker compose up --build -d

stop: ## Stop containers, preserve volumes
	docker compose stop

down: ## Remove containers, preserve volumes
	docker compose down

destroy: ## Remove containers + volumes (full reset)
	docker compose down -v

logs: ## Follow all service logs
	docker compose logs -f

logs-%: ## Follow one service: make logs-api
	docker compose logs -f $*

ps: ## Show service status
	docker compose ps

build: ## Build images only (no start)
	infisical run --env=$(ENV) -- docker compose build

# ── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run migrator manually
	infisical run --env=$(ENV) -- docker compose run --rm migrator

seed: ## Seed dev data via HTTP API
	infisical run --env=$(ENV) -- bun run scripts/seed-dev.ts

shell-db: ## Open psql in db container
	docker compose exec db psql -U postgres budget

# ── Testing ───────────────────────────────────────────────────────────────────

test: ## Run backend unit tests
	bun test

test-watch: ## Run tests in watch mode
	bun test --watch

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
