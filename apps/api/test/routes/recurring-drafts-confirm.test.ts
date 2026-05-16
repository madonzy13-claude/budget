/**
 * recurring-drafts-confirm.test.ts — Integration tests for
 * POST /budgets/:budgetId/recurring-rules/drafts/:draftId/confirm
 * Real Postgres. TDD plan 04-02 Task 2.
 *
 * Covers:
 *   - Golden path: confirm pending draft → 204, confirmed_at set
 *   - AlreadyConfirmed: confirm twice → 409 already_confirmed
 *   - AlreadyDismissed: confirm dismissed draft → 409 already_dismissed
 *   - Draft not found → 404
 *   - Tenant-leak: confirm draft from other tenant → 403 (D-PH4-E3)
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

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";

interface Fixture {
  userId: string;
  tenantId: string;
  ruleId: string;
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Confirm Test', true, now(), now())`,
      [userId, `confirm-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Confirm WS', 'PRIVATE', 'USD', $3, 1, now())`,
      [tenantId, `ws-confirm-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${tenantId}"}`,
    ]);
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, amount, currency, cadence, cadence_anchor, active, next_due_date, actor_user_id)
       VALUES ($1, $2, '50', 'USD', 'MONTHLY', 10, true, CURRENT_DATE, $3)`,
      [ruleId, tenantId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId, ruleId };
}

let _draftDateOffset = 0;

async function seedDraft(
  tenantId: string,
  ruleId: string,
  opts: { confirmedAt?: boolean; dismissedAt?: boolean } = {},
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const draftId = crypto.randomUUID();
  // Use an increasing offset so each draft has a unique (ruleId, date) pair
  const offset = ++_draftDateOffset;
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${tenantId}"}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      SYSTEM_USER,
    ]);
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, transaction_date, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, kind, recurring_rule_id,
          confirmed_at, dismissed_at, created_at, updated_at)
       VALUES ($1, $2, $2, (CURRENT_DATE + ($4 || ' days')::interval)::date, 5000, 'USD', 5000, '1', CURRENT_DATE, 'SPENDING', $3,
               ${opts.confirmedAt ? "now()" : "NULL"},
               ${opts.dismissedAt ? "now()" : "NULL"},
               now(), now())`,
      [draftId, tenantId, ruleId, offset],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return draftId;
}

async function buildApp(userId: string, tenantId: string) {
  const { createRecurringRulesRoute } =
    await import("../../src/routes/recurring-rules");
  const { DrizzleExpenseLedgerDraftPortRepo } =
    await import("@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo");
  const { confirmDraft } =
    await import("@budget/budgeting/src/application/confirm-draft");

  const repo = new DrizzleExpenseLedgerDraftPortRepo();
  const deps = {
    budgeting: {
      confirmDraft: confirmDraft({ repo }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route(
    "/budgets/:budgetId/recurring-rules",
    createRecurringRulesRoute(deps),
  );
  return app;
}

describe("POST /budgets/:budgetId/recurring-rules/drafts/:draftId/confirm", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("confirms a pending draft → 204 (RECR-03/04 CASE B)", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    // 204 = service returned ok — confirmed_at was set
    expect(res.status).toBe(204);

    // Verify via GET that the draft no longer appears as pending (confirmed_at is set).
    // Use app_role with proper tenant context to respect RLS.
    const checkPool = new Pool({ connectionString: DB_URL });
    const checkClient = await checkPool.connect();
    let confirmedAt: Date | null = null;
    try {
      // Set RLS context: tenant_ids and current_user_id must be set as session GUCs
      await checkClient.query(`BEGIN`);
      await checkClient.query(
        `SELECT set_config('app.tenant_ids', $1, false)`,
        [`{"${fix.tenantId}"}`],
      );
      await checkClient.query(
        `SELECT set_config('app.current_user_id', $1, false)`,
        [fix.userId],
      );
      const { rows: checkRows } = await checkClient.query(
        `SELECT confirmed_at FROM budgeting.expense_ledger WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [draftId, fix.tenantId],
      );
      await checkClient.query(`COMMIT`);
      confirmedAt = checkRows[0]?.confirmed_at ?? null;
    } finally {
      checkClient.release();
      await checkPool.end();
    }
    expect(confirmedAt).not.toBeNull();
  });

  it("returns 409 already_confirmed when confirmed twice", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId, {
      confirmedAt: true,
    });
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("already_confirmed");
  });

  it("returns 409 already_dismissed when draft was dismissed first", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId, {
      dismissedAt: true,
    });
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("already_dismissed");
  });

  it("returns 404 for non-existent draft", async () => {
    const fakeDraftId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${fakeDraftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("tenant-leak: wrong budgetId → 403 (D-PH4-E3)", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const otherTenantId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${otherTenantId}/recurring-rules/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(403);
  });

  it("with amount_override_cents — promotes draft at the new amount (RECR-05 / D-PH4-INT5)", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_override_cents: 6000 }),
      },
    );
    expect(res.status).toBe(204);

    const checkPool = new Pool({ connectionString: DB_URL });
    const checkClient = await checkPool.connect();
    let row: { amount_original_cents: string; amount_converted_cents: string; confirmed_at: Date | null } | undefined;
    try {
      await checkClient.query(`BEGIN`);
      await checkClient.query(
        `SELECT set_config('app.tenant_ids', $1, false)`,
        [`{"${fix.tenantId}"}`],
      );
      await checkClient.query(
        `SELECT set_config('app.current_user_id', $1, false)`,
        [fix.userId],
      );
      const { rows } = await checkClient.query(
        `SELECT amount_original_cents, amount_converted_cents, confirmed_at
           FROM budgeting.expense_ledger
          WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [draftId, fix.tenantId],
      );
      await checkClient.query(`COMMIT`);
      row = rows[0];
    } finally {
      checkClient.release();
      await checkPool.end();
    }
    expect(row?.confirmed_at).not.toBeNull();
    expect(String(row?.amount_original_cents)).toBe("6000");
    expect(String(row?.amount_converted_cents)).toBe("6000");
  });

  it("rejects negative / non-integer amount_override_cents → 422", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_override_cents: -100 }),
      },
    );
    expect(res.status).toBe(422);
  });
});
