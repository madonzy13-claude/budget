/**
 * resolve-idempotency.test.ts — Phase 7 Plan 02.
 *
 * Verifies the idempotent / tenant-scoped behaviour of the TaskRepo adapter's
 * resolve methods against a real Postgres backend (no mocking — project rule
 * "no DB mocking in integration tests"). Seed pattern mirrors
 * tests/tenant-leak/tasks-cross-tenant.test.ts lines 97–127.
 *
 * Cases:
 *   1. resolve() on an already-RESOLVED row is a no-op (status + resolved_at unchanged).
 *   2. resolve() on a non-existent id is a no-op (no throw).
 *   3. resolve() with a foreign tenantId silently fails (cross-tenant scope test).
 *   4. resolveConfirmDraftByDraftId() scopes by payload_json->>'draft_id' AND tenant_id.
 *
 * RLS / app.tenant_ids: seed helpers set the GUC directly so the partial-index
 * dedup + tenant_isolation policy are exercised end-to-end.
 *
 * Requires: DATABASE_URL_APP env, migration 0026 (Plan 01) applied so the
 * tasks_kind_chk constraint accepts 'CUSHION_BELOW_TARGET' and the dedup
 * partial unique indexes exist. Without 0026 these tests will still pass for
 * the resolve idempotency cases but the dedup-emit assertions in
 * reserve-topup.test.ts / confirm-draft.test.ts will not.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) {
  throw new Error("DATABASE_URL_APP required for resolve-idempotency tests");
}
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
const { createTaskRepo } =
  await import("@budget/budgeting/src/adapters/persistence/task-repo");
resetPools();

interface SeededBudget {
  userId: string;
  budgetId: string;
}

async function seedBudget(): Promise<SeededBudget> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Resolve Idem', true, now(), now())`,
      [userId, `resolve-idem-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Resolve Idem Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-resi-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

/** Seed a task in the given (tenantId === budgetId) scope with explicit status. */
async function seedTask(
  budgetId: string,
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "CUSHION_BELOW_TARGET",
  status: "PENDING" | "RESOLVED" = "PENDING",
  payload: Record<string, unknown> = {},
): Promise<{ taskId: string; resolvedAt: string | null }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  let resolvedAt: string | null = null;
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    const result = await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status, resolved_at)
       VALUES ($1, $2, $2, $3, $4::jsonb, $5,
               CASE WHEN $5 = 'RESOLVED' THEN now() ELSE NULL END)
       RETURNING resolved_at::text AS resolved_at`,
      [id, budgetId, kind, JSON.stringify(payload), status],
    );
    resolvedAt = (result.rows[0]?.resolved_at as string | null) ?? null;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { taskId: id, resolvedAt };
}

/** SELECT a task by id with RLS bypassed (raw client) so we can inspect state. */
async function readTaskState(
  _taskId: string,
): Promise<{ status: string; resolved_at: string | null } | null> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    // We need to read across tenants for the cross-tenant assertion; use a
    // direct query with no tenant GUC. Because the connection is the app role
    // with FORCE RLS, set tenant_ids to wildcard (= empty/null) and rely on
    // RLS — but for verification we need ground-truth, so query as the
    // session role bypassing RLS by elevating to a worker tx is not exposed.
    // Instead, set both tenant scopes that exist in this test by trying each.
    // Simpler: query both possible scopes (the task's true tenant is in one).
    // The seed helpers always set tenant_id = budget_id, so we know the row
    // exists with tenant_id = its budget_id. Use a SECURITY DEFINER-free read:
    // set tenant_ids GUC to include any uuid the row may live in by trying
    // multiple scopes. For test scope simplicity we directly query through
    // the migrator URL which has BYPASSRLS — fall back to setting a wide
    // tenant_ids list assembled from all seeded budgets.
    //
    // For this test we always know the budget the task lives in (we either
    // just seeded it under budgetA or budgetB), so pass that explicitly.
    throw new Error(
      "readTaskState(taskId) is not safe without a tenant scope; use readTaskStateScoped",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * SELECT a task by id while scoping app.tenant_ids to the given tenantId.
 * Verifies the row state from the app role with RLS active — same role the
 * adapter uses. If the task is cross-tenant relative to `tenantId`, RLS
 * filters it out and the function returns null.
 */
async function readTaskStateScoped(
  taskId: string,
  tenantId: string,
): Promise<{ status: string; resolved_at: string | null } | null> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    // set_config(..., is_local=true) only persists for the duration of the
    // enclosing transaction. Without an explicit BEGIN, each statement is its
    // own implicit transaction, so the GUC would be reset before the SELECT
    // runs — RLS then filters every row and the read returns null. Wrap the
    // GUC writes and the SELECT in one transaction so the tenant scope is live
    // for the read.
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${tenantId}', true)`,
    );
    const result = await client.query(
      `SELECT status, resolved_at::text AS resolved_at
         FROM budgeting.tasks
        WHERE id = $1::uuid`,
      [taskId],
    );
    await client.query("COMMIT");
    if (result.rows.length === 0) return null;
    return {
      status: result.rows[0].status as string,
      resolved_at: result.rows[0].resolved_at as string | null,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("TaskRepo adapter — resolve idempotency", () => {
  let budgetA: SeededBudget;
  let budgetB: SeededBudget;

  beforeAll(async () => {
    budgetA = await seedBudget();
    budgetB = await seedBudget();
  });

  it("resolve UPDATE matches no rows when task already RESOLVED (no-op)", async () => {
    const { taskId, resolvedAt: seededResolvedAt } = await seedTask(
      budgetA.budgetId,
      "RESERVE_TOPUP",
      "RESOLVED",
    );
    expect(seededResolvedAt).not.toBeNull();

    const repo = createTaskRepo();
    // Should not throw.
    await repo.resolve(taskId, budgetA.budgetId);

    const state = await readTaskStateScoped(taskId, budgetA.budgetId);
    expect(state).not.toBeNull();
    expect(state?.status).toBe("RESOLVED");
    // resolved_at is unchanged from the seed value — the WHERE clause filtered
    // out the RESOLVED row, so SET resolved_at = now() never executed.
    expect(state?.resolved_at).toBe(seededResolvedAt);
  });

  it("resolve UPDATE matches no rows when task does not exist (no-op)", async () => {
    const ghostId = crypto.randomUUID();
    const repo = createTaskRepo();
    // Must not throw, must not produce any side-effect.
    await expect(
      repo.resolve(ghostId, budgetA.budgetId),
    ).resolves.toBeUndefined();
  });

  it("resolve UPDATE respects tenant scope (cross-tenant resolve fails)", async () => {
    const { taskId } = await seedTask(budgetA.budgetId, "RESERVE_TOPUP");

    const repo = createTaskRepo();
    // tenantId = budgetB tries to resolve a task seeded under budgetA. The
    // WHERE clause includes `tenant_id = ${budgetB.budgetId}` which never
    // matches, AND withTenantTx scopes app.tenant_ids = [budgetB] so RLS also
    // blocks the row. Both layers must allow the call to return cleanly
    // (silent no-op — no info leaked to caller).
    await expect(
      repo.resolve(taskId, budgetB.budgetId),
    ).resolves.toBeUndefined();

    // Task A is still PENDING when read in its real tenant scope.
    const stateA = await readTaskStateScoped(taskId, budgetA.budgetId);
    expect(stateA?.status).toBe("PENDING");
    expect(stateA?.resolved_at).toBeNull();
  });

  it("resolveConfirmDraftByDraftId scopes by payload_json->>'draft_id' AND tenant_id", async () => {
    const draftId = `draft-${crypto.randomUUID()}`;
    const { taskId } = await seedTask(
      budgetA.budgetId,
      "CONFIRM_DRAFT",
      "PENDING",
      {
        draft_id: draftId,
        rule_name: "Rent",
        amount_cents: "120000",
        currency: "EUR",
        transaction_date: "2026-05-31",
        category_id: crypto.randomUUID(),
      },
    );

    const repo = createTaskRepo();
    // Inside a withTenantTx so the adapter's tx-piggyback path is exercised.
    const r = await withTenantTx(
      TenantId(budgetA.budgetId),
      UserId(budgetA.userId),
      async (tx) => {
        await repo.resolveConfirmDraftByDraftId(
          budgetA.budgetId,
          draftId,
          tx as unknown as {
            execute: (
              q: unknown,
            ) => Promise<{ rows: Record<string, unknown>[] }>;
          },
        );
      },
    );
    expect(r.isOk()).toBe(true);

    const state = await readTaskStateScoped(taskId, budgetA.budgetId);
    expect(state?.status).toBe("RESOLVED");
    expect(state?.resolved_at).not.toBeNull();
  });
});

// Silence "unused readTaskState" — kept around as a documented dead-end so
// future readers don't reintroduce the unsafe pattern.
void readTaskState;
