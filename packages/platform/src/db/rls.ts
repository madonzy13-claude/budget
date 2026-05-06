import { sql } from "drizzle-orm";
import type { TenantId, UserId } from "@budget/shared-kernel";

/**
 * D-08 + Pitfall 4: ALWAYS SET LOCAL inside an explicit transaction.
 * Postgres array literal: '{uuid1,uuid2,...}' cast to uuid[].
 * PC-03: extended to also set app.current_user_id in the same SET LOCAL pair.
 *
 * IMPORTANT: Postgres does NOT support parameterized queries for SET LOCAL (error 42601).
 * We use sql.raw() to inline the sanitized literal values directly into the SQL string.
 * The tenant IDs and user IDs are UUID values (validated at the branded-type boundary) so
 * they are safe to inline — no SQL injection risk from valid UUID strings.
 */
export function tenantContextSql(
  tenantIds: readonly TenantId[],
  userId: UserId,
) {
  // UUID values are safe to inline — no SQL injection risk from valid UUID format
  const literal = `{${tenantIds.join(",")}}`;
  return [
    sql.raw(`SET LOCAL app.tenant_ids = '${literal}'`),
    sql.raw(`SET LOCAL app.current_user_id = '${String(userId)}'`),
  ];
}

/** PC-03: user-only context (no tenant_ids). For user-scoped tables. */
export function userContextSql(userId: UserId) {
  return sql.raw(`SET LOCAL app.current_user_id = '${String(userId)}'`);
}
