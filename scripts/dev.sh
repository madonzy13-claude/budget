#!/usr/bin/env bash
# dev.sh — Single source of dev verbs for the Budget stack.
# Usage: bash scripts/dev.sh <verb> [args]
#
# Verbs:
#   up      — Start all services in the background (--wait for healthchecks)
#   down    — Stop and remove containers (preserves volumes)
#   logs    — Follow logs for a specific service (default: all)
#   migrate — Run the migrator service (drizzle-kit migrate)
#   seed    — Seed dev fixtures via scripts/seed-dev.ts
#   reset   — Full reset: down -v (drop volumes) + up + migrate + seed
#   psql    — Open a psql shell against the dev db as postgres
set -euo pipefail

VERB="${1:-help}"
shift || true

case "$VERB" in
  up)
    docker compose up -d --wait "$@"
    ;;

  down)
    docker compose down "$@"
    ;;

  logs)
    SVC="${1:-}"
    if [[ -n "$SVC" ]]; then
      docker compose logs -f "$SVC"
    else
      docker compose logs -f
    fi
    ;;

  migrate)
    docker compose run --rm migrator "$@"
    ;;

  seed)
    bun run scripts/seed-dev.ts "$@"
    ;;

  reset)
    echo "[dev.sh] Tearing down stack (including volumes)..."
    docker compose down -v
    echo "[dev.sh] Starting fresh stack..."
    bash scripts/dev.sh up
    echo "[dev.sh] Running migrations..."
    bash scripts/dev.sh migrate
    echo "[dev.sh] Seeding dev fixtures..."
    bash scripts/dev.sh seed
    echo "[dev.sh] Reset complete."
    ;;

  psql)
    docker compose exec db psql -U postgres -d budget "$@"
    ;;

  help|--help|-h)
    echo "Usage: bash scripts/dev.sh <verb> [args]"
    echo ""
    echo "Verbs:"
    echo "  up       Start all services (--wait for healthchecks)"
    echo "  down     Stop containers (volumes preserved)"
    echo "  logs     Tail logs for a service: bash scripts/dev.sh logs api"
    echo "  migrate  Run drizzle-kit migrate via migrator service"
    echo "  seed     Seed dev fixtures (2 users, 1 private + 1 shared workspace)"
    echo "  reset    Full reset: down -v + up + migrate + seed"
    echo "  psql     Open psql shell as postgres user"
    ;;

  *)
    echo "Unknown verb: $VERB" >&2
    echo "Run: bash scripts/dev.sh help" >&2
    exit 1
    ;;
esac
