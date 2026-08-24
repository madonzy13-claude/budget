---
id: 260824-bkp
slug: r2-encrypted-backups
date: 2026-08-24
mode: quick
---

# Hourly encrypted Postgres backups to Cloudflare R2

## Problem

There are no backups. Verified: `grep -rin "backup|pg_dump|wal-g|pgbackrest|barman"`
across the repo, Makefile, compose files and scripts returns **zero hits**. Dev
data is a bind mount at `../budget-data/postgres`; prod compose uses a named
volume `budget-db-data`. One disk failure loses every household's ledger.

Database is 279 MB raw, **11.5 MB** as `pg_dump -Fc -Z9`.

## Decisions already settled

- **Destination:** Cloudflare R2, bucket `budget-dev-backups`, **EU
  jurisdiction** — so the endpoint is `https://$R2_ACCOUNT_ID.eu.r2.cloudflarestorage.com`.
  The global host returns `AccessDenied` for an EU bucket, which reads exactly
  like a broken token and is worth a comment in the script.
- **Cadence:** hourly (user's choice — RPO 1h).
- **Env:** Infisical `dev`. `prod`/`staging` are empty and the whole stack runs
  `--env=dev`; putting backup secrets anywhere else would just be decorative.
- Free tier verified sufficient: ~0.94 GB retained vs 10 GB, ~5k Class A ops
  vs 1M.

## Approach

**Rejected:** `offen/docker-volume-backup`. It archives volumes, so Postgres
still needs a pre-exec `pg_dump` hook, and its retention is flat days — GFS
would take four service instances. That is more configuration than the thing it
replaces.

**Taken:** one script, `FROM postgres:17-alpine` (already on the host, and
`pg_dump` major must match the 17.10 server) plus `rclone` and `age`.

- `rclone` supplies the S3 client AND the pruning (`delete --min-age`), so no
  rotation logic gets written.
- `age` encrypts to a **public key**, so the box holds nothing that can decrypt
  its own backups.
- busybox `crond` for scheduling — in the image already, no supercronic.

### Tiering (GFS, by server-side copy — the dump uploads once)

| Tier | Written | Pruned after | Copies | Size |
|---|---|---|---|---|
| hourly | every hour | 2 days | 48 | 552 MB |
| daily | 00:00 | 14 days | 14 | 161 MB |
| weekly | Sun 00:00 | 56 days | 8 | 92 MB |
| monthly | 1st 00:00 | 365 days | 12 | 138 MB |

### Files

- `infra/backup/Dockerfile`
- `infra/backup/backup.sh` — dump → age → upload → tier → prune
- `infra/backup/restore-check.sh` — newest object → decrypt → restore into a
  throwaway Postgres → assert row counts
- `infra/backup/entrypoint.sh` — install crontab, `crond -f`
- `backup` service in `docker-compose.yml`
- Makefile: `backup-now`, `restore-check`, `logs-backup`
- `docs/runbooks/backup-and-restore.md`

## Keys — the part that decides whether any of this works

Two strings make the difference between "I have backups" and "I have 82 files I
cannot open":

- `BUDGET_KEK` — wraps every per-user DEK in `shared_kernel.user_keys`
  (`libsodium-key-store.ts`). A dump restored without it leaves the encrypted
  columns permanently unreadable.
- the **age private key** — decrypts the dumps themselves.

The age keypair is generated into `../budget-data/age-backup-key.txt` (outside
the repo, mode 600). The private half is **never printed to the terminal** —
that transcript is logged. The user copies it to a password manager and deletes
the file. Only the public key goes to Infisical.

## Verification

TDD-equivalent for infra: `make restore-check` IS the failing-first test. It
must be written and seen to FAIL (no backups yet) before `backup.sh` exists.

1. `make restore-check` → fails, nothing in the bucket.
2. `make backup-now` → object appears in R2.
3. `make restore-check` → restores, row counts match live.
4. Corrupt/absent-key case: restore-check with the wrong age key must fail
   loudly, not silently produce an empty database.
5. Confirm the hourly timer actually fires (not just the manual path).
6. Leave the bucket clean of probe objects.
