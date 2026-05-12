/**
 * tasks-cross-tenant.test.ts — Tenant-leak gate test (BDP-03).
 *
 * Verifies the multi-layered protection for `GET /budgets/:id/tasks?status=pending`:
 *
 * Layer 1 — Route handler (apps/api/src/routes/tasks.ts):
 *   The route reads c.get("tenantIds") (populated by tenant-guard after
 *   intersecting X-Budget-ID with the user's tenancy.budget_members rows) and
 *   returns 404 when the requested budgetId is NOT in that verified set.
 *   Tested at the HTTP boundary in apps/api/test/routes/tasks.test.ts
 *   (test #6: cross-tenant returns 404).
 *
 * Layer 2 — RLS / adapter (this file):
 *   Even if a developer accidentally calls the application service with the
 *   wrong tenant context, `createTaskRepo().listPending` opens
 *   withTenantTx(TenantId(tenantId), …) which sets app.tenant_ids to a SINGLE
 *   id. SELECTing budgetA's tasks while tenantId=B is in the GUC must return
 *   0 rows. The adapter then maps to an empty array — never leaking
 *   budgetA's task ids, kinds, or payload.
 *
 * This test exercises Layer 2 in isolation: it seeds a task in budgetA, then
 * asserts that calling listPending with budgetA's id while the GUC is scoped
 * to budgetB (or while budgetA's id is absent from the tenant_ids array)
 * returns an empty array.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 *   - force-rls-on-all-tables
 *   - in-process-bus-tenant-scope
 *   - job-without-tenant-errors
 *   - no-guc-zero-rows
 *   - pg-roles-no-bypassrls
 *   - home-summary-cross-tenant
 *   - tasks-cross-tenant (NEW — this file)
 * Total: 6 → 7 files.
 *
 * Plan 03-03 baseline note: the plan text describes "7 → 8" because it was
 * authored against a stale count that pre-dated 03-02's documented reality
 * of 5 → 6. After 03-02 landed the actual count is 6; this plan increments
 * to 7. The SPIRIT of the gate — "every new tenant-scoped read endpoint adds
 * exactly one leak test" — is honoured.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
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
       VALUES ($1, $2, 'Tasks Leak', true, now(), now())`,
      [userId, `tasks-leak-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Tasks Leak Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-tleak-${budgetId.slice(0, 8)}`, userId],
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

async function seedTaskInBudget(
  budgetId: string,
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "STALE_WALLET" | "MONTH_END_REVIEW",
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status)
       VALUES ($1, $2, $2, $3, '{}'::jsonb, 'PENDING')`,
      [id, budgetId, kind],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

describe("tasks tenant-leak gate", () => {
  let budgetA: SeededBudget;
  let budgetB: SeededBudget;
  let taskInA: string;

  beforeAll(async () => {
    budgetA = await seedBudget();
    budgetB = await seedBudget();
    taskInA = await seedTaskInBudget(budgetA.budgetId, "RESERVE_TOPUP");
  });

  it("Layer 2: RLS hides budgetA's tasks when GUC is scoped to budgetB", async () => {
    // Bypass the adapter — query directly with a tenant scope that does NOT
    // include budgetA. RLS must filter out the row even though the WHERE
    // clause references budgetA's id.
    const r = await withTenantTx(
      TenantId(budgetB.budgetId),
      UserId(budgetB.userId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const res = await drizzleTx.execute(sql`
          SELECT id::text AS id, kind, status
            FROM budgeting.tasks
           WHERE budget_id = ${budgetA.budgetId}::uuid
        `);
        return res.rows;
      },
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      // RLS rejected the cross-tenant read.
      expect(r.value.length).toBe(0);
    }
  });

  it("Layer 2: createTaskRepo().listPending returns [] when tenantId does not own the budget", async () => {
    // The adapter scopes app.tenant_ids = [tenantId] via withTenantTx. Passing
    // tenantId = budgetB while budgetId = budgetA simulates a defence-in-depth
    // failure where the route forgot to assert budgetId is in tenantIds. RLS
    // still wipes out the cross-tenant rows.
    const repo = createTaskRepo();
    const rows = await repo.listPending(budgetA.budgetId, budgetB.budgetId);
    expect(rows).toEqual([]);
    // The seeded task id must NOT appear in any row.
    expect(rows.find((t) => t.id === taskInA)).toBeUndefined();
  });

  it("Layer 2 sanity: same call with tenantId === budgetId returns the seeded row", async () => {
    // The same adapter call with the correct tenant scope must succeed. If
    // this passes WHILE the cross-tenant call above returns [], the gate is
    // real (not a false-positive from a broken query).
    const repo = createTaskRepo();
    const rows = await repo.listPending(budgetA.budgetId, budgetA.budgetId);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.find((t) => t.id === taskInA)).toBeDefined();
  });
});
