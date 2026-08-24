# Backup & restore runbook

Hourly encrypted Postgres backups to Cloudflare R2.

```
db --pg_dump--> age(public key) --> R2 (EU) --> restore-check
```

| | |
|---|---|
| Bucket | `budget-dev-backups`, **EU jurisdiction** |
| Endpoint | `https://$R2_ACCOUNT_ID.eu.r2.cloudflarestorage.com` |
| Cadence | hourly (`BACKUP_CRON`, UTC) |
| Encryption | `age`, to a public key — the sidecar cannot read its own output |
| Size | ~12 MB per dump |
| Retention | 48 hourly · 14 daily · 8 weekly · 12 monthly ≈ 0.94 GB |
| Cost | £0 — R2 free tier is 10 GB and 1M Class A ops; this uses ~9% and ~0.5% |

## Commands

```bash
make backup-now      # take one now, outside the schedule
make restore-check   # restore the newest backup, assert it carries data
make backup-status   # what is actually in the bucket, per tier
make logs-backup     # follow the sidecar
```

## The two keys — read this part

A dump on its own is **not** a recoverable backup. Two secrets stand between the
ciphertext and your data, and both live in Infisical today:

| Secret | Without it |
|---|---|
| `BACKUP_AGE_PRIVATE_KEY` | the `.age` files cannot be decrypted at all |
| `BUDGET_KEK` | the dump restores, but every per-user DEK in `shared_kernel.user_keys` stays wrapped — encrypted columns decrypt to nothing |

**Both must exist somewhere that is not this server and not Infisical.** If the
box dies and Infisical is unreachable on the same day, backups you have been
taking faithfully for a year are 82 files of noise.

The age private key was generated to `../budget-data/age-backup-key.txt`
(outside the repo, mode 600) and never printed to a terminal. Copy it into a
password manager, then delete the file:

```bash
cat ../budget-data/age-backup-key.txt   # copy to password manager
shred -u ../budget-data/age-backup-key.txt
```

Public key (safe to share, this is what encrypts):
`age1u268avaqh4apt05ugwqexq835ktxhh2xgp8rkz4nsfy8j2r4hujqmahww3`

## Restoring for real

`make restore-check` restores into a throwaway database. To restore *production*
data after losing the server:

```bash
# 1. Bring up Postgres + roles (infra/postgres/init recreates app/worker/migrator)
make up

# 2. Pull and decrypt the backup you want
docker compose run --rm --entrypoint sh backup -c '
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_S3_NO_CHECK_BUCKET=true \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID \
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY \
    RCLONE_CONFIG_R2_ENDPOINT=https://$R2_ACCOUNT_ID.eu.r2.cloudflarestorage.com
  rclone lsf r2:$R2_BUCKET/daily/ | sort | tail -5'   # pick one

# 3. Restore it into `budget`, then set BUDGET_KEK to the SAME value as before.
```

Roles are **not** in the dump (`pg_dump`, not `pg_dumpall --globals-only`) —
they are recreated by `infra/postgres/init/00-roles.sh` from the role-password
secrets. Those secrets must therefore match the ones in use when the dump was
taken, or the app cannot log in to its own database.

## Gotchas paid for already

- **An EU-jurisdiction bucket is only addressable at the `.eu.` endpoint.** The
  global host answers with `403 AccessDenied`, which is indistinguishable from a
  badly-scoped token. Cost an hour on 260824 and nearly cost a working token.
- **The token cannot `HeadBucket`** (it is scoped to one bucket), so rclone
  probes, is denied, and tries to CREATE the bucket. `RCLONE_S3_NO_CHECK_BUCKET=true`
  is required, not optional.
- **`crond` runs with an empty environment.** Secrets injected into the
  entrypoint are invisible to the job unless written into the crontab — see
  `entrypoint.sh`.
- **`pg_dump` major version must match the server** (17.10), which is why the
  sidecar is `FROM postgres:17-alpine`.

## What this does NOT protect against

- **Point-in-time recovery.** RPO is one hour. A deletion at 10:59 is in the
  11:00 backup. WAL archiving (pgBackRest) is the upgrade if that becomes
  unacceptable.
- **Silent failure.** Nothing pages you today. `BACKUP_ALERT_WEBHOOK` posts to
  an ntfy/Slack/Healthchecks URL on failure if you set it; otherwise the
  freshness assertion in `make restore-check` is what catches a stopped
  schedule, and only when you run it. **Run it monthly, or wire it to CI.**
