/**
 * recurring-rules.test.ts — Integration tests for /recurring-rules routes.
 * Real Postgres. D-01-d enforcement: PATCH without applyToFuture → 422.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");

const DB_URL_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (DB_URL_WORKER_RAW) {
  process.env.DATABASE_URL_WORKER = DB_URL_WORKER_RAW.replace(
    "@db:",
    "@localhost:",
  );
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

let testUserId: string;
let testTenantId: string;
let testAccountId: string;

async function createTestUser() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'RR Route Test', true, now(), now())`,
      [userId, `rr-route-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'RR Route WS', 'PRIVATE', 'USD', $3, 1, now())`,
      [tenantId, `ws-rr-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'SPENDINGS', 'USD', 5000.0000, now(), $3)`,
      [accountId, tenantId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId, accountId };
}

async function buildApp(userId: string, tenantId: string) {
  const { createRecurringRulesRoute } =
    await import("../../src/routes/recurring-rules");
  const { createBudgetingModule } =
    await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool, createIdempotencyMiddleware } =
    await import("@budget/platform");
  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const budgeting = createBudgetingModule({ fxCache });

  const deps = { budgeting } as any;
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.use(createIdempotencyMiddleware());
  app.route("/recurring-rules", createRecurringRulesRoute(deps));
  return app;
}

describe("/recurring-rules", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
    testAccountId = t.accountId;
  });

  it("POST creates a monthly rule → 201 with ruleId", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: testAccountId,
        amount: "1500.00",
        currency: "USD",
        kind: "EXPENSE",
        cadence: "MONTHLY",
        cadenceAnchor: 1,
        firstDueDate: "2026-06-01",
        note: "Rent",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ruleId: string };
    expect(body.ruleId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GET returns active rules", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rules: unknown[] };
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThan(0);
  });

  it("PATCH without applyToFuture → 422 (D-01-d enforcement)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    // First create
    const createRes = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: testAccountId,
        amount: "100.00",
        currency: "USD",
        kind: "EXPENSE",
        cadence: "MONTHLY",
        cadenceAnchor: 5,
        firstDueDate: "2026-06-05",
      }),
    });
    expect(createRes.status).toBe(201);
    const { ruleId } = (await createRes.json()) as { ruleId: string };

    // PATCH without applyToFuture → 422
    const res = await app.request(`/recurring-rules/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { amount: "200.00" } }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Validation error");
  });

  it("PATCH with applyToFuture=true → 200 (rule updated)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: testAccountId,
        amount: "300.00",
        currency: "USD",
        kind: "EXPENSE",
        cadence: "MONTHLY",
        cadenceAnchor: 10,
        firstDueDate: "2026-06-10",
      }),
    });
    expect(createRes.status).toBe(201);
    const { ruleId } = (await createRes.json()) as { ruleId: string };

    const res = await app.request(`/recurring-rules/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: { amount: "350.00" },
        applyToFuture: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { affectedPendingDraftIds: string[] };
    expect(Array.isArray(body.affectedPendingDraftIds)).toBe(true);
  });

  it("DELETE soft-deletes a rule → 204", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: testAccountId,
        amount: "50.00",
        currency: "USD",
        kind: "EXPENSE",
        cadence: "WEEKLY",
        weeklyDow: 1,
        firstDueDate: "2026-06-15",
      }),
    });
    expect(createRes.status).toBe(201);
    const { ruleId } = (await createRes.json()) as { ruleId: string };

    const res = await app.request(`/recurring-rules/${ruleId}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(res.status).toBe(204);
  });

  it("POST with invalid JSON → 422", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: "{",
    });
    expect(res.status).toBe(422);
  });

  it("POST with first_due_date in past → 422", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        accountId: testAccountId,
        amount: "100.00",
        currency: "USD",
        kind: "EXPENSE",
        cadence: "MONTHLY",
        cadenceAnchor: 1,
        firstDueDate: "2020-01-01",
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("first_due_in_past");
  });
});
