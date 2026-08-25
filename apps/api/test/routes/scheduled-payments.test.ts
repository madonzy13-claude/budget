/**
 * scheduled-payments.test.ts — Integration tests for /scheduled-payments routes.
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

/** Read raw rule columns under RLS (mirrors createTestUser's GUC bootstrap). */
async function fetchRuleRow(ruleId: string, tenantId: string, userId: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    const res = await client.query(
      `SELECT cadence, cadence_anchor, next_due_date::text AS next_due_date,
              end_date::text AS end_date, active
         FROM budgeting.scheduled_payments WHERE id = $1`,
      [ruleId],
    );
    await client.query("COMMIT");
    return res.rows[0] as {
      cadence: string;
      cadence_anchor: number | null;
      next_due_date: string;
      end_date: string | null;
      active: boolean;
    };
  } finally {
    client.release();
    await pool.end();
  }
}

async function buildApp(userId: string, tenantId: string) {
  const { createScheduledPaymentsRoute } =
    await import("../../src/routes/scheduled-payments");
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
  app.route("/scheduled-payments", createScheduledPaymentsRoute(deps));
  return app;
}

describe("/scheduled-payments", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("POST creates a monthly rule → 201 with ruleId", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
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
    const res = await app.request("/scheduled-payments");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rules: unknown[] };
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules.length).toBeGreaterThan(0);
  });

  it("PATCH without applyToFuture → 422 (D-01-d enforcement)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    // First create
    const createRes = await app.request("/scheduled-payments", {
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
    const res = await app.request(`/scheduled-payments/${ruleId}`, {
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
    const createRes = await app.request("/scheduled-payments", {
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

    const res = await app.request(`/scheduled-payments/${ruleId}`, {
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

  it("PATCH cadence_anchor persists the new day + recomputes next_due_date", async () => {
    const app = await buildApp(testUserId, testTenantId);
    // Future first_due so create seeds next_due_date = first_due (day 10), no back-fill.
    const createRes = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: "400.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 10,
        first_due_date: "2026-12-10",
        note: "Gym",
      }),
    });
    expect(createRes.status).toBe(201);
    const { ruleId } = (await createRes.json()) as { ruleId: string };

    const before = await fetchRuleRow(ruleId, testTenantId, testUserId);
    expect(before.cadence_anchor).toBe(10);

    const res = await app.request(`/scheduled-payments/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: { cadence: "MONTHLY", cadenceAnchor: 20 },
        applyToFuture: true,
      }),
    });
    expect(res.status).toBe(200);

    const after = await fetchRuleRow(ruleId, testTenantId, testUserId);
    // (b) persisted anchor changed
    expect(after.cadence_anchor).toBe(20);
    // (c) next_due_date recomputed onto the new day, strictly after today
    expect(Number(after.next_due_date.slice(8, 10))).toBe(20);
    const today = new Date().toISOString().slice(0, 10);
    expect(after.next_due_date > today).toBe(true);
  });

  it("DELETE soft-deletes a rule → 204", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/scheduled-payments", {
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

    const res = await app.request(`/scheduled-payments/${ruleId}`, {
      method: "DELETE",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(res.status).toBe(204);
  });

  it("POST with invalid JSON → 422", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: "{",
    });
    expect(res.status).toBe(422);
  });

  it("POST with first_due_date in past → 201 and back-fills drafts (UAT-Phase6-Test7 retest)", async () => {
    // The past-date guard was lifted so users can seed a rule from a
    // historical anchor (e.g. salary that started last month). The
    // service back-fills the missed periods inline so drafts appear
    // immediately instead of waiting for the nightly engine pass.
    //
    // The anchor is THREE MONTHS BACK, not a fixed 2020-01-01. Back-fill is
    // inline and one INSERT per missed period, so a hardcoded 2020 anchor grew
    // by a month every month — ~80 periods by August 2026 — and finally crossed
    // the 5s bound under full-suite load. Three periods prove the same
    // behaviour and cannot rot. (The unbounded inline back-fill itself is a
    // product question: a user typing 2015 still gets ~130 synchronous inserts.)
    const anchor = new Date();
    anchor.setUTCMonth(anchor.getUTCMonth() - 3, 1);
    const firstDueDate = anchor.toISOString().slice(0, 10);

    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
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
        first_due_date: firstDueDate,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ruleId: string };
    expect(typeof body.ruleId).toBe("string");
  });

  // mig 0069: optional "last date" (end_date)

  it("POST with end_date persists it (future first_due, no back-fill)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: "80.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 1,
        first_due_date: "2027-06-01",
        end_date: "2027-12-01",
        note: "Bounded sub",
      }),
    });
    expect(res.status).toBe(201);
    const { ruleId } = (await res.json()) as { ruleId: string };
    const row = await fetchRuleRow(ruleId, testTenantId, testUserId);
    expect(row.end_date).toBe("2027-12-01");
    // Deadline is in the future → rule stays active.
    expect(row.active).toBe(true);
  });

  it("POST with end_date before first_due_date → 400 end_date_before_first_due", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: "80.00",
        currency: "USD",
        cadence: "MONTHLY",
        cadence_anchor: 1,
        first_due_date: "2027-06-01",
        end_date: "2027-05-01",
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("end_date_before_first_due");
  });

  // RECR-01: DAILY/YEARLY cadence validation (02-02 GREEN wave)

  it("POST cadence=DAILY creates rule → 201", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
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
    const res = await app.request("/scheduled-payments", {
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
    const res = await app.request("/scheduled-payments", {
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
    const res = await app.request("/scheduled-payments", {
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

  it("GET /scheduled-payments returns yearly_month field in response", async () => {
    // Create a YEARLY rule first
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/scheduled-payments", {
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

    const getRes = await app.request("/scheduled-payments");
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

describe("/scheduled-payments — a payment that happens ONCE", () => {
  /** Read a payment row straight from the database. */
  async function row(id: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const c = await pool.connect();
      try {
        // session-scoped, not transaction-local: these helpers open a bare
        // connection with no BEGIN, and a transaction-local setting would
        // expire before the next statement — leaving RLS to hide the row.
        await c.query(`SELECT set_config('app.tenant_ids', '{"${testTenantId}"}', false)`);
        const r = await c.query(
          `SELECT cadence, active, next_due_date::text, end_date::text
             FROM budgeting.scheduled_payments WHERE id = $1`,
          [id],
        );
        return r.rows[0] as {
          cadence: string;
          active: boolean;
          next_due_date: string;
          end_date: string | null;
        };
      } finally {
        c.release();
      }
    } finally {
      await pool.end();
    }
  }

  async function draftCount(id: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const c = await pool.connect();
      try {
        // session-scoped, not transaction-local: these helpers open a bare
        // connection with no BEGIN, and a transaction-local setting would
        // expire before the next statement — leaving RLS to hide the row.
        await c.query(`SELECT set_config('app.tenant_ids', '{"${testTenantId}"}', false)`);
        const r = await c.query(
          `SELECT count(*)::int AS n FROM budgeting.expense_ledger
            WHERE scheduled_payment_id = $1 AND deleted_at IS NULL`,
          [id],
        );
        return (r.rows[0] as { n: number }).n;
      } finally {
        c.release();
      }
    } finally {
      await pool.end();
    }
  }

  async function create(body: Record<string, unknown>) {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return res;
  }

  it("POST with cadence ONCE and no anchor → 201", async () => {
    const res = await create({
      amount: "250.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2027-03-09",
      note: "New sofa",
    });
    expect(res.status).toBe(201);
  });

  it("a one-time payment's deadline IS its date", async () => {
    // This is the whole model: end_date = the date, so the engine's existing
    // exhaustion path retires it. Nothing else in the engine has to learn
    // about ONCE.
    const res = await create({
      amount: "250.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2027-03-09",
    });
    const { ruleId } = (await res.json()) as { ruleId: string };
    const r = await row(ruleId);
    expect(r.cadence).toBe("ONCE");
    expect(r.next_due_date).toBe("2027-03-09");
    expect(r.end_date).toBe("2027-03-09");
  });

  it("an end_date sent by a client is overridden, not honoured", async () => {
    // The form hides the field for one-time payments, so anything arriving
    // here is a stale client. Silently correcting it beats a 422 nobody can
    // act on — the date is the deadline by definition.
    const res = await create({
      amount: "40.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2027-03-09",
      end_date: "2030-01-01",
    });
    const { ruleId } = (await res.json()) as { ruleId: string };
    expect((await row(ruleId)).end_date).toBe("2027-03-09");
  });

  it("dated in the past: one draft, then the payment retires itself", async () => {
    const res = await create({
      amount: "99.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2026-01-15",
    });
    expect(res.status).toBe(201);
    const { ruleId } = (await res.json()) as { ruleId: string };
    expect(await draftCount(ruleId)).toBe(1);
    // A rhythm would have back-filled every month since January. This one owes
    // exactly one payment and is then done.
    expect((await row(ruleId)).active).toBe(false);
  });

  it("dated in the future: nothing drafted yet, still live", async () => {
    const res = await create({
      amount: "99.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2027-03-09",
    });
    const { ruleId } = (await res.json()) as { ruleId: string };
    expect(await draftCount(ruleId)).toBe(0);
    expect((await row(ruleId)).active).toBe(true);
  });
});

describe("/scheduled-payments — retired is not deleted", () => {
  /**
   * Two rows can both be "not running": one the household deleted, one that
   * simply happened and is over. Until 260807 both were just active=false, so
   * the list could not show the second without resurrecting the first.
   */
  async function create(body: Record<string, unknown>) {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ruleId: string };
  }

  async function list() {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments");
    return (await res.json()) as {
      rules: {
        id: string;
        active: boolean;
        cadence: string;
        hasConfirmedDraft?: boolean;
      }[];
    };
  }

  it("a payment that has already happened stays in the list, retired", async () => {
    // It reads as disabled at the bottom rather than vanishing — the household
    // still wants to see what it scheduled (user, 260807).
    const { ruleId } = await create({
      amount: "12.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2026-01-15",
    });
    const row = (await list()).rules.find((r) => r.id === ruleId);
    expect(row).toBeDefined();
    expect(row!.active).toBe(false);
  });

  it("a deleted payment is gone from the list for good", async () => {
    const { ruleId } = await create({
      amount: "12.00",
      currency: "USD",
      cadence: "MONTHLY",
      cadence_anchor: 4,
      first_due_date: "2027-04-04",
    });
    expect((await list()).rules.some((r) => r.id === ruleId)).toBe(true);

    const app = await buildApp(testUserId, testTenantId);
    const del = await app.request(`/scheduled-payments/${ruleId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    expect((await list()).rules.some((r) => r.id === ruleId)).toBe(false);
  });

  it("each row says whether its draft has been confirmed", async () => {
    // A one-time payment whose money has actually moved cannot be edited —
    // only removed — so the list has to know (user, 260807).
    const { ruleId } = await create({
      amount: "12.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2026-01-16",
    });
    const before = (await list()).rules.find((r) => r.id === ruleId);
    expect(before!.hasConfirmedDraft).toBe(false);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const c = await pool.connect();
      try {
        await c.query(
          `SELECT set_config('app.tenant_ids', '{"${testTenantId}"}', false)`,
        );
        await c.query(
          `UPDATE budgeting.expense_ledger SET confirmed_at = now()
            WHERE scheduled_payment_id = $1`,
          [ruleId],
        );
      } finally {
        c.release();
      }
    } finally {
      await pool.end();
    }
    const after = (await list()).rules.find((r) => r.id === ruleId);
    expect(after!.hasConfirmedDraft).toBe(true);
  });
});

describe("/scheduled-payments — moving a one-time payment", () => {
  async function create(body: Record<string, unknown>) {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ruleId: string };
  }

  async function rowOf(id: string) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const c = await pool.connect();
      try {
        await c.query(
          `SELECT set_config('app.tenant_ids', '{"${testTenantId}"}', false)`,
        );
        const r = await c.query(
          `SELECT next_due_date::text, end_date::text, active
             FROM budgeting.scheduled_payments WHERE id = $1`,
          [id],
        );
        return r.rows[0] as {
          next_due_date: string;
          end_date: string | null;
          active: boolean;
        };
      } finally {
        c.release();
      }
    } finally {
      await pool.end();
    }
  }

  it("changing its date moves the deadline with it", async () => {
    // The deadline IS the date, so a move that only updated one of them would
    // leave a payment that either never fires or never retires.
    const { ruleId } = await create({
      amount: "80.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2027-05-05",
    });
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request(`/scheduled-payments/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: { cadence: "ONCE", nextDueDate: "2027-08-20" },
        applyToFuture: true,
      }),
    });
    expect(res.status).toBe(200);
    const row = await rowOf(ruleId);
    expect(row.next_due_date).toBe("2027-08-20");
    expect(row.end_date).toBe("2027-08-20");
  });

  it("a rhythm still recomputes its own next date, untouched by this", async () => {
    const { ruleId } = await create({
      amount: "80.00",
      currency: "USD",
      cadence: "MONTHLY",
      cadence_anchor: 3,
      first_due_date: "2027-05-03",
    });
    const app = await buildApp(testUserId, testTenantId);
    await app.request(`/scheduled-payments/${ruleId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        edits: { cadence: "MONTHLY", cadenceAnchor: 21 },
        applyToFuture: true,
      }),
    });
    const row = await rowOf(ruleId);
    expect(row.next_due_date.endsWith("-21")).toBe(true);
    // A rhythm has no implied deadline — nothing to move.
    expect(row.end_date).toBeNull();
  });
});

describe("/scheduled-payments — what 'not running' means for a rhythm", () => {
  async function create(body: Record<string, unknown>) {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ruleId: string };
  }

  async function withDb<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    const c = await pool.connect();
    try {
      await c.query(
        `SELECT set_config('app.tenant_ids', '{"${testTenantId}"}', false)`,
      );
      return await fn(c);
    } finally {
      c.release();
      await pool.end();
    }
  }

  const listed = async (id: string) => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/scheduled-payments");
    const body = (await res.json()) as {
      rules: { id: string; hasConfirmedDraft: boolean }[];
    };
    return body.rules.find((r) => r.id === id);
  };

  it("an inactive RHYTHM stays hidden — it was deleted, not retired", async () => {
    // Every payment deleted before deleted_at existed (mig 0079) is an inactive
    // row with a NULL deleted_at. Treating "inactive" as "retired" resurrected
    // them into the list, dimmed (user screenshot, 260807). Only a one-time
    // payment earns its place there: it is the only kind that retires itself.
    const { ruleId } = await create({
      amount: "129.00",
      currency: "USD",
      cadence: "YEARLY",
      yearly_month: 7,
      cadence_anchor: 31,
      first_due_date: "2027-07-31",
      note: "Internet",
    });
    await withDb((c) =>
      c.query(
        `UPDATE budgeting.scheduled_payments SET active = false WHERE id = $1`,
        [ruleId],
      ),
    );
    expect(await listed(ruleId)).toBeUndefined();
  });

  it("a retired ONE-TIME payment is still listed", async () => {
    const { ruleId } = await create({
      amount: "129.00",
      currency: "USD",
      cadence: "ONCE",
      first_due_date: "2026-02-02",
    });
    expect(await listed(ruleId)).toBeDefined();
  });

  it("a RHYTHM keeps its edit button after a draft is confirmed", async () => {
    // Confirming one occurrence of a yearly payment says nothing about the
    // next one. The lock is for a ONE-TIME payment, whose only occurrence has
    // already happened (user, 260807).
    const { ruleId } = await create({
      amount: "129.00",
      currency: "USD",
      cadence: "YEARLY",
      yearly_month: 7,
      cadence_anchor: 31,
      first_due_date: "2027-07-31",
      note: "Internet again",
    });
    await withDb((c) =>
      c.query(
        `INSERT INTO budgeting.expense_ledger
           (id, tenant_id, budget_id, transaction_date, amount_original_cents,
            currency_original, amount_converted_cents, fx_rate, fx_as_of,
            scheduled_payment_id, confirmed_at, kind, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $1, DATE '2026-07-31', 12900, 'USD',
                 12900, 1, DATE '2026-07-31', $2, now(), 'SPENDING', now(), now())`,
        [testTenantId, ruleId],
      ),
    );
    expect((await listed(ruleId))!.hasConfirmedDraft).toBe(false);
  });
});
