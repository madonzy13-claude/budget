/**
 * overview-projection.test.ts — Integration test for
 * GET /budgets/:id/overview/projection (Overview cash-flow projection timeline).
 *
 * Real Postgres. Mirrors overview-cards.test.ts bootstrapping (set_config GUCs to
 * bypass RLS during seed, @db:→@localhost: rewrite, resetPools). Wires the REAL
 * loader computeCashflowProjection over the seeded budget's raw SQL, but injects a
 * FAKE reservePositions (empty Map) and a minimal fxProvider stub — this test
 * targets the loader's SQL + route boundary (string cents, tenant guard, day
 * series), not FX/reserve math (both unit-tested elsewhere). A bare seeded budget
 * with no wallets/categories is enough: the day series spans the window regardless.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { ok } from "@budget/shared-kernel";

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
       VALUES ($1, $2, 'Projection Test', true, now(), now())`,
      [userId, `proj-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'Projection Budget', 'PRIVATE', 'USD', $3, 1, true, 6, now())`,
      [budgetId, `ws-proj-${budgetId.slice(0, 8)}`, userId],
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

async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { registerOverviewProjectionRoutes } =
    await import("../../src/routes/overview-projection");
  const { computeCashflowProjection } =
    await import("@budget/budgeting/src/application/compute-cashflow-projection");

  // REAL loader (real SQL over the seeded budget); FAKE reserve seam + FX stub.
  const getCashflowProjection = computeCashflowProjection({
    fxProvider: { rateAsOf: async () => ({ rate: "1" }) },
    reservePositions: async () => ok({ userDefinedCents: 0n }),
  } as never);

  const deps = { budgeting: { getCashflowProjection } } as never;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    await next();
  });
  const budgetsR = new Hono();
  registerOverviewProjectionRoutes(budgetsR, deps);
  app.route("/budgets", budgetsR);
  return app;
}

describe("GET /budgets/:id/overview/projection", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  test("returns a day series spanning today → end of next month", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/${fix.budgetId}/overview/projection`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currency: string;
      days: { available_cents: string; color: string }[];
      summary: { worst_shortfall_cents: string };
    };
    expect(typeof body.currency).toBe("string");
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBeGreaterThan(28); // at least ~1 month + 1 day
    // strings, not bigints, at the boundary
    expect(typeof body.days[0].available_cents).toBe("string");
    expect(body.summary).toHaveProperty("worst_shortfall_cents");
    expect(["green", "yellow", "red"]).toContain(body.days[0].color);
  });

  test("unknown budget → 404 (IDOR guard)", async () => {
    const app = await buildApp({
      userId: fix.userId,
      allowedTenantIds: [fix.budgetId],
    });
    const res = await app.request(
      `/budgets/00000000-0000-0000-0000-0000000000ff/overview/projection`,
    );
    expect(res.status).toBe(404);
  });
});
