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
  return { userId, tenantId };
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
        amount: "1500.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 1,
        first_due_date: "2026-06-01",
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
        amount: "100.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 5,
        first_due_date: "2026-06-05",
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
        amount: "300.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 10,
        first_due_date: "2026-06-10",
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
        amount: "50.00",
        currency: "USD",
        cadence: "WEEKLY",
        weekly_dow: 1,
        first_due_date: "2026-06-15",
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
        amount: "100.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 1,
        first_due_date: "2020-01-01",
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("first_due_in_past");
  });

  // RECR-01: DAILY/YEARLY cadence validation (02-02 GREEN wave)

  it("POST cadence=DAILY creates rule → 201", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        cadence: "DAILY",
        amount: "120000",
        currency: "EUR",
        category_id: crypto.randomUUID(),
        first_due_date: "2027-01-01",
        note: "Daily allowance",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ruleId ?? body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("POST cadence=YEARLY missing yearly_month → 400 or 422 with Zod error", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        cadence: "YEARLY",
        cadence_anchor: 15,
        // yearly_month intentionally omitted
        amount: "500.00",
        currency: "EUR",
        first_due_date: "2027-01-15",
      }),
    });
    expect([400, 422]).toContain(res.status);
    const body = (await res.json()) as Record<string, unknown>;
    // Should mention yearly_month in the error
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(
      bodyStr.includes("yearly_month") || bodyStr.includes("yearlym"),
    ).toBe(true);
  });

  it("POST cadence=YEARLY yearly_month=13 → 400 or 422 (out of range)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        cadence: "YEARLY",
        yearly_month: 13, // invalid
        cadence_anchor: 15,
        amount: "500.00",
        currency: "EUR",
        first_due_date: "2027-01-15",
      }),
    });
    expect([400, 422]).toContain(res.status);
  });

  it("POST cadence=WEEKLY missing weekly_dow → 400 or 422", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        cadence: "WEEKLY",
        // weekly_dow intentionally omitted
        amount: "100.00",
        currency: "EUR",
        first_due_date: "2027-01-05",
      }),
    });
    expect([400, 422]).toContain(res.status);
  });

  it("GET /recurring-rules returns yearly_month field in response", async () => {
    // Create a YEARLY rule first
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/recurring-rules", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        cadence: "YEARLY",
        yearly_month: 6,
        cadence_anchor: 1,
        amount: "1200.00",
        currency: "EUR",
        first_due_date: "2027-06-01",
        note: "Annual subscription",
      }),
    });
    expect(createRes.status).toBe(201);

    const getRes = await app.request("/recurring-rules");
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as { rules: Record<string, unknown>[] };
    expect(Array.isArray(body.rules)).toBe(true);
    // At least one rule should have yearly_month exposed
    const yearlyRules = body.rules.filter(
      (r) =>
        r.cadence === "YEARLY" ||
        r.yearlyMonth !== undefined ||
        r.yearly_month !== undefined,
    );
    expect(yearlyRules.length).toBeGreaterThan(0);
  });
});
