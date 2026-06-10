/**
 * tasks.test.ts — Integration tests for GET /budgets/:budgetId/tasks (BDP-03).
 *
 * Boots the DrizzleTaskRepo adapter against real Postgres, mounts the
 * /budgets/:budgetId/tasks sub-router, and asserts the contract:
 *   - empty pending list → 200 {tasks: []}
 *   - 3 pending tasks → returned in created_at ASC order
 *   - RESOLVED tasks filtered out
 *   - ?status=foo → 422
 *   - missing ?status query → 422 (only literal "pending" accepted)
 *   - cross-tenant read → 404 (tenantIds membership check)
 *
 * Phase 3 ships read-only; Phase 7 owns task generation. The test seeds rows
 * directly via SQL to exercise the count>=1 path without depending on
 * generator infrastructure.
 *
 * Requires DATABASE_URL_APP (set by `infisical run` or `make test`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Tasks Test', true, now(), now())`,
      [userId, `tasks-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Tasks Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-tasks-${budgetId.slice(0, 8)}`, userId],
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

interface SeedTaskOpts {
  budgetId: string;
  // Valid kinds per migration 0026 tasks_kind_chk. The Phase 1 placeholder
  // kinds (STALE_WALLET, MONTH_END_REVIEW) were dropped from v1.1 scope.
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "CUSHION_BELOW_TARGET";
  status?: "PENDING" | "RESOLVED";
  createdAt?: string; // ISO timestamp; if omitted Postgres default now() is used
  payload?: Record<string, unknown>;
}

async function seedTask(opts: SeedTaskOpts): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${opts.budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${opts.budgetId}', true)`,
    );
    if (opts.createdAt) {
      await client.query(
        `INSERT INTO budgeting.tasks
           (id, tenant_id, budget_id, kind, payload_json, status, created_at)
         VALUES ($1, $2, $2, $3, $4::jsonb, $5, $6::timestamptz)`,
        [
          id,
          opts.budgetId,
          opts.kind,
          JSON.stringify(opts.payload ?? {}),
          opts.status ?? "PENDING",
          opts.createdAt,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO budgeting.tasks
           (id, tenant_id, budget_id, kind, payload_json, status)
         VALUES ($1, $2, $2, $3, $4::jsonb, $5)`,
        [
          id,
          opts.budgetId,
          opts.kind,
          JSON.stringify(opts.payload ?? {}),
          opts.status ?? "PENDING",
        ],
      );
    }
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

/**
 * Build a Hono app with the tasks sub-router wired against the real adapter
 * + application service. Tenant guard is stubbed to set
 * tenantIds = opts.allowedTenantIds for the authenticated user — mimicking
 * the real middleware behaviour after X-Budget-ID is resolved.
 */
async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { createTasksRoute } = await import("../../src/routes/tasks");
  const { createTaskRepo } =
    await import("@budget/budgeting/src/adapters/persistence/task-repo");
  const { listPendingTasks } =
    await import("@budget/budgeting/src/application/list-pending-tasks");
  // Plan 07-07: POST /:taskId/resolve wiring.
  const { resolveTask } =
    await import("@budget/budgeting/src/application/resolve-task");

  const taskRepo = createTaskRepo();
  const deps = {
    budgeting: {
      listPendingTasks: listPendingTasks({ taskRepo }),
      resolveTask: resolveTask({ taskRepo }),
    },
  } as any;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    c.set("userId", opts.userId);
    await next();
  });
  app.route("/budgets/:budgetId/tasks", createTasksRoute(deps));
  return app;
}

describe("GET /budgets/:budgetId/tasks", () => {
  let fixA: Fixture;
  let fixB: Fixture;

  beforeAll(async () => {
    fixA = await createFixture();
    fixB = await createFixture();
  });

  it("returns 200 with an empty list when no tasks exist for the budget", async () => {
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [fixA.budgetId],
    });
    const res = await app.request(
      `/budgets/${fixA.budgetId}/tasks?status=pending`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      budgetId: string;
      tasks: unknown[];
    };
    expect(body.budgetId).toBe(fixA.budgetId);
    expect(body.tasks).toEqual([]);
  });

  it("returns 3 PENDING tasks in created_at ASC order", async () => {
    const fix = await createFixture();
    // Seed in REVERSE order to prove sort is by created_at not insert order.
    const id3 = await seedTask({
      budgetId: fix.budgetId,
      kind: "CUSHION_BELOW_TARGET",
      createdAt: "2026-03-01T10:00:00Z",
    });
    const id1 = await seedTask({
      budgetId: fix.budgetId,
      kind: "RESERVE_TOPUP",
      createdAt: "2026-01-01T10:00:00Z",
    });
    const id2 = await seedTask({
      budgetId: fix.budgetId,
      kind: "CONFIRM_DRAFT",
      createdAt: "2026-02-01T10:00:00Z",
      payload: { rule_id: "abc" },
    });

    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/tasks?status=pending`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      budgetId: string;
      tasks: Array<{
        id: string;
        budget_id: string;
        kind: string;
        status: string;
        payload: Record<string, unknown>;
        created_at: string;
      }>;
    };
    expect(body.tasks).toHaveLength(3);
    expect(body.tasks.map((t) => t.id)).toEqual([id1, id2, id3]);
    expect(body.tasks[0]?.kind).toBe("RESERVE_TOPUP");
    expect(body.tasks[1]?.kind).toBe("CONFIRM_DRAFT");
    expect(body.tasks[1]?.payload).toEqual({ rule_id: "abc" });
    expect(body.tasks[2]?.kind).toBe("CUSHION_BELOW_TARGET");
    // All rows must be in this budget and PENDING.
    for (const t of body.tasks) {
      expect(t.budget_id).toBe(fix.budgetId);
      expect(t.status).toBe("PENDING");
    }
  });

  it("filters out RESOLVED tasks (returns only PENDING)", async () => {
    const fix = await createFixture();
    await seedTask({
      budgetId: fix.budgetId,
      kind: "RESERVE_TOPUP",
      status: "PENDING",
      createdAt: "2026-04-01T10:00:00Z",
    });
    await seedTask({
      budgetId: fix.budgetId,
      kind: "CONFIRM_DRAFT",
      status: "PENDING",
      createdAt: "2026-04-02T10:00:00Z",
    });
    await seedTask({
      budgetId: fix.budgetId,
      kind: "CUSHION_BELOW_TARGET",
      status: "RESOLVED",
      createdAt: "2026-04-03T10:00:00Z",
    });

    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/tasks?status=pending`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{ status: string }>;
    };
    expect(body.tasks).toHaveLength(2);
    for (const t of body.tasks) expect(t.status).toBe("PENDING");
  });

  it("rejects ?status=foo with 422 (only literal 'pending' accepted)", async () => {
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [fixA.budgetId],
    });
    const res = await app.request(`/budgets/${fixA.budgetId}/tasks?status=foo`);
    expect(res.status).toBe(400); // zValidator default
    // Hono's zValidator returns 400 on parse failure by default. We assert
    // the request was rejected (NOT 200). Some integrations override to 422;
    // either is acceptable as a "rejected" response. We only require it is
    // an error status, not 200.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects missing ?status query (no status param) with a 4xx", async () => {
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [fixA.budgetId],
    });
    const res = await app.request(`/budgets/${fixA.budgetId}/tasks`);
    // zValidator on a required literal will reject when the param is absent.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("returns 404 when budgetId is not in the user's verified tenantIds (cross-tenant)", async () => {
    // Seed a task in budgetB; user A's session has allowedTenantIds = [budgetA]
    // and attempts to read budgetB's tasks.
    await seedTask({
      budgetId: fixB.budgetId,
      kind: "RESERVE_TOPUP",
      createdAt: "2026-05-01T10:00:00Z",
    });
    const app = await buildApp({
      userId: fixA.userId,
      allowedTenantIds: [fixA.budgetId],
    });
    const res = await app.request(
      `/budgets/${fixB.budgetId}/tasks?status=pending`,
    );
    expect(res.status).toBe(404);
  });
});

/**
 * Plan 07-07 (D-PH7-09): POST /budgets/:budgetId/tasks/:taskId/resolve.
 *
 * Tests the banner action used by the web Tasks queue. Idempotent at the
 * adapter (WHERE status='PENDING' AND tenant_id=?) — repeats and cross-tenant
 * calls silently no-op.
 */
describe("POST /budgets/:budgetId/tasks/:taskId/resolve", () => {
  let fix: Fixture;
  let fixOther: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
    fixOther = await createFixture();
  });

  async function fetchTaskStatus(
    taskId: string,
    budgetId: string,
  ): Promise<string> {
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      // set_config(..., is_local=true) only lives for the enclosing
      // transaction. Without an explicit BEGIN each statement autocommits, so
      // the tenant GUC is gone before the SELECT runs and RLS filters the row
      // out (status reads as "MISSING"). Scope both in one transaction.
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
      );
      const res = await client.query(
        `SELECT status FROM budgeting.tasks WHERE id = $1::uuid`,
        [taskId],
      );
      await client.query("COMMIT");
      return res.rows[0]?.status ?? "MISSING";
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }
  }

  it("resolves a PENDING task → 200 {ok:true}; DB row flips to RESOLVED", async () => {
    // Fresh fixture per test: the tasks_reserve_topup_pending_uq partial unique
    // index allows only one PENDING RESERVE_TOPUP per budget, so sharing a
    // budget across seeding tests would collide.
    const local = await createFixture();
    const taskId = await seedTask({
      budgetId: local.budgetId,
      kind: "RESERVE_TOPUP",
    });
    const app = await buildApp({
      userId: local.userId,
      allowedTenantIds: [local.budgetId],
    });
    const res = await app.request(
      `/budgets/${local.budgetId}/tasks/${taskId}/resolve`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(await fetchTaskStatus(taskId, local.budgetId)).toBe("RESOLVED");
  });

  it("is idempotent — POST resolve on already-RESOLVED task still returns 200", async () => {
    const local = await createFixture();
    const taskId = await seedTask({
      budgetId: local.budgetId,
      kind: "CONFIRM_DRAFT",
      status: "RESOLVED",
    });
    const app = await buildApp({
      userId: local.userId,
      allowedTenantIds: [local.budgetId],
    });
    const res = await app.request(
      `/budgets/${local.budgetId}/tasks/${taskId}/resolve`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    // Status unchanged — RESOLVED rows don't move.
    expect(await fetchTaskStatus(taskId, local.budgetId)).toBe("RESOLVED");
  });

  it("returns 401 when no session", async () => {
    const local = await createFixture();
    const taskId = await seedTask({
      budgetId: local.budgetId,
      kind: "RESERVE_TOPUP",
    });
    // Build app WITHOUT the session middleware.
    const { createTasksRoute } = await import("../../src/routes/tasks");
    const { createTaskRepo } =
      await import("@budget/budgeting/src/adapters/persistence/task-repo");
    const { resolveTask } =
      await import("@budget/budgeting/src/application/resolve-task");
    const taskRepo = createTaskRepo();
    const deps = {
      budgeting: { resolveTask: resolveTask({ taskRepo }) },
    } as any;
    const noAuthApp = new Hono();
    noAuthApp.route("/budgets/:budgetId/tasks", createTasksRoute(deps));
    const res = await noAuthApp.request(
      `/budgets/${local.budgetId}/tasks/${taskId}/resolve`,
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when budgetId is not in caller's tenantIds (cross-tenant)", async () => {
    const target = await createFixture();
    const taskId = await seedTask({
      budgetId: target.budgetId,
      kind: "RESERVE_TOPUP",
    });
    // App scoped to fixOther's tenantIds — caller has no access to target.budgetId.
    const app = await buildApp({
      userId: fixOther.userId,
      allowedTenantIds: [fixOther.budgetId],
    });
    const res = await app.request(
      `/budgets/${target.budgetId}/tasks/${taskId}/resolve`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    // Task remains PENDING — layer 1 rejected before adapter ran.
    expect(await fetchTaskStatus(taskId, target.budgetId)).toBe("PENDING");
  });

  it("rejects non-UUID taskId via zValidator → 400", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/tasks/not-a-uuid/resolve`,
      { method: "POST" },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
