/**
 * investment-category.test.ts — Integration tests for the r33 Investments-category
 * route (/budgets/:budgetId/investment-category). Real Postgres, no DB mocks.
 *
 *   POST   → creates THE category (first sort_index, reserve_excluded, smart), idempotent
 *   GET    → { category, hasIncome } toggle state + smart-gate hint
 *   PATCH /limit-mode → smart requires ≥1 active income (else 409 income_required)
 *   DELETE → archives (GET then returns null), reactivatable via POST
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

async function createFixture(label = "inv-cat"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'InvCat Test', true, now(), now())`,
      [userId, `${label}-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'InvCat Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ic-${budgetId.slice(0, 8)}`, userId],
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

async function addIncome(fix: Fixture): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    // RLS on incomes needs the tenant GUC LOCAL to a transaction (is_local=true
    // has no effect outside one), so wrap the insert in BEGIN/COMMIT.
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${fix.budgetId}"}', true),
              set_config('app.current_user_id', '${fix.userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.incomes (tenant_id, name, amount, currency, cadence, active, actor_user_id)
       VALUES ($1, 'Salary', 5000, 'USD', 'MONTHLY', true, $2)`,
      [fix.budgetId, fix.userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function buildApp(fix: Fixture) {
  const { createInvestmentCategoryRoute } = await import(
    "../../src/routes/investment-category"
  );
  const app = new Hono();
  app.use("*", async (c: any, next: any) => {
    c.set("session", { user: { id: fix.userId } });
    c.set("tenantIds", [fix.budgetId]);
    c.set("userId", fix.userId);
    await next();
  });
  app.route(
    "/budgets/:budgetId/investment-category",
    createInvestmentCategoryRoute(),
  );
  return app;
}

describe("/budgets/:budgetId/investment-category (r33)", () => {
  let fix: Fixture;
  let app: Hono;

  beforeAll(async () => {
    fix = await createFixture();
    app = await buildApp(fix);
  });

  const base = () => `/budgets/${fix.budgetId}/investment-category`;

  it("POST creates the pinned, reserve-excluded, smart Investments category", async () => {
    const res = await app.request(base(), { method: "POST" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.category.isInvestment).toBe(true);
    expect(body.category.investmentLimitMode).toBe("smart");
    expect(body.category.name).toBe("Investments");

    // reserve_excluded + first sort_index verified straight from the DB (RLS
    // needs the tenant GUC LOCAL to a transaction to see the row).
    const pool = new Pool({ connectionString: DB_URL });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        `SELECT set_config('app.tenant_ids', '{"${fix.budgetId}"}', true),
                set_config('app.current_user_id', '${fix.userId}', true)`,
      );
      const r = await c.query(
        `SELECT reserve_excluded, sort_index, is_investment
           FROM budgeting.categories WHERE id = $1`,
        [body.category.id],
      );
      await c.query("COMMIT");
      expect(r.rows[0].reserve_excluded).toBe(true);
      expect(r.rows[0].is_investment).toBe(true);
      expect(Number(r.rows[0].sort_index)).toBeLessThan(0); // MIN-1 → first
    } finally {
      c.release();
      await pool.end();
    }
  });

  it("POST is idempotent — reuses the single row", async () => {
    const r1 = await app.request(base(), { method: "POST" });
    const b1 = (await r1.json()) as any;
    const r2 = await app.request(base(), { method: "POST" });
    const b2 = (await r2.json()) as any;
    expect(b2.category.id).toBe(b1.category.id);
  });

  it("PATCH /limit-mode smart → 409 income_required when no income exists", async () => {
    const res = await app.request(`${base()}/limit-mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "smart" }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("income_required");
  });

  it("PATCH /limit-mode manual → 200 (no income needed)", async () => {
    const res = await app.request(`${base()}/limit-mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "manual" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).category.investmentLimitMode).toBe(
      "manual",
    );
  });

  it("PATCH /limit-mode smart → 200 once an income exists", async () => {
    await addIncome(fix);
    const res = await app.request(`${base()}/limit-mode`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "smart" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).category.investmentLimitMode).toBe(
      "smart",
    );
  });

  it("GET reports category + hasIncome", async () => {
    const res = await app.request(base(), { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.category).not.toBeNull();
    expect(body.hasIncome).toBe(true);
  });

  it("DELETE archives → GET then returns null; POST reactivates same row", async () => {
    const before = (await (
      await app.request(base(), { method: "GET" })
    ).json()) as any;
    const del = await app.request(base(), { method: "DELETE" });
    expect(del.status).toBe(204);
    const after = (await (
      await app.request(base(), { method: "GET" })
    ).json()) as any;
    expect(after.category).toBeNull();
    // Reactivate — same row id (partial unique index guarantees one).
    const re = (await (
      await app.request(base(), { method: "POST" })
    ).json()) as any;
    expect(re.category.id).toBe(before.category.id);
  });
});
