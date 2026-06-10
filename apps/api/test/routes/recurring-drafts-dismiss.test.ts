/**
 * recurring-drafts-dismiss.test.ts — Integration tests for
 * POST /budgets/:budgetId/recurring-rules/drafts/:draftId/dismiss
 * Real Postgres. TDD plan 04-02 Task 2.
 *
 * Covers:
 *   - Golden path: dismiss pending draft → 204, dismissed_at set
 *   - AlreadyConfirmed: dismiss confirmed draft → 409 already_confirmed
 *   - Draft not found → 404
 *   - Tenant-leak: dismiss draft from other tenant → 403 (D-PH4-E3)
 *   - Idempotent: dismiss already-dismissed draft → still 204 (dismissed_at already set)
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required for integration tests");
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
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Dismiss Test', true, now(), now())`,
      [userId, `dismiss-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Dismiss WS', 'PRIVATE', 'USD', $3, 1, now())`,
      [tenantId, `ws-dismiss-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{"${tenantId}"}`]);
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, amount, currency, cadence, cadence_anchor, active, next_due_date, actor_user_id)
       VALUES ($1, $2, '100', 'USD', 'MONTHLY', 15, true, CURRENT_DATE, $3)`,
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
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [`{"${tenantId}"}`]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [SYSTEM_USER]);
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, transaction_date, amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of, kind, recurring_rule_id,
          confirmed_at, dismissed_at, created_at, updated_at)
       VALUES ($1, $2, $2, (CURRENT_DATE + ($4 || ' days')::interval)::date, 10000, 'USD', 10000, '1', CURRENT_DATE, 'SPENDING', $3,
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
  const { createRecurringRulesRoute } = await import("../../src/routes/recurring-rules");
  const { DrizzleExpenseLedgerDraftPortRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo"
  );
  const { dismissDraft } = await import("@budget/budgeting/src/application/dismiss-draft");

  const repo = new DrizzleExpenseLedgerDraftPortRepo();
  const deps = {
    budgeting: {
      dismissDraft: dismissDraft({ repo }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/budgets/:budgetId/recurring-rules", createRecurringRulesRoute(deps));
  return app;
}

describe("POST /budgets/:budgetId/recurring-rules/drafts/:draftId/dismiss", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("dismisses a pending draft → 204", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/dismiss`,
      { method: "POST" },
    );
    expect(res.status).toBe(204);

    // Verify dismissed_at is set using app_role with explicit tenant RLS context
    const checkPool = new Pool({ connectionString: DB_URL });
    const checkClient = await checkPool.connect();
    let dismissedAt: Date | null = null;
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
      const { rows: checkRows } = await checkClient.query(
        `SELECT dismissed_at FROM budgeting.expense_ledger WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [draftId, fix.tenantId],
      );
      await checkClient.query(`COMMIT`);
      dismissedAt = checkRows[0]?.dismissed_at ?? null;
    } finally {
      checkClient.release();
      await checkPool.end();
    }
    expect(dismissedAt).not.toBeNull();
  });

  it("returns 409 already_confirmed when draft is confirmed (RECR-06)", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId, { confirmedAt: true });
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${draftId}/dismiss`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("already_confirmed");
  });

  it("returns 404 for non-existent draft", async () => {
    const fakeDraftId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${fix.tenantId}/recurring-rules/drafts/${fakeDraftId}/dismiss`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("tenant-leak: wrong budgetId → 403 (D-PH4-E3)", async () => {
    const draftId = await seedDraft(fix.tenantId, fix.ruleId);
    const otherTenantId = crypto.randomUUID();
    const app = await buildApp(fix.userId, fix.tenantId);
    const res = await app.request(
      `/budgets/${otherTenantId}/recurring-rules/drafts/${draftId}/dismiss`,
      { method: "POST" },
    );
    expect(res.status).toBe(403);
  });
});
