#!/bin/sh
# One backup: pg_dump -> age -> Cloudflare R2, then tier and prune.
#
# Dumps to a temp file rather than streaming straight into `rclone rcat`. A
# stream that dies halfway still creates an object, and a truncated backup that
# LOOKS present is worse than no backup at all — you find out on the day you
# need it. Here nothing is uploaded until pg_dump has exited 0, and nothing is
# tiered until the uploaded size has been read back and matched.
set -eu

log() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() {
  log "FAILED: $*"
  # ponytail: a webhook if one is configured, nothing otherwise. Wiring this
  # into the app's Resend/web-push adapters would mean the backup depending on
  # the thing it is insuring. Point it at ntfy/Slack/Healthchecks when you want
  # to be told without reading logs.
  [ -n "${BACKUP_ALERT_WEBHOOK:-}" ] &&
    wget -q -O- --post-data="budget backup FAILED: $*" \
      "$BACKUP_ALERT_WEBHOOK" >/dev/null 2>&1 || true
  exit 1
}

for v in PGHOST PGUSER PGPASSWORD PGDATABASE \
         R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
         BACKUP_AGE_PUBLIC_KEY; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || die "$v is not set"
done

# The bucket is EU-jurisdiction, so it is ONLY addressable at the .eu. host.
# The global endpoint answers an EU bucket with 403 AccessDenied, which reads
# exactly like a bad token and will send you off editing a token that was
# always fine (lost an hour to this on 260824).
RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.${R2_JURISDICTION:-eu.}r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_ENDPOINT
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# The token is scoped to one bucket, so it cannot HeadBucket. Without this
# rclone probes for the bucket, is denied, and tries to CREATE it instead.
export RCLONE_S3_NO_CHECK_BUCKET=true

NOW=$(date -u +%Y-%m-%dT%H%M%SZ)
DEST="r2:${R2_BUCKET}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/db.dump"
ENC="$TMP/db.dump.age"

log "dumping $PGDATABASE from $PGHOST"
pg_dump -Fc -Z9 -f "$DUMP" || die "pg_dump exited non-zero"
[ -s "$DUMP" ] || die "pg_dump produced an empty file"
RAW=$(wc -c <"$DUMP")

# Encrypt to a PUBLIC key: this container can write backups it cannot read.
# Someone who takes the box gets the ciphertext and no way into it.
age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$ENC" "$DUMP" || die "age encryption failed"
[ -s "$ENC" ] || die "age produced an empty file"
SIZE=$(wc -c <"$ENC")
log "dump ${RAW}B -> encrypted ${SIZE}B"

OBJ="hourly/${NOW}.dump.age"
rclone copyto "$ENC" "${DEST}/${OBJ}" || die "upload of $OBJ failed"

# Read the size back off R2. An upload that "succeeded" but landed short is the
# failure mode this whole script exists to prevent.
REMOTE=$(rclone lsl "${DEST}/${OBJ}" 2>/dev/null | awk '{print $1; exit}')
[ "$REMOTE" = "$SIZE" ] ||
  die "uploaded $OBJ is ${REMOTE:-missing}B, expected ${SIZE}B"
log "uploaded $OBJ (${SIZE}B, verified)"

# Tiers are server-side copies of the object just verified, so the dump crosses
# the wire once however many tiers claim it.
tier() {
  rclone copyto "${DEST}/${OBJ}" "${DEST}/$1/${NOW}.dump.age" &&
    log "tiered -> $1/" || log "WARNING: tier $1 failed (hourly copy is safe)"
}
[ "$(date -u +%H)" = "00" ] && tier daily
[ "$(date -u +%H)" = "00" ] && [ "$(date -u +%u)" = "7" ] && tier weekly
[ "$(date -u +%H)" = "00" ] && [ "$(date -u +%d)" = "01" ] && tier monthly

# Retention is rclone's `--min-age`, not hand-rolled date arithmetic.
prune() {
  n=$(rclone delete "${DEST}/$1/" --min-age "$2" --verbose 2>&1 |
    grep -c "Deleted" || true)
  [ "$n" -gt 0 ] && log "pruned $n from $1/ older than $2" || true
}
prune hourly "${RETAIN_HOURLY:-2d}"
prune daily "${RETAIN_DAILY:-14d}"
prune weekly "${RETAIN_WEEKLY:-56d}"
prune monthly "${RETAIN_MONTHLY:-365d}"

log "done"
