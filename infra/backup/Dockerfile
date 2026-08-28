# Backup sidecar: pg_dump -> age -> Cloudflare R2.
#
# FROM postgres:17-alpine, not a smaller base, for two reasons: pg_dump's major
# version MUST match the server it dumps (17.10 here) or it refuses, and this
# image is already on every host that runs the stack, so the sidecar costs no
# extra pull.
FROM postgres:17-alpine

# rclone is the S3 client AND the retention policy (`delete --min-age`), so no
# rotation logic gets hand-written. age encrypts to a public key, so this
# container holds nothing capable of decrypting its own output.
RUN apk add --no-cache rclone age ca-certificates tzdata

COPY backup.sh restore-check.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh \
             /usr/local/bin/restore-check.sh \
             /usr/local/bin/entrypoint.sh

# Stays root, deliberately. busybox crond needs it: as an unprivileged user it
# starts, logs `wakeup dt=60` on schedule, and never runs the job — verified on
# 2026-08-28 by dropping to the base image's postgres user (uid 70) and watching
# a `* * * * *` schedule produce zero backups in five minutes, silently. Every
# other part of the sidecar is happy unprivileged (pg_dump, age and rclone all
# ran fine as uid 70); it is the scheduler alone that requires root, and a
# backup system that quietly stops backing up is far worse than this container
# running as root. It publishes no port, mounts no host path, and holds an age
# PUBLIC key, so it cannot read its own output.
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
