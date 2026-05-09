import { sql } from "drizzle-orm";

/**
 * idempotency/repo.ts — raw-SQL repository for shared_kernel.idempotency_keys.
 * No Drizzle ORM query builder — uses raw SQL for SELECT FOR UPDATE (race-safety).
 * All functions operate on a Tx (Drizzle transaction) so they compose with withTenantTx.
 */

// Tx type is the Drizzle transaction parameter type (inferred from pool transaction call)

type Tx = any;

export interface IdempotencyRow {
  scopeHash: string;
  bodyHash: string;
  responseStatus: number;
  responseBodyJsonb: unknown;
  expiresAt: Date;
}

/**
 * Look up a cached idempotency entry by scope hash.
 * SELECT FOR UPDATE ensures concurrent requests with the same key block on the DB lock
 * until the first request commits (race-safe per T-2-03-03).
 * Returns null if no unexpired row found.
 */
export async function lookupIdempotency(
  tx: Tx,
  scopeHash: string,
): Promise<IdempotencyRow | null> {
  const r = await tx.execute(sql`
    SELECT scope_hash   AS "scopeHash",
           body_hash    AS "bodyHash",
           response_status AS "responseStatus",
           response_body_jsonb AS "responseBodyJsonb",
           expires_at   AS "expiresAt"
      FROM shared_kernel.idempotency_keys
     WHERE scope_hash = ${scopeHash}
       AND expires_at > now()
     FOR UPDATE
  `);
  return (r.rows[0] as IdempotencyRow) ?? null;
}

/**
 * Persist a newly-completed idempotency entry.
 * TTL = 24h fixed per EXPN-12.
 */
export async function insertIdempotency(
  tx: Tx,
  row: {
    scopeHash: string;
    bodyHash: string;
    tenantId: string;
    userId: string;
    route: string;
    responseStatus: number;
    responseBody: unknown;
  },
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO shared_kernel.idempotency_keys
      (scope_hash, body_hash, tenant_id, user_id, route,
       response_status, response_body_jsonb, expires_at)
    VALUES (
      ${row.scopeHash}, ${row.bodyHash}, ${row.tenantId}, ${row.userId}, ${row.route},
      ${row.responseStatus}, ${JSON.stringify(row.responseBody)}::jsonb,
      now() + interval '24 hours'
    )
  `);
}

/**
 * Delete all expired idempotency rows.
 * Called by the hourly pg-boss cleanup job via withInfraTx (worker_role, no GUC).
 * RLS admits the DELETE via the idempotency_keys_cleanup pgPolicy.
 * Returns the number of rows deleted.
 */
export async function deleteExpiredIdempotency(tx: Tx): Promise<number> {
  const r = await tx.execute(
    sql`DELETE FROM shared_kernel.idempotency_keys WHERE expires_at < now()`,
  );
  return r.rowCount ?? 0;
}
