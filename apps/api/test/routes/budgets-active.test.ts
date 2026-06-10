/**
 * budgets-active.test.ts — Integration tests for GET /budgets/active
 *                           pendingTasksCount field (Tasks Redesign P3).
 *
 * Verifies the wire contract: the HTTP response from GET /budgets/active
 * includes `pendingTasksCount` on each budget object.
 *
 * Two test modes:
 *   1. Unit-level (mock): confirms the route passes `pendingTasksCount`
 *      straight through from the repo result — no DB needed.
 *   2. Integration-level (real DB): seeds tasks and confirms the SQL
 *      aggregate (wired by P2 DTO change) surfaces the correct count.
 *
 * The unit-level tests run unconditionally. The DB tests skip when
 * DATABASE_URL_APP is not set (e.g. pure unit CI).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Unit-level tests — mock listForUser, no real DB
// ---------------------------------------------------------------------------

function buildApp(listForUserResult: unknown[]) {
  const { budgetsRoutesFactory } = require("../../src/routes/budgets");
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: "user-001" } } as any);
    c.set("tenantIds", []);
    await next();
  });
  const fakeDeps = {
    tenancy: {
      workspaceRepo: {
        findById: async () => null,
        listForUser: async () => listForUserResult,
        listMembers: async () => [],
      },
      memberShareRepo: { list: async () => [], update: async () => {} },
    },
    identity: {
      userRepo: {
        getActiveWorkspaceIds: async () => [] as string[],
        setActiveWorkspaceIds: async () => {},
        findById: async () => null,
        updateLocale: async () => {},
      },
      auth: { api: {} },
    },
  } as any;
  app.route("/budgets", budgetsRoutesFactory(fakeDeps));
  return app;
}

describe("GET /budgets/active — pendingTasksCount wire contract (unit)", () => {
  it("returns pendingTasksCount=0 when repo returns 0", async () => {
    const app = buildApp([
      {
        id: "budget-001",
        slug: "abc123",
        name: "Budget One",
        kind: "PRIVATE",
        default_currency: "USD",
        ownerUserId: "user-001",
        memberCount: 1,
        createdAt: new Date(),
        cushionModeEnabled: false,
        pendingTasksCount: 0,
      },
    ]);
    const res = await app.request("/budgets/active");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.budgets).toHaveLength(1);
    expect(body.budgets[0].pendingTasksCount).toBe(0);
  });

  it("returns pendingTasksCount=3 when repo returns 3", async () => {
    const app = buildApp([
      {
        id: "budget-002",
        slug: "xyz456",
        name: "Budget Two",
        kind: "SHARED",
        default_currency: "EUR",
        ownerUserId: "user-001",
        memberCount: 2,
        createdAt: new Date(),
        cushionModeEnabled: false,
        pendingTasksCount: 3,
      },
    ]);
    const res = await app.request("/budgets/active");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.budgets[0].pendingTasksCount).toBe(3);
  });

  it("returns pendingTasksCount across multiple budgets", async () => {
    const app = buildApp([
      {
        id: "b-1",
        slug: "s1",
        name: "A",
        kind: "PRIVATE",
        default_currency: "USD",
        ownerUserId: "user-001",
        memberCount: 1,
        createdAt: new Date(),
        cushionModeEnabled: false,
        pendingTasksCount: 0,
      },
      {
        id: "b-2",
        slug: "s2",
        name: "B",
        kind: "SHARED",
        default_currency: "PLN",
        ownerUserId: "user-001",
        memberCount: 3,
        createdAt: new Date(),
        cushionModeEnabled: false,
        pendingTasksCount: 5,
      },
    ]);
    const res = await app.request("/budgets/active");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.budgets).toHaveLength(2);
    expect(body.budgets[0].pendingTasksCount).toBe(0);
    expect(body.budgets[1].pendingTasksCount).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Integration-level tests — real Postgres, real SQL aggregate
// ---------------------------------------------------------------------------

const DB_URL_RAW = process.env.DATABASE_URL_APP;

// Rewrite @db: → @localhost: for tests running outside Docker network.
if (DB_URL_RAW) {
  process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
}
const DB_URL = process.env.DATABASE_URL_APP ?? "";

// Probe DB reachability once so we can skip the integration suite cleanly
// when Docker is not running (e.g. pure unit CI or no-infra local run).
let DB_REACHABLE = false;
if (DB_URL) {
  try {
    const { Pool: ProbePool } = await import("pg");
    const probe = new ProbePool({ connectionString: DB_URL, max: 1 });
    const pc = await probe.connect();
    pc.release();
    await probe.end();
    DB_REACHABLE = true;
    const { resetPools } = await import("@budget/platform");
    resetPools();
  } catch {
    // DB unreachable — integration tests will be skipped
  }
}

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
       VALUES ($1, $2, 'Active Budget Test', true, now(), now())`,
      [userId, `budgets-active-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Active Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-active-${budgetId.slice(0, 8)}`, userId],
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

async function seedTask(opts: {
  budgetId: string;
  kind: "RESERVE_TOPUP" | "CONFIRM_DRAFT" | "CUSHION_BELOW_TARGET";
  status?: "PENDING" | "RESOLVED";
}): Promise<string> {
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
    await client.query(
      `INSERT INTO budgeting.tasks
         (id, tenant_id, budget_id, kind, payload_json, status)
       VALUES ($1, $2, $2, $3, '{}'::jsonb, $4)`,
      [id, opts.budgetId, opts.kind, opts.status ?? "PENDING"],
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

async function getActiveBudgets(
  userId: string,
): Promise<{ id: string; pendingTasksCount: number }[]> {
  // Use the real DrizzleWorkspaceRepo (same path as the HTTP handler) so we
  // exercise the SQL aggregate end-to-end without going through HTTP.
  const { createTenancyModule } =
    await import("@budget/tenancy/src/contracts/factory");
  const { noopEmailSender } = await import("@budget/platform");
  const mod = createTenancyModule({
    emailSender: noopEmailSender,
    appUrl: "http://localhost:3000",
  });
  return mod.budgetRepo.listForUser(userId) as Promise<
    { id: string; pendingTasksCount: number }[]
  >;
}

describe.if(DB_REACHABLE)(
  "GET /budgets/active — pendingTasksCount SQL aggregate (integration)",
  () => {
    let fix: Fixture;

    beforeAll(async () => {
      fix = await createFixture();
    });

    it("returns pendingTasksCount=0 when budget has no pending tasks", async () => {
      const budgets = await getActiveBudgets(fix.userId);
      const b = budgets.find((b) => b.id === fix.budgetId);
      expect(b).toBeDefined();
      expect(b!.pendingTasksCount).toBe(0);
    });

    it("returns pendingTasksCount=2 after seeding 2 PENDING tasks of different kinds", async () => {
      await seedTask({ budgetId: fix.budgetId, kind: "RESERVE_TOPUP" });
      await seedTask({ budgetId: fix.budgetId, kind: "CONFIRM_DRAFT" });

      const budgets = await getActiveBudgets(fix.userId);
      const b = budgets.find((b) => b.id === fix.budgetId);
      expect(b).toBeDefined();
      expect(b!.pendingTasksCount).toBe(2);
    });

    it("does not count RESOLVED tasks", async () => {
      // Seed an additional RESOLVED task — count must stay at 2.
      await seedTask({
        budgetId: fix.budgetId,
        kind: "CUSHION_BELOW_TARGET",
        status: "RESOLVED",
      });

      const budgets = await getActiveBudgets(fix.userId);
      const b = budgets.find((b) => b.id === fix.budgetId);
      expect(b).toBeDefined();
      expect(b!.pendingTasksCount).toBe(2);
    });
  },
);
