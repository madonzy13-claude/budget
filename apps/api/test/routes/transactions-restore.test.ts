/**
 * transactions-restore.test.ts — 15-15: POST /budgets/:id/transactions/:txId/restore
 * brings a soft-deleted transaction back (the inverse MCP undo needs). Real
 * app, real Postgres (`infisical run --env=dev --`).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import {
  setupMcpTestEnv,
  testApp,
  baseUrl,
  signUpTestUser,
  seedBudget,
  type TestUser,
} from "../mcp/helpers";

await setupMcpTestEnv();

type App = Awaited<ReturnType<typeof testApp>>;
let app: App;
let a: TestUser;
let budgetId: string;
let categoryId: string;

function call(method: string, path: string, body?: unknown, user = a, budget = budgetId) {
  return app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: user.cookie, "x-budget-id": budget, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

async function created(): Promise<string> {
  const r = await call("POST", `/budgets/${budgetId}/transactions`, {
    date: new Date().toISOString().slice(0, 10),
    category_id: categoryId,
    amount_original_cents: 1234,
  });
  expect(r.status).toBe(201);
  return ((await r.json()) as { transaction: { id: string } }).transaction.id;
}

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  budgetId = await seedBudget(a.userId);
  categoryId = crypto.randomUUID();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{${budgetId}}`]);
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Food', now(), $3)`,
      [categoryId, budgetId, a.userId],
    );
    await c.query("COMMIT");
  } finally {
    c.release();
    await pool.end();
  }
});

describe("POST /budgets/:id/transactions/:txId/restore", () => {
  it("brings a deleted transaction back", async () => {
    const id = await created();
    expect((await call("DELETE", `/budgets/${budgetId}/transactions/${id}`)).status).toBe(204);
    expect((await call("GET", `/budgets/${budgetId}/transactions/${id}`)).status).toBe(404);

    const r = await call("POST", `/budgets/${budgetId}/transactions/${id}/restore`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { transaction: { id: string; amount_original_cents: string } };
    expect(body.transaction).toMatchObject({ id, amount_original_cents: "1234" });
    expect((await call("GET", `/budgets/${budgetId}/transactions/${id}`)).status).toBe(200);
  });

  it("refuses a transaction that is not deleted", async () => {
    const id = await created();
    const r = await call("POST", `/budgets/${budgetId}/transactions/${id}/restore`);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toBe("not_deleted");
  });

  it("answers 404 for an unknown id", async () => {
    const r = await call("POST", `/budgets/${budgetId}/transactions/${crypto.randomUUID()}/restore`);
    expect(r.status).toBe(404);
  });

  it("never restores another budget's transaction", async () => {
    const id = await created();
    await call("DELETE", `/budgets/${budgetId}/transactions/${id}`);
    const b = await signUpTestUser(app);
    const theirs = await seedBudget(b.userId);
    const viaTheirs = await call("POST", `/budgets/${theirs}/transactions/${id}/restore`, undefined, b, theirs);
    const viaOurs = await call("POST", `/budgets/${budgetId}/transactions/${id}/restore`, undefined, b, budgetId);
    expect(viaTheirs.status).not.toBe(200);
    expect(viaOurs.status).not.toBe(200);
    expect((await call("GET", `/budgets/${budgetId}/transactions/${id}`)).status).toBe(404);
  });
});
