/**
 * Moving a scheduled payment TO today produces its draft on save.
 *
 * It did not. Drafts are materialised by a cron at 06:00 UTC, and CREATE has
 * carried an inline catch-up for exactly that reason since it was written —
 * its comment names the wait: "a user who creates a back-dated rule at noon
 * waits ~18h for the drafts to appear". UPDATE never got the same treatment,
 * so editing an existing payment's date to today did nothing until the next
 * morning, with nothing on screen to say so (user, 260902: "I just changed
 * kite 10m scheduled payment to today and it didn't appear, why??").
 *
 * The daily engine stays as the backstop. Its INSERT is idempotent on
 * (scheduled_payment_id, transaction_date), so both running cannot double-post
 * — which the second test pins by editing twice.
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

let userId: string;
let tenantId: string;

/** Today in UTC, the basis the engine uses. */
const today = new Date().toISOString().slice(0, 10);

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const c = await pool.connect();
  const uid = crypto.randomUUID();
  const tid = crypto.randomUUID();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Due Today', true, now(), now())`,
      [uid, `due-today-${uid.slice(0, 8)}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Due Today', 'PRIVATE', 'USD', $3, 1, now())`,
      [tid, `dt-${tid.slice(0, 8)}`, uid],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
  return { userId: uid, tenantId: tid };
}

async function buildApp() {
  const { createScheduledPaymentsRoute } = await import(
    "../../src/routes/scheduled-payments"
  );
  const { createBudgetingModule } = await import(
    "@budget/budgeting/src/contracts/factory"
  );
  const { DrizzleFxRateCacheRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo"
  );
  const { workerPool, createIdempotencyMiddleware } = await import(
    "@budget/platform"
  );
  const budgeting = createBudgetingModule({
    fxCache: new DrizzleFxRateCacheRepo(workerPool()),
  });
  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.use(createIdempotencyMiddleware());
  app.route(
    "/scheduled-payments",
    createScheduledPaymentsRoute({ budgeting } as never),
  );
  return app;
}

/** Drafts this rule has materialised. */
async function draftsFor(ruleId: string): Promise<string[]> {
  const pool = new Pool({ connectionString: DB_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${tenantId}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    const r = await c.query(
      `SELECT transaction_date::text AS d FROM budgeting.expense_ledger
        WHERE scheduled_payment_id = $1::uuid AND deleted_at IS NULL
        ORDER BY transaction_date`,
      [ruleId],
    );
    await c.query("COMMIT");
    return r.rows.map((x: { d: string }) => x.d);
  } finally {
    c.release();
    await pool.end();
  }
}

/** Move an existing rule's one-time date. */
async function setDueDate(ruleId: string, date: string): Promise<number> {
  const app = await buildApp();
  const res = await app.request(`/scheduled-payments/${ruleId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ edits: { nextDueDate: date }, applyToFuture: true }),
  });
  return res.status;
}

async function createRule(firstDue: string): Promise<string> {
  const app = await buildApp();
  const res = await app.request("/scheduled-payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: "53.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: firstDue,
      note: "Kite",
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { ruleId: string }).ruleId;
}

beforeAll(async () => {
  const t = await createTestUser();
  userId = t.userId;
  tenantId = t.tenantId;
});

/** A date comfortably in the future, and one comfortably further out. */
const future = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
const further = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);

describe("moving a scheduled payment to today", () => {
  it("materialises its draft on save, not tomorrow morning", async () => {
    // THE reported bug: a rule that was not due, edited to today.
    const ruleId = await createRule(future);
    expect(await draftsFor(ruleId)).toEqual([]);
    expect(await setDueDate(ruleId, today)).toBe(200);
    expect(await draftsFor(ruleId)).toEqual([today]);
  });

  it("editing again does not double-post the draft", async () => {
    // The nightly engine will pass over the same rule; the write path and the
    // cron must converge on ONE draft per due date.
    const ruleId = await createRule(future);
    await setDueDate(ruleId, today);
    await setDueDate(ruleId, today);
    expect(await draftsFor(ruleId)).toEqual([today]);
  });

  it("moving it to a FUTURE date materialises nothing", async () => {
    // Only what is DUE becomes a draft — a payment next month must not appear
    // in this month's spendings.
    const ruleId = await createRule(future);
    expect(await setDueDate(ruleId, further)).toBe(200);
    expect(await draftsFor(ruleId)).toEqual([]);
  });

  it("creating one already due still works", async () => {
    // The path that was already right, kept honest.
    const ruleId = await createRule(today);
    expect(await draftsFor(ruleId)).toEqual([today]);
  });
});
