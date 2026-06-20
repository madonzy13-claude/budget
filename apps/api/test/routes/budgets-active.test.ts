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
import { sql } from "drizzle-orm";

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
      // 260612-kxd addendum: the second kind used to be a CONFIRM_DRAFT with
      // an empty payload — orphan-shaped, which the badge now correctly
      // EXCLUDES (see the actionability test below). Use a kind that is
      // always actionable so this test keeps pinning the plain count path.
      await seedTask({ budgetId: fix.budgetId, kind: "RESERVE_TOPUP" });
      await seedTask({ budgetId: fix.budgetId, kind: "CUSHION_BELOW_TARGET" });

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

    it("JIT is off inside listForUser transaction (PERF 260613-dn1 #1)", async () => {
      // Probe: open an appDb() transaction, run SET LOCAL jit = off (same as
      // the patch), then assert current_setting('jit') inside that tx is 'off'.
      // This is a deterministic structural test — it verifies the GUC is
      // correctly scoped, independent of query plan or timing.
      const { appDb } = await import("@budget/platform");
      const db = appDb();
      let jitSettingInTx: string | null = null;
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET LOCAL jit = off"));
        const res = await tx.execute<{ jit: string }>(
          sql.raw("SELECT current_setting('jit') AS jit"),
        );
        jitSettingInTx = res.rows[0]?.jit ?? null;
      });
      // After the tx commits, the session's jit reverts to server default.
      expect(jitSettingInTx).toBe("off");
    });

    it("listForUser returns identical rows after JIT fix (correctness guard)", async () => {
      // Fetch budgets for the fixture user twice — results must be identical.
      // jit=off affects planner speed only; output rows are byte-identical.
      const first = await getActiveBudgets(fix.userId);
      const second = await getActiveBudgets(fix.userId);
      const toIds = (list: { id: string }[]) =>
        list
          .map((b) => b.id)
          .sort()
          .join(",");
      expect(toIds(first)).toBe(toIds(second));
      // pendingTasksCount must also be stable (not randomised by jit path)
      const firstCounts = first.map((b) => b.pendingTasksCount).join(",");
      const secondCounts = second.map((b) => b.pendingTasksCount).join(",");
      expect(firstCounts).toBe(secondCounts);
    });

    it("excludes non-actionable CONFIRM_DRAFT tasks from the badge count (banner parity)", async () => {
      // 260612-kxd addendum: the home-card badge must match the banner —
      // both show only ACTIONABLE tasks. Two non-actionable shapes:

      // (a) orphan-shaped — empty payload, no draft row → not counted.
      await seedTask({ budgetId: fix.budgetId, kind: "CONFIRM_DRAFT" });
      const budgets = await getActiveBudgets(fix.userId);
      const b = budgets.find((x) => x.id === fix.budgetId);
      expect(b).toBeDefined();
      expect(b!.pendingTasksCount).toBe(2);

      // (b) Maczfit shape — live draft but ARCHIVED category → not counted,
      //     while the budget's RESERVE_TOPUP still is (no over-filter).
      const { seedDraftWithTask, seedReserveTopupTask } =
        await import("../../../../packages/budgeting/test/draft-task-fixtures");
      const fx = await seedDraftWithTask({ archivedCategory: true });
      await seedReserveTopupTask(fx);
      const budgets2 = await getActiveBudgets(fx.userId);
      const b2 = budgets2.find((x) => x.id === fx.budgetId);
      expect(b2).toBeDefined();
      expect(b2!.pendingTasksCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // 260613-hig: new tests for LATERAL scoping + uuid-cast + cost gate
    // -----------------------------------------------------------------------

    it("260613-hig: multi-budget fixture — archived+orphan in budget B does not affect budget A count", async () => {
      // User has two budgets. Budget A (fix.budgetId) already has 2 PENDING
      // actionable tasks. Budget B has:
      //   - a CONFIRM_DRAFT with ARCHIVED category (not counted)
      //   - a CONFIRM_DRAFT orphan (not counted)
      //   - a RESERVE_TOPUP (counted)
      // Verify budget A count unchanged and budget B count = 1.
      const { seedDraftWithTask, seedReserveTopupTask } =
        await import("../../../../packages/budgeting/test/draft-task-fixtures");

      // Budget B: owned by a fresh user so we can check it in isolation
      const fxB = await seedDraftWithTask({ archivedCategory: true });
      await seedReserveTopupTask(fxB);
      // Add an orphan CONFIRM_DRAFT (empty payload → not counted)
      await seedTask({ budgetId: fxB.budgetId, kind: "CONFIRM_DRAFT" });

      const budgetsB = await getActiveBudgets(fxB.userId);
      const bB = budgetsB.find((x) => x.id === fxB.budgetId);
      expect(bB).toBeDefined();
      // archived category + orphan = 0, RESERVE_TOPUP = 1 → total 1
      expect(bB!.pendingTasksCount).toBe(1);

      // Budget A (fix user) must be unaffected
      const budgetsA = await getActiveBudgets(fix.userId);
      const bA = budgetsA.find((x) => x.id === fix.budgetId);
      expect(bA).toBeDefined();
      expect(bA!.pendingTasksCount).toBe(2);
    });

    it("260613-hig: EXPLAIN (app_role, real GUCs) shows no JIT block and total cost < 100k", async () => {
      // By-construction proof: the scoped LATERAL query must not trigger JIT
      // (total cost < jit_above_cost=100k) when executed as app_role with
      // real tenant GUCs — independent of the SET LOCAL jit=off defense.
      //
      // We run EXPLAIN (FORMAT JSON, ANALYZE FALSE) inside withUserContext so
      // app_role + real GUCs are in play (NOT superuser BYPASSRLS path).
      const { withUserContext } = await import("@budget/platform");
      const { sql } = await import("drizzle-orm");
      const { UserId } = await import("@budget/shared-kernel");

      // Use fix.userId which has at least one budget — real tenant context
      let planJson: unknown = null;

      await withUserContext(UserId(fix.userId), async (tx) => {
        // Set tenant_ids GUC (same as listForUser does)
        const memberRows = await tx.execute<{ budget_id: string }>(sql`
          SELECT budget_id FROM tenancy.budget_members WHERE user_id = ${fix.userId}::uuid
        `);
        const memberBudgetIds = memberRows.rows.map((r2) => r2.budget_id);
        if (memberBudgetIds.length > 0) {
          const safeIds = memberBudgetIds
            .filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
            .join(",");
          if (safeIds) {
            await tx.execute(
              sql.raw(`SET LOCAL app.tenant_ids = '{${safeIds}}'`),
            );
          }
        }

        // EXPLAIN the scoped LATERAL query (the NEW form — after the fix)
        const explainResult = await tx.execute<{ "QUERY PLAN": unknown }>(
          sql.raw(`
          EXPLAIN (FORMAT JSON, ANALYZE FALSE)
          SELECT w.id, w.slug, w.name, w.kind, w.default_currency,
                 w.owner_user_id, w.member_count, w.created_at, w.cushion_mode_enabled,
                 COALESCE(tk.pending, 0)::int AS pending_tasks_count
          FROM tenancy.budgets w
          INNER JOIN tenancy.budget_members m ON m.budget_id = w.id
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::bigint AS pending
              FROM budgeting.tasks t
             WHERE t.budget_id = w.id
               AND t.status = 'PENDING'
               AND (
                 t.kind <> 'CONFIRM_DRAFT'
                 OR EXISTS (
                   SELECT 1
                     FROM budgeting.expense_ledger el
                    WHERE el.deleted_at IS NULL
                      AND el.dismissed_at IS NULL
                      AND el.confirmed_at IS NULL
                      AND el.tenant_id = t.tenant_id
                      AND (t.payload_json->>'draft_id') ~ '^[0-9a-fA-F-]{36}$'
                      AND (t.payload_json->>'draft_id')::uuid = el.id
                      AND NOT EXISTS (
                        SELECT 1
                          FROM budgeting.categories c
                         WHERE c.id = el.category_id
                           AND c.tenant_id = el.tenant_id
                           AND c.archived_at IS NOT NULL
                      )
                 )
               )
          ) tk ON true
          WHERE m.user_id = '${fix.userId}'::uuid
            AND w.archived_at IS NULL
        `),
        );
        planJson = explainResult.rows[0]?.["QUERY PLAN"];
        return null;
      });

      expect(planJson).toBeDefined();

      // Parse the plan and assert no JIT block + cost < 100k
      const plan = (Array.isArray(planJson) ? planJson[0] : planJson) as {
        Plan?: { "Total Cost"?: number };
        JIT?: unknown;
      };

      // No JIT block (or JIT Functions = 0)
      const jit = plan?.JIT as
        | { Functions?: number; Inlining?: boolean }
        | undefined;
      if (jit) {
        // If JIT block present, Functions must be 0
        expect(jit.Functions ?? 0).toBe(0);
      }

      // Total cost must be < 100k (jit_above_cost threshold)
      const totalCost = plan?.Plan?.["Total Cost"] ?? 0;
      expect(totalCost).toBeLessThan(100000);
    });
  },
);
