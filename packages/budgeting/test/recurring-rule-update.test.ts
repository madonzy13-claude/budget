/**
 * recurring-rule-update.test.ts — D-01-d acceptance tests for updateRecurringRule.
 * Tests: applyToFuture=true/false, missing applyToFuture Zod check, CONFIRMED drafts never modified.
 * Requires Postgres.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { updateRecurringRule } from "../src/application/update-recurring-rule";
import { DrizzleRecurringRuleRepo } from "../src/adapters/persistence/recurring-rule-repo";
import { DrizzleRecurringDraftRepo } from "../src/adapters/persistence/recurring-draft-repo";
import { updateRecurringRuleSchema } from "../src/contracts/api";

const SYSTEM_USER = "00000000-0000-0000-0000-000000000001";
const DB_URL = (process.env.DATABASE_URL_APP ?? "").replace("@db:", "@localhost:");
// Rewrite Docker hostname → localhost for both connection pool roles
process.env.DATABASE_URL_APP = DB_URL;
if (process.env.DATABASE_URL_WORKER) {
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace("@db:", "@localhost:");
}
const { resetPools } = await import("@budget/platform");
resetPools();

async function seedWorkspace(label: string): Promise<{ tenantId: string; userId: string; accountId: string }> {
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
      [userId, `${label.toLowerCase().replace(/[^a-z0-9]/g, '')}-${userId.slice(0, 8)}@test.local`, label],
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, $3, 'PRIVATE', 'USD', $4, 1, now())`,
      [tenantId, `ws-upd-${tenantId.slice(0, 8)}`, label, userId],
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

async function seedRuleAndFutureDraft(
  tenantId: string,
  accountId: string,
  userId: string,
  amount: string,
): Promise<{ ruleId: string; draftId: string }> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const ruleId = crypto.randomUUID();
  const draftId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO budgeting.recurring_rules
         (id, tenant_id, account_id, amount, currency, kind, cadence, cadence_anchor, active, next_due_date, actor_user_id)
       VALUES ($1, $2, $3, $4, 'USD', 'EXPENSE', 'MONTHLY', 1, true, CURRENT_DATE, $5)`,
      [ruleId, tenantId, accountId, amount, userId],
    );
    // Future PENDING draft (7 days out)
    await client.query(
      `INSERT INTO budgeting.recurring_drafts
         (id, tenant_id, rule_id, due_date, amount, currency, account_id, kind, status, actor_user_id)
       VALUES ($1, $2, $3, (CURRENT_DATE + interval '7 days')::date, $4, 'USD', $5, 'EXPENSE', 'PENDING', $6)`,
      [draftId, tenantId, ruleId, amount, accountId, SYSTEM_USER],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { ruleId, draftId };
}

describe("updateRecurringRule — D-01-d acceptance", () => {
  let ruleRepo: DrizzleRecurringRuleRepo;
  let draftRepo: DrizzleRecurringDraftRepo;

  beforeAll(() => {
    ruleRepo = new DrizzleRecurringRuleRepo();
    draftRepo = new DrizzleRecurringDraftRepo();
  });

  test("applyToFuture=true: future PENDING draft updated in place (same id, new amount)", async () => {
    const { tenantId, userId, accountId } = await seedWorkspace("UpdateRuleA");
    const { ruleId, draftId } = await seedRuleAndFutureDraft(tenantId, accountId, userId, "1500");

    const update = updateRecurringRule({ ruleRepo, draftRepo });
    const r = await update({
      tenantId,
      ruleId,
      edits: { amount: "1600" },
      applyToFuture: true,
      actorUserId: userId,
    });

    if (r.isErr()) console.error("update error:", r.error.message, r.error.stack);
    expect(r.isOk()).toBe(true);

    // Rule amount updated
    const rule = await ruleRepo.findById(tenantId, ruleId);
    expect(parseFloat(rule?.amount ?? "0")).toBeCloseTo(1600, 1);

    // Same draft id (in-place update), new amount
    const draft = await draftRepo.findById(tenantId, draftId);
    expect(draft?.id).toBe(draftId);
    expect(parseFloat(draft?.amount ?? "0")).toBeCloseTo(1600, 1);

    // Outbox has rule.updated with appliedToFuture=true and affectedPendingDraftIds
    const outboxCheck = await withInfraTx(async (tx) => {
      const drizzleTx = tx as { execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }> };
      return drizzleTx.execute(sql`
        SELECT payload_jsonb AS payload FROM shared_kernel.outbox
         WHERE event_type = 'budgeting.recurring.rule.updated' AND aggregate_id = ${ruleId}
         ORDER BY created_at DESC LIMIT 1
      `);
    });
    if (outboxCheck.isErr()) console.error("outboxCheck error:", outboxCheck.error.message);
    expect(outboxCheck.isOk()).toBe(true);
    if (outboxCheck.isOk()) expect(outboxCheck.value.rows.length).toBeGreaterThan(0);
    const payload = outboxCheck.isOk()
      ? (outboxCheck.value.rows[0] as Record<string, unknown>).payload as Record<string, unknown>
      : {};
    expect(payload.appliedToFuture).toBe(true);
    expect((payload.affectedPendingDraftIds as string[]).includes(draftId)).toBe(true);
  });

  test("applyToFuture=false: PENDING draft amount unchanged", async () => {
    const { tenantId, userId, accountId } = await seedWorkspace("UpdateRuleB");
    const { ruleId, draftId } = await seedRuleAndFutureDraft(tenantId, accountId, userId, "1500");

    const update = updateRecurringRule({ ruleRepo, draftRepo });
    const r = await update({
      tenantId,
      ruleId,
      edits: { amount: "1700" },
      applyToFuture: false,
      actorUserId: userId,
    });

    if (r.isErr()) console.error("update error:", r.error.message);
    expect(r.isOk()).toBe(true);

    // Rule updated
    const rule = await ruleRepo.findById(tenantId, ruleId);
    expect(parseFloat(rule?.amount ?? "0")).toBeCloseTo(1700, 1);

    // Draft unchanged
    const draft = await draftRepo.findById(tenantId, draftId);
    expect(parseFloat(draft?.amount ?? "0")).toBeCloseTo(1500, 1);
  });

  test("Zod schema rejects missing applyToFuture (D-01-d API enforcement)", () => {
    const parsed = updateRecurringRuleSchema.safeParse({
      edits: { amount: "1700" },
      // applyToFuture omitted — must be rejected
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("applyToFuture");
    }
  });

  test("applyToFuture=true does NOT modify CONFIRMED past drafts", async () => {
    const { tenantId, userId, accountId } = await seedWorkspace("UpdateRuleC");
    const { ruleId } = await seedRuleAndFutureDraft(tenantId, accountId, userId, "1500");

    // Seed a CONFIRMED draft in the past
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    const confirmedDraftId = crypto.randomUUID();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`);
      await client.query(`SELECT set_config('app.current_user_id', '${SYSTEM_USER}', true)`);
      await client.query(
        `INSERT INTO budgeting.recurring_drafts
           (id, tenant_id, rule_id, due_date, amount, currency, account_id, kind, status, actor_user_id, confirmed_at)
         VALUES ($1, $2, $3, (CURRENT_DATE - interval '30 days')::date, 1500, 'USD', $4, 'EXPENSE', 'CONFIRMED', $5, now())`,
        [confirmedDraftId, tenantId, ruleId, accountId, SYSTEM_USER],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
      await pool.end();
    }

    const update = updateRecurringRule({ ruleRepo, draftRepo });
    await update({
      tenantId,
      ruleId,
      edits: { amount: "1700" },
      applyToFuture: true,
      actorUserId: userId,
    });

    // Confirmed draft still 1500
    const confirmedDraft = await draftRepo.findById(tenantId, confirmedDraftId);
    expect(parseFloat(confirmedDraft?.amount ?? "0")).toBeCloseTo(1500, 1);
  });
});
