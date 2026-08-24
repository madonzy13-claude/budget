---
id: 260824-bkp
slug: r2-encrypted-backups
date: 2026-08-24
mode: quick
status: complete
---

# Summary

Hourly `pg_dump -Fc -Z9` → `age` (public key) → Cloudflare R2 EU, with GFS
tiering, rclone-driven retention, and a restore check that actually restores.

Before this the project had **zero** backups — verified by grep across repo,
Makefile, compose and scripts. 279 MB of household ledgers on one disk.

## Verified end to end, against the live stack

| Step | Result |
|---|---|
| `make restore-check`, empty bucket | FAILED "no backups in hourly/" — red first |
| `make backup-now` | 12 177 479 B dump → 12 180 639 B encrypted, size read back off R2 and matched |
| `make restore-check` | PASS — ledger 3255, categories 1671, budgets 2031, users 2233, user_keys 671; all match live |
| Wrong age key | FAILED loudly, exit 1, no empty database left behind |
| Throwaway DB cleanup | 0 `restore_check_*` databases remain |
| Scheduler | crond fired at exactly 16:31:00 with a 1-min cron, then reset to `0 * * * *` |
| Service | `budget-backup-1` Up, restart: unless-stopped |

## Decisions

- **Rejected `offen/docker-volume-backup`**: it archives volumes, so Postgres
  still needs a pre-exec `pg_dump` hook, and flat day-retention would need four
  service instances for GFS. More config than the script it replaces.
- `FROM postgres:17-alpine` — `pg_dump` major must match the 17.10 server, and
  the image is already on every host running the stack.
- rclone supplies both the S3 client and the retention (`delete --min-age`), so
  no rotation arithmetic got written.
- **Dump to a temp file, never stream into `rclone rcat`.** A stream that dies
  halfway still creates an object; a truncated backup that looks present is
  worse than none. Upload size is read back off R2 before any tier copy.
- **Split keys.** The sidecar gets the age PUBLIC key only, so a long-running
  container can write backups it cannot read. The private key is injected only
  by `make restore-check`.

## Traps paid for

- **EU-jurisdiction buckets answer only at `<acct>.eu.r2.cloudflarestorage.com`.**
  The global endpoint returns `403 AccessDenied` — indistinguishable from a
  badly-scoped token. This cost an hour and nearly cost a working token being
  rolled for no reason.
- A single-bucket-scoped token cannot `HeadBucket`, so rclone probes, is denied,
  and tries to CREATE the bucket. `RCLONE_S3_NO_CHECK_BUCKET=true` is required.
- `crond` runs with an empty environment — secrets must be frozen into the
  crontab or every scheduled run fails while the manual one works.

## Outstanding — needs the user

1. **Escrow both keys offline.** `../budget-data/age-backup-key.txt` (never
   printed) and `BUDGET_KEK`. Without them the backups are noise. See the
   runbook.
2. **Rotate `BETTER_AUTH_SECRET` and `APP_ROLE_PASSWORD`** — leaked into a
   session transcript on 260824 by `infisical secrets` printing values.
3. No alerting unless `BACKUP_ALERT_WEBHOOK` is set; `make restore-check`
   asserts freshness but only when run.
