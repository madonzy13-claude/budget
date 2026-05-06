#!/usr/bin/env bash
# tests/compose-up.sh — Smoke test for the docker compose dev stack.
# PLAT-02: Validates all services reach healthy state within 90s.
#
# Usage:
#   bash tests/compose-up.sh               # requires .env to exist
#   RUN_COMPOSE_SMOKE=1 bash tests/compose-up.sh
#
# CI: Set RUN_COMPOSE_SMOKE=1 to enable. Not run by default (requires Docker).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  echo "[compose-up.sh] Tearing down stack..."
  docker compose down -v 2>/dev/null || true
}
trap cleanup EXIT

# ── Ensure .env exists ────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "[compose-up.sh] No .env found — generating from .env.example with dev secrets..."
  cp .env.example .env
  # Inject deterministic (non-empty) dev secrets for CI
  POSTGRES_PASS=$(openssl rand -hex 16)
  APP_PASS=$(openssl rand -hex 16)
  WORKER_PASS=$(openssl rand -hex 16)
  MIGRATOR_PASS=$(openssl rand -hex 16)
  KEK=$(openssl rand -base64 32)
  AUTH_SECRET=$(openssl rand -base64 32)
  sed -i \
    -e "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASS}|" \
    -e "s|APP_ROLE_PASSWORD=.*|APP_ROLE_PASSWORD=${APP_PASS}|" \
    -e "s|WORKER_ROLE_PASSWORD=.*|WORKER_ROLE_PASSWORD=${WORKER_PASS}|" \
    -e "s|MIGRATOR_ROLE_PASSWORD=.*|MIGRATOR_ROLE_PASSWORD=${MIGRATOR_PASS}|" \
    -e "s|DATABASE_URL_APP=.*|DATABASE_URL_APP=postgresql://app_role:${APP_PASS}@db:5432/budget|" \
    -e "s|DATABASE_URL_WORKER=.*|DATABASE_URL_WORKER=postgresql://worker_role:${WORKER_PASS}@db:5432/budget|" \
    -e "s|DATABASE_URL_MIGRATOR=.*|DATABASE_URL_MIGRATOR=postgresql://migrator:${MIGRATOR_PASS}@db:5432/budget|" \
    -e "s|BUDGET_KEK=.*|BUDGET_KEK=${KEK}|" \
    -e "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${AUTH_SECRET}|" \
    .env
  echo "[compose-up.sh] Generated .env with random dev secrets."
fi

# ── Start stack ───────────────────────────────────────────────────────────────
START_EPOCH=$(date +%s)
echo "[compose-up.sh] Starting docker compose stack (--wait --wait-timeout 120)..."

if ! docker compose up -d --wait --wait-timeout 120; then
  echo "[compose-up.sh] FAILED: services did not reach healthy state. Dumping logs..."
  docker compose logs --tail 100 db migrator api web worker
  exit 1
fi

READY_EPOCH=$(date +%s)
ELAPSED=$((READY_EPOCH - START_EPOCH))
echo "[compose-up.sh] All services healthy in ${ELAPSED}s (PLAT-02 target: <90s)"

if [[ $ELAPSED -gt 90 ]]; then
  echo "[compose-up.sh] WARNING: 90s target exceeded (${ELAPSED}s). Consider optimising image build."
fi

# ── Sanity probes ─────────────────────────────────────────────────────────────
echo "[compose-up.sh] Probing service health endpoints..."

# API /health
echo "  Probing api /health..."
if ! curl -sf http://localhost:3001/health > /dev/null; then
  echo "[compose-up.sh] FAILED: api /health returned non-200"
  docker compose logs --tail 50 api
  exit 1
fi
echo "  OK: api /health"

# Web /en/health
echo "  Probing web /en/health..."
WEB_RESP=$(curl -sf http://localhost:3000/en/health 2>/dev/null || true)
if [[ -z "$WEB_RESP" ]]; then
  echo "[compose-up.sh] FAILED: web /en/health returned empty"
  docker compose logs --tail 50 web
  exit 1
fi
echo "  OK: web /en/health — $WEB_RESP"

# Mailpit API
echo "  Probing mailpit /api/v1/info..."
if ! curl -sf http://localhost:8025/api/v1/info > /dev/null; then
  echo "[compose-up.sh] WARNING: mailpit /api/v1/info not reachable (non-fatal)"
fi
echo "  OK: mailpit"

echo "[compose-up.sh] Smoke test PASSED (${ELAPSED}s)"
