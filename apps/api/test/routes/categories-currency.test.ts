/**
 * categories-currency.test.ts — PATCH /categories/:id/currency (D-07).
 * Real Postgres; the dev DB's real FX history supplies today's rates.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const RAW = process.env.DATABASE_URL_APP;
if (!RAW) throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

let userId: string;
let tenantId: string;

async function createBudget() {
  const pool = new Pool({ connectionString: DB_URL });
  const c = await pool.connect();
  userId = crypto.randomUUID();
  tenantId = crypto.randomUUID();
  try {
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at) VALUES ($1, $2, 'Ccy', true, now(), now())`,
      [userId, `cat-ccy-${userId.slice(0, 8)}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Ccy', 'PRIVATE', 'PLN', $3, 1, now())`,
      [tenantId, `cat-ccy-${tenantId.slice(0, 8)}`, userId],
    );
  } finally {
    c.release();
    await pool.end();
  }
}

async function buildApp() {
  const { createCategoriesRoute } = await import("../../src/routes/categories");
  const { DrizzleCategoryRepo } = await import("@budget/budgeting/src/adapters/persistence/category-repo");
  const { DrizzleCategoryLimitRepo } = await import("@budget/budgeting/src/adapters/persistence/category-limit-repo");
  const { createCategory } = await import("@budget/budgeting/src/application/create-category");
  const { changeCategoryCurrency } = await import("@budget/budgeting/src/application/change-category-currency");
  const deps = {
    budgeting: {
      createCategory: createCategory({ repo: new DrizzleCategoryRepo() }),
      changeCategoryCurrency: changeCategoryCurrency({ limitRepo: new DrizzleCategoryLimitRepo() }),
    },
  } as unknown as import("../../src/boot").BootedDeps;
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/categories", createCategoriesRoute(deps));
  return app;
}

const patch = (app: Hono, id: string, body: unknown) =>
  app.request(`/categories/${id}/currency`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /categories/:id/currency", () => {
  let app: Hono;
  let id: string;
  beforeAll(async () => {
    await createBudget();
    app = await buildApp();
    const res = await app.request("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Trips" }),
    });
    id = (await res.json()).category.id;
  });

  it("rejects a currency without FX history → 422", async () => {
    expect((await patch(app, id, { currency: "JPY" })).status).toBe(422);
  });

  it("an unknown category → 404", async () => {
    expect((await patch(app, crypto.randomUUID(), { currency: "EUR" })).status).toBe(404);
  });

  it("the same currency → 200, unchanged", async () => {
    const res = await patch(app, id, { currency: "PLN" });
    expect(res.status).toBe(200);
    expect((await res.json()).category.currency).toBe("PLN");
  });

  it("changes the currency → 200 with the new currency", async () => {
    const res = await patch(app, id, { currency: "EUR" });
    expect(res.status).toBe(200);
    expect((await res.json()).category.currency).toBe("EUR");
  });
});
