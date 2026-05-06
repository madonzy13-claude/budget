#!/usr/bin/env bash
# run-tenant-leak.sh — Local tenant-leak CI gate runner
#
# Boots the compose DB, runs the migrator, then runs the 5 backend tenant-leak tests.
# PC-10 Playwright test (test 6) runs separately in the apps/web E2E suite.
#
# These tests use raw pg.Client (NOT withTenantTx) for tests 1 + 4 and a
# two-tenant fixture seeded via app_role application services (PC-20).
# To validate this gate is real, manually flip app_role to BYPASSRLS in
# post-migration.sql and rerun — every test should fail (T-13 negative smoke).
#
# PC-08 test #5 verifies in-process bus handlers see only their row's tenant.
# PC-10 test #6 (Playwright cross-tenant-cache) runs separately via:
#   bunx playwright test apps/web/e2e/cross-tenant-cache.spec.ts
#
# Exit codes:
#   0 — all 5 backend leak tests passed
#   1 — any test failed (FAIL CLOSED)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

START_EPOCH=$(date +%s)

echo "[tenant-leak] Starting CI gate runner from $REPO_ROOT"

# ============================================================
# 1. Load environment (fall back to test placeholders if .env absent)
# ============================================================
ENV_FILE="$REPO_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  echo "[tenant-leak] Loading $ENV_FILE"
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
else
  echo "[tenant-leak] .env not found — using docker-compose defaults"
  # These match docker-compose.yml service definitions from Plan 09
  export DATABASE_URL_APP="${DATABASE_URL_APP:-postgresql://app_role:app_pwd@localhost:5432/budget}"
  export DATABASE_URL_WORKER="${DATABASE_URL_WORKER:-postgresql://worker_role:worker_pwd@localhost:5432/budget}"
  export DATABASE_URL_MIGRATOR="${DATABASE_URL_MIGRATOR:-postgresql://migrator:migrator_pwd@localhost:5432/budget}"
fi

# ============================================================
# 2. Boot compose DB (db service only)
# ============================================================
echo "[tenant-leak] Starting compose db service..."
docker compose -f "$REPO_ROOT/docker-compose.yml" up -d --wait db

# ============================================================
# 3. Run migrator to apply migrations + post-migration.sql
# ============================================================
echo "[tenant-leak] Running migrator..."
docker compose -f "$REPO_ROOT/docker-compose.yml" run --rm migrator

# ============================================================
# 4. Cleanup on exit
# ============================================================
cleanup() {
  echo "[tenant-leak] Stopping compose db..."
  docker compose -f "$REPO_ROOT/docker-compose.yml" down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================
# 5. Run tenant-leak backend tests (tests 1–5)
# ============================================================
echo "[tenant-leak] Running bun test tests/tenant-leak/ ..."
cd "$REPO_ROOT"
bun test tests/tenant-leak --timeout 30000

END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))
echo "[tenant-leak] PASSED in ${ELAPSED}s"
