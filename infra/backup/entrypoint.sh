#!/bin/sh
# Install the schedule and hand off to crond.
#
# busybox crond, not supercronic: it is already in the image, and the only
# thing supercronic adds here is nicer logging, which `-d 8 -f` covers.
set -eu

# A one-shot invocation (`docker compose run --rm backup backup.sh`) skips the
# scheduler entirely — that is how `make backup-now` and `make restore-check`
# reach these scripts.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

SCHEDULE="${BACKUP_CRON:-0 * * * *}"

# crond runs with an empty environment, so the secrets injected into THIS
# process would be invisible to the job. Freeze them into the crontab's shell
# instead — the file lives only in the container's tmpfs.
mkdir -p /etc/crontabs
{
  echo "SHELL=/bin/sh"
  echo "PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/bin"
  for v in PGHOST PGUSER PGPASSWORD PGDATABASE \
           R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
           R2_JURISDICTION BACKUP_AGE_PUBLIC_KEY BACKUP_ALERT_WEBHOOK \
           RETAIN_HOURLY RETAIN_DAILY RETAIN_WEEKLY RETAIN_MONTHLY; do
    eval "val=\${$v:-}"
    [ -n "$val" ] && echo "$v=$val"
  done
  echo "$SCHEDULE /usr/local/bin/backup.sh 2>&1"
} >/etc/crontabs/root
chmod 600 /etc/crontabs/root

echo "[backup] scheduled: $SCHEDULE (UTC)"

# Take one immediately so a fresh deployment is protected within seconds rather
# than at the top of the next hour — and so a misconfiguration is visible now,
# in the logs you are already watching, instead of silently at 03:00.
/usr/local/bin/backup.sh || echo "[backup] initial backup FAILED — see above"

exec crond -f -d 8
