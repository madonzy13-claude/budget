#!/usr/bin/env bash
# drift-repair-guard.sh — W4 mitigation for Phase 2 migration drift.
#
# Problem: migration 0013 drops wallet_id + transfer_group_id from expense_ledger,
# but migration 0010 (applied after 0013 due to lower created_at timestamp) re-adds
# them. This script detects and repairs that specific drift idempotently.
#
# Usage (one of):
#   infisical run --env=dev -- ./scripts/drift-repair-guard.sh
#   DATABASE_URL_MIGRATOR=<url> DB_CONTAINER=budget-db-1 ./scripts/drift-repair-guard.sh
#
# Requires either: psql on PATH, or DB_CONTAINER env var pointing to a running
# Postgres container (uses docker exec psql).
#
# Exit codes:
#   0 — drift detected and repaired (or no drift found)
#   1 — unexpected error

set -euo pipefail

DB_URL="${DATABASE_URL_MIGRATOR:-${DATABASE_URL_APP:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "ERROR: DATABASE_URL_MIGRATOR or DATABASE_URL_APP required" >&2
  exit 1
fi

# Normalize docker service hostname → localhost for host execution
DB_URL_HOST="${DB_URL/@db:/@localhost:}"

# Prefer psql on PATH; fall back to docker exec
DB_CONTAINER="${DB_CONTAINER:-budget-db-1}"
if command -v psql &>/dev/null; then
  run_sql() { psql "$DB_URL_HOST" -v ON_ERROR_STOP=1 -c "$1"; }
  query_val() { psql "$DB_URL_HOST" -tAc "$1"; }
else
  run_sql() { docker exec -i "$DB_CONTAINER" psql "$DB_URL_HOST" -v ON_ERROR_STOP=1 -c "$1"; }
  query_val() { docker exec -i "$DB_CONTAINER" psql "$DB_URL_HOST" -tAc "$1"; }
fi

echo "=== drift-repair-guard: Phase 2 expense_ledger drift check ==="

# --- Check 1: wallet_id should not exist ---
WALLET_EXISTS=$(query_val \
  "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='wallet_id')")
if [[ "$WALLET_EXISTS" == "t" ]]; then
  echo "DRIFT: wallet_id present (re-added by 0010 after 0013 drop) — repairing..."
  run_sql "ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS wallet_id;"
  echo "  -> wallet_id dropped"
else
  echo "OK: wallet_id absent"
fi

# --- Check 2: transfer_group_id should not exist ---
TGI_EXISTS=$(query_val \
  "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='budgeting' AND table_name='expense_ledger' AND column_name='transfer_group_id')")
if [[ "$TGI_EXISTS" == "t" ]]; then
  echo "DRIFT: transfer_group_id present (re-added by 0010 after 0013 drop) — repairing..."
  run_sql "ALTER TABLE budgeting.expense_ledger DROP COLUMN IF EXISTS transfer_group_id;"
  echo "  -> transfer_group_id dropped"
else
  echo "OK: transfer_group_id absent"
fi

# --- Check 3: expense_ledger_kind_chk constraint must exist ---
CHK_EXISTS=$(query_val \
  "SELECT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid=t.oid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='budgeting' AND t.relname='expense_ledger' AND c.conname='expense_ledger_kind_chk')")
if [[ "$CHK_EXISTS" != "t" ]]; then
  echo "DRIFT: expense_ledger_kind_chk missing — repairing..."
  run_sql "ALTER TABLE budgeting.expense_ledger DROP CONSTRAINT IF EXISTS expense_ledger_kind_chk; ALTER TABLE budgeting.expense_ledger ADD CONSTRAINT expense_ledger_kind_chk CHECK (kind IN ('SPENDING','INCOME'));"
  echo "  -> expense_ledger_kind_chk added"
else
  echo "OK: expense_ledger_kind_chk present"
fi

# --- Check 4: GRANT UPDATE on Phase 2 columns ---
GRANT_COUNT=$(query_val \
  "SELECT COUNT(*) FROM information_schema.column_privileges WHERE table_schema='budgeting' AND table_name='expense_ledger' AND grantee='app_role' AND privilege_type='UPDATE'")
if [[ "${GRANT_COUNT:-0}" -lt 5 ]]; then
  echo "DRIFT: GRANT UPDATE on expense_ledger columns missing — repairing..."
  run_sql "GRANT UPDATE (note, transaction_date, category_id, amount_original_cents, currency_original, amount_converted_cents, fx_rate, fx_as_of, kind, recurring_rule_id, confirmed_at, deleted_at, updated_at) ON budgeting.expense_ledger TO app_role;"
  echo "  -> GRANT UPDATE applied"
else
  echo "OK: GRANT UPDATE on expense_ledger present ($GRANT_COUNT columns)"
fi

echo "=== drift-repair-guard: complete ==="
