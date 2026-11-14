import { sql } from "drizzle-orm";
import type { TenantId, UserId } from "@budget/shared-kernel";

/**
 * D-08 + Pitfall 4: ALWAYS SET LOCAL inside an explicit transaction.
 * Postgres array literal: '{uuid1,uuid2,...}' cast to uuid[].
 * PC-03: extended to also set app.current_user_id.
 *
 * SET LOCAL takes no bound parameters (error 42601), so tenantContextSql uses
 * set_config(..., true) — the same transaction-local setting, parameterised.
 */
export function tenantContextSql(
  tenantIds: readonly TenantId[],
  userId: UserId,
) {
  // One round-trip for both GUCs (261102: every tenant tx paid two). set_config
  // with is_local=true is SET LOCAL, and it takes bound parameters.
  const literal = `{${tenantIds.join(",")}}`;
  return [
    sql`SELECT set_config('app.tenant_ids', ${literal}, true), set_config('app.current_user_id', ${String(userId)}, true)`,
  ];
}

/** PC-03: user-only context (no tenant_ids). For user-scoped tables. */
export function userContextSql(userId: UserId) {
  return sql.raw(`SET LOCAL app.current_user_id = '${String(userId)}'`);
}
