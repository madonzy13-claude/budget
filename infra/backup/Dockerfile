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

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
