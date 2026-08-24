#!/bin/sh
# Prove the newest backup is restorable. A backup nobody has restored is a
# rumour, and the day you find out is the worst possible day to find out.
#
# Restores into a THROWAWAY database on the same cluster (restore_check_<ts>)
# rather than spinning a second Postgres — no container-in-container, and 11 MB
# costs the live server nothing. The target name is asserted before every
# destructive step; this script must never be able to touch `budget`.
#
# The age PRIVATE key is only ever present here, injected at run time. The
# hourly sidecar holds the public half alone, so a sidecar left running for
# months cannot read a single backup it wrote.
set -eu

log() { echo "[restore-check $(date -u +%H:%M:%SZ)] $*"; }
die() { echo "[restore-check] FAILED: $*" >&2; exit 1; }

for v in PGHOST PGUSER PGPASSWORD PGDATABASE \
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
         BACKUP_AGE_PRIVATE_KEY; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || die "$v is not set"
done

RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.${R2_JURISDICTION:-eu.}r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ENDPOINT
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_S3_NO_CHECK_BUCKET=true

DEST="r2:${R2_BUCKET}"
TIER="${RESTORE_TIER:-hourly}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Newest object in the tier. Names are UTC ISO-8601, so lexical sort IS
# chronological sort — that is the whole reason for the naming scheme.
NEWEST=$(rclone lsf "${DEST}/${TIER}/" 2>/dev/null | sort | tail -1)
[ -n "$NEWEST" ] || die "no backups in ${TIER}/ — nothing to restore"
log "newest in ${TIER}/: $NEWEST"

# Freshness. A pipeline that stopped a month ago still restores perfectly, and
# would pass every other assertion in this file.
STAMP=$(echo "$NEWEST" | sed 's/\.dump\.age$//')
AGE_H=$(( ( $(date -u +%s) - $(date -u -d "$(echo "$STAMP" | sed 's/T\(..\)\(..\)\(..\)Z/ \1:\2:\3/')" +%s 2>/dev/null || echo 0) ) / 3600 ))
MAX_H="${MAX_BACKUP_AGE_HOURS:-3}"
[ "$AGE_H" -le "$MAX_H" ] ||
  die "newest backup is ${AGE_H}h old, limit is ${MAX_H}h — the schedule has stopped"
log "freshness ok (${AGE_H}h old, limit ${MAX_H}h)"

rclone copyto "${DEST}/${TIER}/${NEWEST}" "$TMP/db.dump.age" ||
  die "download failed"

echo "$BACKUP_AGE_PRIVATE_KEY" >"$TMP/key.txt"
chmod 600 "$TMP/key.txt"
age -d -i "$TMP/key.txt" -o "$TMP/db.dump" "$TMP/db.dump.age" ||
  die "decryption failed — wrong age key, or the object is corrupt"
[ -s "$TMP/db.dump" ] || die "decrypted to an empty file"
log "decrypted $(wc -c <"$TMP/db.dump")B"

TARGET="restore_check_$(date -u +%Y%m%d%H%M%S)"
case "$TARGET" in
  restore_check_*) ;;
  *) die "refusing to touch a database not named restore_check_*" ;;
esac

# KEEP_RESTORED_DB hands the restored database to a caller that wants to run
# deeper checks against it — `make restore-drill` verifies KEK-keyed email
# hashes, which needs application code and cannot run inside this container.
# The caller becomes responsible for dropping it.
cleanup_db() {
  [ -n "${KEEP_RESTORED_DB:-}" ] && return 0
  psql -d postgres -q -c "DROP DATABASE IF EXISTS \"$TARGET\";" >/dev/null 2>&1 || true
}
trap 'cleanup_db; rm -rf "$TMP"' EXIT

psql -d postgres -q -c "CREATE DATABASE \"$TARGET\";" || die "could not create $TARGET"
log "restoring into $TARGET"

# --no-owner / --no-privileges: roles come from infra/postgres/init on a fresh
# cluster and do not exist in a scratch database. Their absence is not a
# restore failure, but pg_restore reports it as one.
if ! pg_restore --no-owner --no-privileges --exit-on-error \
     -d "$TARGET" "$TMP/db.dump" 2>"$TMP/err"; then
  head -20 "$TMP/err" >&2
  die "pg_restore rejected the dump"
fi

# The dump restored — now prove it carries DATA, not just an empty schema. A
# dump of the right shape and no rows would satisfy every check above.
FAIL=0
# expense_ledger is the append-only money ledger — if anything in this list is
# allowed to be empty, it is not this one. user_keys is checked because it is
# what BUDGET_KEK unwraps; a restore without those rows is unreadable data.
for t in budgeting.expense_ledger budgeting.categories tenancy.budgets \
         identity.users shared_kernel.user_keys; do
  n=$(psql -d "$TARGET" -tAc "SELECT count(*) FROM $t;" 2>/dev/null || echo MISSING)
  case "$n" in
    MISSING) log "  $t: MISSING"; FAIL=1 ;;
    0)       log "  $t: 0 rows"; FAIL=1 ;;
    *)       log "  $t: $n rows" ;;
  esac
done
[ "$FAIL" -eq 0 ] || die "restored database is missing tables or empty"

# user_keys is the one that decides whether the restore is USABLE: it holds the
# per-user DEKs wrapped by BUDGET_KEK. Without that key these rows restore
# perfectly and decrypt to nothing.
log "PASS — $NEWEST restores clean"

# Machine-readable handle for `make restore-drill`, which continues from here
# with the checks that need application code.
[ -n "${KEEP_RESTORED_DB:-}" ] && echo "RESTORED_DB=$TARGET"
exit 0
