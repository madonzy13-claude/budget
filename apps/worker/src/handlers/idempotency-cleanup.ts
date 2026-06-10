import type { PgBoss } from "pg-boss";
import { withInfraTx, deleteExpiredIdempotency } from "@budget/platform";

/**
 * registerIdempotencyCleanup — registers the hourly pg-boss job that
 * deletes expired idempotency_keys rows.
 *
 * Uses withInfraTx (worker_role, no GUC set). RLS admits the DELETE via the
 * `idempotency_keys_cleanup` pgPolicy declared on the schema:
 *   FOR DELETE TO worker_role USING (expires_at < now())
 * No separate cleanup role is needed — the two-policy approach is the single source of truth.
 */
export function registerIdempotencyCleanup(boss: PgBoss): void {
  boss.work("idempotency-cleanup", async () => {
    const r = await withInfraTx(async (tx) => deleteExpiredIdempotency(tx));
    const deleted = r.isOk() ? r.value : 0;
    if (deleted > 0) {
      console.log(
        `[worker] idempotency-cleanup: deleted ${deleted} expired rows`,
      );
    }
    return { deleted };
  });
}
