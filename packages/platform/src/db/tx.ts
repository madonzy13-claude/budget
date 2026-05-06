import {
  ok,
  err,
  type Result,
  type TenantId,
  type UserId,
} from "@budget/shared-kernel";
import { appDb, workerDb, resetPools } from "./pool";
import { tenantContextSql, userContextSql } from "./rls";

export { resetPools };

export class TenantContextError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "TenantContextError";
  }
}
export class UserContextError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "UserContextError";
  }
}

type Tx = Parameters<Parameters<ReturnType<typeof appDb>["transaction"]>[0]>[0];

/**
 * D-09: ONLY writable tenant-scoped tx primitive. dependency-cruiser bans direct
 * db.transaction calls; CI grep gate (Plan 00, PC-26) verifies only this file calls .transaction(.
 * PC-03: multi-tenant read; also sets app.current_user_id so user-scoped joins work.
 */
export async function withTenantTxRead<T>(
  tenantIds: readonly TenantId[],
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>> {
  if (tenantIds.length === 0) {
    return err(
      new TenantContextError("withTenantTxRead requires ≥1 tenant id (D-10)"),
    );
  }
  try {
    const value = await appDb().transaction(async (tx) => {
      for (const stmt of tenantContextSql(tenantIds, userId))
        await tx.execute(stmt);
      return await fn(tx);
    });
    return ok(value);
  } catch (e) {
    return err(e as Error);
  }
}

/** Single-tenant write per D-09 + PC-03 (extended with userId). */
export async function withTenantTx<T>(
  tenantId: TenantId,
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>> {
  return withTenantTxRead([tenantId], userId, fn);
}

/**
 * PC-03: user-scoped tx (sets ONLY app.current_user_id). For user-scoped tables:
 * shared_kernel.user_keys, identity.sessions, identity.accounts, identity.user_preferences.
 * Do NOT use for tenant-scoped data.
 */
export async function withUserContext<T>(
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>> {
  if (!userId)
    return err(new UserContextError("withUserContext requires a userId"));
  try {
    const value = await appDb().transaction(async (tx) => {
      await tx.execute(userContextSql(userId));
      return await fn(tx);
    });
    return ok(value);
  } catch (e) {
    return err(e as Error);
  }
}

/**
 * PC-04: INFRASTRUCTURE-ONLY tx (sets NEITHER GUC).
 * Carve-out for outbox dispatch + migration runner.
 * NEVER call from tenant-scoped code paths. CI grep gate (Plan 00, PC-26) ensures only this
 * file invokes `.transaction(` repo-wide (outside test/ directories).
 */
export async function withInfraTx<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>> {
  try {
    const value = await workerDb().transaction(async (tx) => fn(tx));
    return ok(value);
  } catch (e) {
    return err(e as Error);
  }
}

/**
 * PC-27: BOOTSTRAP carve-out — used ONLY by tenant-guard middleware (apps/api/src/middleware/tenant-guard.ts)
 * to query `tenancy.workspace_members` for the active_workspace_ids ∩ membership intersection
 * BEFORE `app.tenant_ids` GUC is set (chicken-and-egg: the GUC is built from this very query).
 *
 * Mechanically identical to `withUserContext`: opens a tx, SET LOCAL app.current_user_id, runs fn,
 * COMMITs. Exists as a separately NAMED primitive so:
 *   (a) the legitimate bootstrap call site is self-documenting and greppable,
 *   (b) tenant-guard does not need raw `appPool().connect()` (PC-03 grep gate stays clean),
 *   (c) future readers see immediately why this tx has only the user GUC and no tenant GUC.
 *
 * Honors the `workspace_members_self` RLS policy added in Plan 06's tenancy.workspace_members
 * schema (`user_id = nullif(current_setting('app.current_user_id', true), '')::uuid`). The policy
 * permits the user to SELECT their own membership rows even before app.tenant_ids is set.
 */
export async function withBootstrapUserContext<T>(
  userId: UserId,
  fn: (tx: Tx) => Promise<T>,
): Promise<Result<T, Error>> {
  if (!userId)
    return err(
      new UserContextError("withBootstrapUserContext requires a userId"),
    );
  try {
    const value = await appDb().transaction(async (tx) => {
      await tx.execute(userContextSql(userId));
      return await fn(tx);
    });
    return ok(value);
  } catch (e) {
    return err(e as Error);
  }
}
