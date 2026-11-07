/**
 * wealth-snapshots-import.test.ts — 15-21: POST …/overview/wealth-snapshots/import
 * writes past wealth points from a balance history; DELETE …/:snapshotId removes
 * an imported one and never a worker snapshot or another budget's.
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
let b: string;
let other: { user: TestUser; budget: string };

async function call(method: string, path: string, body?: unknown, who = a, budget = b) {
  const res = await app.fetch(
    new Request(`${baseUrl()}${path}`, {
      method,
      headers: { cookie: who.cookie, "x-budget-id": budget, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
  return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) };
}

const point = (date: string, cents = "12345") => ({ date, wallets: [{ amount_cents: cents, currency: "PLN" }] });
const importPath = (budget = b) => `/budgets/${budget}/overview/wealth-snapshots/import`;

beforeAll(async () => {
  app = await testApp();
  a = await signUpTestUser(app);
  b = await seedBudget(a.userId, { currency: "PLN" });
  const u = await signUpTestUser(app);
  other = { user: u, budget: await seedBudget(u.userId, { currency: "PLN" }) };
}, 30_000);

describe("POST /budgets/:id/overview/wealth-snapshots/import", () => {
  it("writes the points, and the wealth series then shows them", async () => {
    const r = await call("POST", importPath(), { points: [point("2024-02-29")] });
    expect(r.status).toBe(201);
    expect(r.body.created).toHaveLength(1);
    expect(r.body.skipped_existing).toEqual([]);
    const w = await call("GET", `/budgets/${b}/overview/wealth?from=2024-02-01&to=2024-03-31`);
    expect(w.body.series.map((p: any) => p.value_cents)).toContain("12345");
  });

  it("leaves a day that already has a snapshot alone", async () => {
    const r = await call("POST", importPath(), { points: [point("2024-02-29", "99")] });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ created: [], skipped_existing: ["2024-02-29"] });
  });

  it("refuses a malformed body", async () => {
    for (const body of [
      { points: Array.from({ length: 501 }, (_, i) => point(`2020-01-${String((i % 28) + 1).padStart(2, "0")}`)) },
      { points: [point("2024-2-1")] },
      { points: [{ date: "2024-01-01", wallets: [{ amount_cents: "1.5", currency: "PLN" }] }] },
      { points: [{ date: "2024-01-01", wallets: [{ amount_cents: "1", currency: "PL" }] }] },
    ])
      expect((await call("POST", importPath(), body)).status).toBe(422);
  });

  it("is not reachable for another user's budget", async () => {
    expect((await call("POST", importPath(other.budget), { points: [point("2024-01-31")] })).status).toBe(404);
  });
});

describe("DELETE /budgets/:id/overview/wealth-snapshots/:snapshotId", () => {
  it("deletes an imported snapshot once", async () => {
    const id = (await call("POST", importPath(), { points: [point("2024-04-30")] })).body.created[0].id;
    expect((await call("DELETE", `/budgets/${b}/overview/wealth-snapshots/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/budgets/${b}/overview/wealth-snapshots/${id}`)).status).toBe(404);
  });

  it("never deletes a worker snapshot, an unknown id or another budget's", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const c = await pool.connect();
    let workerId: string;
    try {
      await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [`{${b}}`]);
      workerId = (
        await c.query(
          `INSERT INTO budgeting.budget_wealth_snapshots
             (tenant_id, budget_id, captured_at, capitalization_cents, investment_value_cents, currency)
           VALUES ($1, $1, '2024-05-31T00:00:00Z', 1, 0, 'PLN') RETURNING id`,
          [b],
        )
      ).rows[0].id;
    } finally {
      c.release();
      await pool.end();
    }
    const theirs = (
      await call("POST", importPath(other.budget), { points: [point("2024-06-30")] }, other.user, other.budget)
    ).body.created[0].id;
    for (const id of [workerId, crypto.randomUUID(), theirs])
      expect((await call("DELETE", `/budgets/${b}/overview/wealth-snapshots/${id}`)).status).toBe(404);
    expect((await call("DELETE", `/budgets/${other.budget}/overview/wealth-snapshots/${theirs}`)).status).toBe(404);
  });
});
