/**
 * recurring-drafts.test.ts — Integration tests for /recurring-drafts routes.
 * Real Postgres. Confirm/skip/edit-confirm/list flows.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";
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
let testRuleId: string;

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
       VALUES ($1, $2, 'RD Route Test', true, now(), now())`,
      [userId, `rd-route-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'RD Route WS', 'PRIVATE', 'USD', $3, 1, now())`,
      [tenantId, `ws-rd-${tenantId.slice(0, 8)}`, userId],
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

async function seedRule(
  tenantId: string,
  accountId: string,
  actorUserId: string,
): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const ruleId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${actorUserId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, amount, currency, cadence, cadence_anchor, active, next_due_date, actor_user_id)
       VALUES ($1, $2, '100', 'USD', 'MONTHLY', 15, true, CURRENT_DATE, $3)`,
      [ruleId, tenantId, actorUserId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return ruleId;
}

async function seedDraft(
  tenantId: string,
  ruleId: string,
  accountId: string,
  amount: string = "100",
  daysFromToday: number = 0,
): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const draftId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${SYSTEM_USER}', true)`,
    );
    // Drafts are expense_ledger rows with confirmed_at IS NULL (recurring_drafts table dropped in 02-01)
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, transaction_date, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, kind, recurring_rule_id, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $2, (CURRENT_DATE + INTERVAL '${daysFromToday} days')::date,
               ${Math.round(Number(amount) * 100)}, 'USD',
               ${Math.round(Number(amount) * 100)}, '1', CURRENT_DATE::date,
               'SPENDING', $3, NULL, now(), now())`,
      [draftId, tenantId, ruleId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return draftId;
}

async function buildApp(userId: string, tenantId: string) {
  const { createRecurringDraftsRoute } =
    await import("../../src/routes/recurring-drafts");
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
  app.route("/recurring-drafts", createRecurringDraftsRoute(deps));
  return app;
}

describe("/recurring-drafts", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
    testAccountId = t.accountId;
    testRuleId = await seedRule(testTenantId, testAccountId, testUserId);
  });

  it("GET lists pending drafts", async () => {
    await seedDraft(testTenantId, testRuleId, testAccountId, "100", 1);
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/recurring-drafts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drafts: unknown[] };
    expect(Array.isArray(body.drafts)).toBe(true);
    expect(body.drafts.length).toBeGreaterThan(0);
  });

  it("POST /:id/confirm → 201 with ledgerId", async () => {
    const draftId = await seedDraft(
      testTenantId,
      testRuleId,
      testAccountId,
      "100",
      2,
    );
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request(`/recurring-drafts/${draftId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ledgerId: string };
    expect(body.ledgerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("POST /:id/confirm twice → second is 409 already_confirmed", async () => {
    const draftId = await seedDraft(
      testTenantId,
      testRuleId,
      testAccountId,
      "100",
      3,
    );
    const app = await buildApp(testUserId, testTenantId);
    const r1 = await app.request(`/recurring-drafts/${draftId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(r1.status).toBe(201);

    const r2 = await app.request(`/recurring-drafts/${draftId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(r2.status).toBe(409);
    const body = (await r2.json()) as { error: string };
    expect(body.error).toBe("already_confirmed");
  });

  it("POST /:id/skip → 204", async () => {
    const draftId = await seedDraft(
      testTenantId,
      testRuleId,
      testAccountId,
      "100",
      4,
    );
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request(`/recurring-drafts/${draftId}/skip`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(res.status).toBe(204);
  });

  it("POST /:id/edit-confirm with new amount → 201", async () => {
    const draftId = await seedDraft(
      testTenantId,
      testRuleId,
      testAccountId,
      "100",
      5,
    );
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request(`/recurring-drafts/${draftId}/edit-confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ edits: { amount: "150.00" } }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ledgerId: string };
    expect(body.ledgerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("POST /:id/confirm on non-existent draft → 404", async () => {
    const fake = crypto.randomUUID();
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request(`/recurring-drafts/${fake}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    expect(res.status).toBe(404);
  });
});
