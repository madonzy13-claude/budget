/**
 * incomes-once.test.ts — an income that arrives exactly once (260807).
 *
 * Real Postgres, because the interesting parts are the constraint that keeps
 * date and cadence agreeing and the read filter that makes a past one-time
 * income disappear without a cron.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required");
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
}
process.env.DATABASE_URL_APP = DB_URL.replace("@db:", "@localhost:");
const { resetPools } = await import("@budget/platform");
resetPools();

let userId: string;
let tenantId: string;

/** ISO date n days from today. */
function dayOffset(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seedTenant() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const c = await pool.connect();
  const u = crypto.randomUUID();
  const t = crypto.randomUUID();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.current_user_id', '${u}', true)`);
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Income Once', true, now(), now())`,
      [u, `income-once-${u}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Income Once WS', 'PRIVATE', 'PLN', $3, 1, now())`,
      [t, `ws-inc-${t.slice(0, 8)}`, u],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
  return { u, t };
}

async function buildApp() {
  const { createIncomesRoute } = await import("../../src/routes/incomes");
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/incomes", createIncomesRoute());
  return app;
}

const post = async (body: Record<string, unknown>) =>
  (await buildApp()).request("/incomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const list = async () => {
  const res = await (await buildApp()).request("/incomes");
  return (await res.json()) as {
    incomes: { id: string; cadence: string; onceDate?: string | null }[];
  };
};

beforeAll(async () => {
  const seeded = await seedTenant();
  userId = seeded.u;
  tenantId = seeded.t;
});

describe("POST /incomes — one-time", () => {
  it("takes a cadence of ONCE with a date → 201", async () => {
    const res = await post({
      name: "Bonus",
      amount: "9000.00",
      currency: "PLN",
      cadence: "ONCE",
      once_date: dayOffset(30),
    });
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { onceDate?: string };
    expect(dto.onceDate).toBe(dayOffset(30));
  });

  it("refuses a date in the past", async () => {
    // Income that already arrived is a transaction, not a plan — and the row
    // would vanish on the next read anyway (user, 260807).
    const res = await post({
      name: "Old bonus",
      amount: "10.00",
      currency: "PLN",
      cadence: "ONCE",
      once_date: dayOffset(-1),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a one-time income with no date at all", async () => {
    const res = await post({
      name: "Vague bonus",
      amount: "10.00",
      currency: "PLN",
      cadence: "ONCE",
    });
    expect(res.status).toBe(400);
  });

  it("refuses a date on a rhythm — that would be two answers to 'when'", async () => {
    const res = await post({
      name: "Salary",
      amount: "5000.00",
      currency: "PLN",
      cadence: "MONTHLY",
      cadence_anchor: 10,
      once_date: dayOffset(30),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /incomes — a one-time income that has been and gone", () => {
  it("drops out of the list the day after it arrives", async () => {
    // Written straight to the table: the API refuses to CREATE a past one, but
    // yesterday's income was perfectly valid when it was made.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const c = await pool.connect();
    const gone = crypto.randomUUID();
    const soon = crypto.randomUUID();
    try {
      await c.query(
        `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', false)`,
      );
      for (const [id, date] of [
        [gone, dayOffset(-1)],
        [soon, dayOffset(1)],
      ] as const) {
        await c.query(
          `INSERT INTO budgeting.incomes
             (id, tenant_id, name, amount, currency, cadence, once_date, active, actor_user_id)
           VALUES ($1, $2, 'Refund', 100, 'PLN', 'ONCE', $3::date, true, $4)`,
          [id, tenantId, date, userId],
        );
      }
    } finally {
      c.release();
      await pool.end();
    }
    const ids = (await list()).incomes.map((i) => i.id);
    expect(ids).not.toContain(gone);
    expect(ids).toContain(soon);
  });

  it("still lists the rhythms, which have no date to expire", async () => {
    await post({
      name: "Salary",
      amount: "5000.00",
      currency: "PLN",
      cadence: "MONTHLY",
      cadence_anchor: 10,
    });
    const monthly = (await list()).incomes.filter(
      (i) => i.cadence === "MONTHLY",
    );
    expect(monthly.length).toBeGreaterThan(0);
  });
});
