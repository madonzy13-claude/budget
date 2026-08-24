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
make restore-drill   # ALSO prove BUDGET_KEK still matches that data
make backup-status   # what is actually in the bucket, per tier
make logs-backup     # follow the sidecar
```

## How do you know the backups work?

Three levels, in increasing strength. Only the third is proof.

**1. `make backup-status`** — objects exist and the newest is recent. Says
nothing about whether they open.

**2. `make restore-check`** — downloads the newest object, decrypts it,
`pg_restore`s it into a throwaway database, and asserts five core tables are
non-empty. Fails on a stale schedule (freshness limit), a wrong age key, or a
truncated object. This is the one to run monthly.

**3. `make restore-drill`** — everything above, then keeps the restored database
and runs `scripts/verify-restored-kek.ts` against it: recomputes KEK-keyed email
hashes and compares them to the restored bytes, and unwraps user DEKs. This is
the difference between *"the dump restores"* and *"people can still sign in"*.

Both checks were verified to FAIL before being trusted — a wrong age key stops
`restore-check`, a wrong `BUDGET_KEK` stops the drill at `0/10 DEKs unwrapped`.
An assertion that has never been red is decoration.

```
[kek-check] 25/25 email hashes recomputed correctly
[kek-check] 10/10 user DEKs unwrapped
[kek-check] PASS — this backup + this BUDGET_KEK is a working system
```

**What none of them cover:** a real disaster is a *new host*. These run against
the existing cluster, so they do not exercise provisioning, role bootstrap from
`infra/postgres/init`, DNS, or the tunnel. The honest full test is to restore
onto a clean machine with nothing but the bucket and the two escrowed keys —
worth doing once, deliberately, before you need it.

## The two keys — read this part

A dump on its own is **not** a recoverable backup. Two secrets stand between the
ciphertext and your data, and both live in Infisical today:

| Secret | Without it |
|---|---|
| `BACKUP_AGE_PRIVATE_KEY` | the `.age` files cannot be decrypted at all — total loss |
| `BUDGET_KEK` | the dump restores fully, but `identity.users.email_hash` is BLAKE2b **keyed by the KEK**, so sign-in cannot find its user (239 rows today) |

Measured on 260824, so the second row is not a guess: `email_encrypted` is
populated for **0 of 2233** users — the D-16 PII-at-rest columns were scaffolded
and never wired up, and `user_keys` wraps 671 DEKs that nothing currently
decrypts. So losing the KEK today costs **login lookup**, not data, and is even
recoverable: plaintext `email` is still stored and `recomputeEmailHash()` exists
to rebuild the hashes under a new key.

That changes the moment anything starts writing `email_encrypted`. Escrow it
now — it is free, and this footnote is one feature-flag away from being wrong.

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
