/**
 * recurring-engine.test.ts — Integration tests for the recurring engine handler.
 * Tests: per-tenant draft generation, idempotency (re-run same day), Pitfall 6 month-end, cross-tenant RLS.
 * Requires Postgres at localhost:5432 (run with infisical wrapper).
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";
const DB_URL = (process.env.DATABASE_URL_APP ?? "").replace("@db:", "@localhost:");
process.env.DATABASE_URL_APP = DB_URL;
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
const { resetPools } = await import("@budget/platform");
resetPools();

// Import AFTER resetPools to ensure pools are configured
const { runRecurringEngine } = await import("../../src/handlers/recurring-engine");

async function seedTenantForEngine(label: string): Promise<{ tenantId: string; userId: string; accountId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const accountId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, true, now(), now())`,
      [userId, `engine-${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-${userId.slice(0, 8)}@test.local`, label],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'USD', $4, 1, now())`,
      [tenantId, `eng-${tenantId.slice(0, 8)}`, label, userId],
    );
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(
      `INSERT INTO budgeting.accounts (id, tenant_id, name, kind, scope, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Checking', 'CHECKING', 'PERSONAL', 'USD', 10000.0000, now(), $3)`,
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
  return { tenantId, userId, accountId };
}

async function seedRuleWithDueDate(
  tenantId: string,
  accountId: string,
  userId: string,
  nextDueDate: string,
  cadence: "MONTHLY" | "WEEKLY" = "MONTHLY",
  cadenceAnchor: number | null = 15,
  weeklyDow: number | null = null,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const ruleId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, account_id, amount, currency, kind, cadence, cadence_anchor, weekly_dow, active, next_due_date, actor_user_id)
       VALUES ($1, $2, $3, '200', 'USD', 'EXPENSE', $4, $5, $6, true, $7::date, $8)`,
      [ruleId, tenantId, accountId, cadence, cadenceAnchor, weeklyDow, nextDueDate, userId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return ruleId;
}

async function countDraftsForRule(tenantId: string, ruleId: string): Promise<number> {
  // RLS-aware: must set app.tenant_ids GUC inside a tx so the SELECT can see rows.
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    const r = await client.query(
      `SELECT count(*) AS cnt FROM budgeting.recurring_drafts
        WHERE rule_id = $1 AND tenant_id = $2`,
      [ruleId, tenantId],
    );
    await client.query("COMMIT");
    return parseInt(r.rows[0].cnt as string, 10);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function getRuleNextDueDate(tenantId: string, ruleId: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    const r = await client.query(
      `SELECT next_due_date FROM budgeting.recurring_rules WHERE id = $1 AND tenant_id = $2`,
      [ruleId, tenantId],
    );
    await client.query("COMMIT");
    // Format as YYYY-MM-DD
    const d = r.rows[0]?.next_due_date as Date;
    return d instanceof Date ? d.toISOString().slice(0, 10) : String(r.rows[0]?.next_due_date);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

describe("recurring engine handler", () => {
  const TODAY = new Date().toISOString().slice(0, 10);

  test("generates drafts for 2 tenants × 2 rules each (4 drafts total)", { timeout: 15000 }, async () => {
    const tenantA = await seedTenantForEngine("EngineA");
    const tenantB = await seedTenantForEngine("EngineB");

    const ruleA1 = await seedRuleWithDueDate(tenantA.tenantId, tenantA.accountId, tenantA.userId, TODAY);
    const ruleA2 = await seedRuleWithDueDate(tenantA.tenantId, tenantA.accountId, tenantA.userId, TODAY);
    const ruleB1 = await seedRuleWithDueDate(tenantB.tenantId, tenantB.accountId, tenantB.userId, TODAY);
    const ruleB2 = await seedRuleWithDueDate(tenantB.tenantId, tenantB.accountId, tenantB.userId, TODAY);

    const result = await runRecurringEngine();
    expect(result.isOk()).toBe(true);

    // Each rule should have 1 draft
    expect(await countDraftsForRule(tenantA.tenantId, ruleA1)).toBe(1);
    expect(await countDraftsForRule(tenantA.tenantId, ruleA2)).toBe(1);
    expect(await countDraftsForRule(tenantB.tenantId, ruleB1)).toBe(1);
    expect(await countDraftsForRule(tenantB.tenantId, ruleB2)).toBe(1);

    // next_due_date advanced
    const nextDueA1 = await getRuleNextDueDate(tenantA.tenantId, ruleA1);
    expect(nextDueA1).not.toBe(TODAY);
  });

  test("re-running same day: UNIQUE constraint prevents double-generation (0 new drafts)", async () => {
    const tenant = await seedTenantForEngine("EngineIdempotent");
    const ruleId = await seedRuleWithDueDate(tenant.tenantId, tenant.accountId, tenant.userId, TODAY);

    // First run
    await runRecurringEngine();
    const count1 = await countDraftsForRule(tenant.tenantId, ruleId);
    expect(count1).toBe(1);

    // Manually reset next_due_date to today to simulate re-run scenario
    // (engine advances next_due_date, so we need to reset for idempotency test)
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', '{"${tenant.tenantId}"}', true)`);
      await client.query(
        `UPDATE budgeting.recurring_rules SET next_due_date = $1::date WHERE id = $2`,
        [TODAY, ruleId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }

    // Second run on same day — UNIQUE prevents duplicate
    await runRecurringEngine();
    const count2 = await countDraftsForRule(tenant.tenantId, ruleId);
    expect(count2).toBe(1); // still 1, not 2
  });

  test("Pitfall 6: MONTHLY anchor=31 Jan 31 → Feb 28 → Mar 31 (month-end preservation)", async () => {
    const tenant = await seedTenantForEngine("EnginePitfall6");
    // Simulate engine running on 2026-01-31: rule has next_due_date=2026-01-31, anchor=31
    const ruleId = await seedRuleWithDueDate(
      tenant.tenantId,
      tenant.accountId,
      tenant.userId,
      "2026-01-31",
      "MONTHLY",
      31,
    );

    // Run engine for 2026-01-31 directly
    await runRecurringEngine("2026-01-31");

    // Draft for 01-31 created
    const count = await countDraftsForRule(tenant.tenantId, ruleId);
    expect(count).toBe(1);

    // next_due_date advanced to 2026-02-28 (Feb has 28 days, anchor 31 clamped)
    const nextDue = await getRuleNextDueDate(tenant.tenantId, ruleId);
    expect(nextDue).toBe("2026-02-28");

    // Simulate Feb 28 run
    await runRecurringEngine("2026-02-28");
    const count2 = await countDraftsForRule(tenant.tenantId, ruleId);
    expect(count2).toBe(2);

    // next_due_date advanced to 2026-03-31 (anchor 31 preserved)
    const nextDue2 = await getRuleNextDueDate(tenant.tenantId, ruleId);
    expect(nextDue2).toBe("2026-03-31");
  });

  test("inactive rules not scanned", async () => {
    const tenant = await seedTenantForEngine("EngineInactive");
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    const ruleId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', '{"${tenant.tenantId}"}', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '${tenant.userId}', true)`);
      await client.query(
        `INSERT INTO budgeting.recurring_rules
           (id, tenant_id, account_id, amount, currency, kind, cadence, cadence_anchor, active, next_due_date, actor_user_id)
         VALUES ($1, $2, $3, '300', 'USD', 'EXPENSE', 'MONTHLY', 15, false, $4::date, $5)`,
        [ruleId, tenant.tenantId, tenant.accountId, TODAY, tenant.userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }

    await runRecurringEngine();
    // No draft generated for inactive rule
    expect(await countDraftsForRule(tenant.tenantId, ruleId)).toBe(0);
  });

  test("outbox has budgeting.recurring.draft.generated for each draft", async () => {
    const tenant = await seedTenantForEngine("EngineOutbox");
    const ruleId = await seedRuleWithDueDate(tenant.tenantId, tenant.accountId, tenant.userId, TODAY);

    await runRecurringEngine();

    const outboxCheck = await withInfraTx(async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`
        SELECT * FROM shared_kernel.outbox
         WHERE event_type = 'budgeting.recurring.draft.generated' AND aggregate_id = ${ruleId}
      `);
    });
    expect(outboxCheck.isOk()).toBe(true);
    if (outboxCheck.isOk()) expect(outboxCheck.value.rows.length).toBeGreaterThan(0);
  });
});
