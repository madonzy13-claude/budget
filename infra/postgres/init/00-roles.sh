#!/usr/bin/env bash
# PC-19 / T-14 mitigation: Shell wrapper that templates role passwords from env
# into 00-roles.sql.tpl via psql -v variables.
# Postgres docker-entrypoint-initdb.d executes *.sh files directly;
# 00-roles.sql.tpl has a non-standard extension so it is NOT auto-run,
# allowing this script to control templating.
set -euo pipefail

echo "[00-roles.sh] Checking required env vars..."

# Fail early with a clear message if any password var is missing
: "${APP_ROLE_PASSWORD:?ERROR: APP_ROLE_PASSWORD must be set}"
: "${WORKER_ROLE_PASSWORD:?ERROR: WORKER_ROLE_PASSWORD must be set}"
: "${MIGRATOR_ROLE_PASSWORD:?ERROR: MIGRATOR_ROLE_PASSWORD must be set}"

echo "[00-roles.sh] Creating roles via psql -v (T-3: all roles NOBYPASSRLS)..."

psql \
  -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_pwd="$APP_ROLE_PASSWORD" \
  -v worker_pwd="$WORKER_ROLE_PASSWORD" \
  -v migrator_pwd="$MIGRATOR_ROLE_PASSWORD" \
  -f /docker-entrypoint-initdb.d/00-roles.sql.tpl

echo "[00-roles.sh] Roles created successfully."
