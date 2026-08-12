/**
 * scheduled-payment-engine-catchup.test.ts — Integration tests for the scheduled engine catch-up loop.
 *
 * Verifies:
 *   - 3 missed weekly drafts → 3 rows in expense_ledger (confirmed_at IS NULL)
 *   - Re-run same day → ON CONFLICT DO NOTHING (idempotency, T-02-03)
 *   - next_due_date advanced past today after catch-up
 *   - DAILY cadence: 1 draft on today's run; re-run → 0 new
 *   - YEARLY cadence: 1 draft for past due date; next_due_date advances by 1 year
 *
 * Uses runScheduledEngine() with todayOverride for deterministic date control.
 * Real Postgres — no mocks.
 *
 * RECR-02 / D-PH2-04
 */
import { describe, test, expect, beforeAll } from "bun:test";
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

// ──────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────

interface Fixture {
  userId: string;
  budgetId: string;
  categoryId: string;
}

async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Engine Test', true, now(), now())`,
      [userId, `engine-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Engine Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-eng-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Scheduled', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return { userId, budgetId, categoryId };
}

async function insertRule(opts: {
  tenantId: string;
  categoryId: string;
  actorUserId: string;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  cadenceAnchor?: number | null;
  weeklyDow?: number | null;
  yearlyMonth?: number | null;
  nextDueDate: string;
  endDate?: string | null;
  amount?: string;
  currency?: string;
}): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${opts.tenantId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${opts.actorUserId}', true)`,
    );
    const res = await client.query(
      `INSERT INTO budgeting.scheduled_payments
         (tenant_id, category_id, amount, currency, cadence,
          cadence_anchor, weekly_dow, yearly_month,
          note, active, next_due_date, end_date, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10::date, $11::date, $12)
       RETURNING id`,
      [
        opts.tenantId,
        opts.categoryId,
        opts.amount ?? "2500",
        opts.currency ?? "EUR",
        opts.cadence,
        opts.cadenceAnchor ?? null,
        opts.weeklyDow ?? null,
        opts.yearlyMonth ?? null,
        "Auto-scheduled",
        opts.nextDueDate,
        opts.endDate ?? null,
        opts.actorUserId,
      ],
    );
    await client.query("COMMIT");
    return res.rows[0].id as string;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function countLedgerDrafts(
  tenantId: string,
  ruleId: string,
): Promise<number> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    const res = await client.query(
      `SELECT COUNT(*) AS cnt FROM budgeting.expense_ledger
        WHERE tenant_id = $1::uuid
          AND scheduled_payment_id = $2::uuid
          AND confirmed_at IS NULL`,
      [tenantId, ruleId],
    );
    await client.query("COMMIT");
    return parseInt(res.rows[0].cnt, 10);
  } finally {
    client.release();
    await pool.end();
  }
}

async function getNextDueDate(
  tenantId: string,
  ruleId: string,
): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    const res = await client.query(
      `SELECT next_due_date FROM budgeting.scheduled_payments WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [ruleId, tenantId],
    );
    await client.query("COMMIT");
    const d = res.rows[0]?.next_due_date as string | Date;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  } finally {
    client.release();
    await pool.end();
  }
}

async function getRuleActive(
  tenantId: string,
  ruleId: string,
): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${tenantId}"}', true)`,
    );
    const res = await client.query(
      `SELECT active FROM budgeting.scheduled_payments WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [ruleId, tenantId],
    );
    await client.query("COMMIT");
    return Boolean(res.rows[0]?.active);
  } finally {
    client.release();
    await pool.end();
  }
}

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────

describe("scheduled engine catch-up", () => {
  let fx1: Fixture;
  let fx2: Fixture;
  let fx3: Fixture;
  let fx4: Fixture;
  let fx5: Fixture;

  beforeAll(async () => {
    [fx1, fx2, fx3, fx4, fx5] = await Promise.all([
      createFixture("EUR"),
      createFixture("EUR"),
      createFixture("EUR"),
      createFixture("EUR"),
      createFixture("EUR"),
    ]);
  });

  test("weekly catch-up: 3 missed Mondays → 3 drafts in expense_ledger", async () => {
    // TODAY in test = 2026-05-04 (a Monday — the 3rd missed Monday itself)
    // 3 missed Mondays: 2026-04-20, 2026-04-27, 2026-05-04
    const today = "2026-05-04";
    const ruleId = await insertRule({
      tenantId: fx1.budgetId,
      categoryId: fx1.categoryId,
      actorUserId: fx1.userId,
      cadence: "WEEKLY",
      weeklyDow: 1, // Monday
      nextDueDate: "2026-04-20", // 3 actual Mondays ago
      amount: "2500",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");

    const result = await runScheduledEngine(today);
    expect(result.isOk()).toBe(true);
    const draftCount = await countLedgerDrafts(fx1.budgetId, ruleId);
    expect(draftCount).toBe(3);

    const nextDue = await getNextDueDate(fx1.budgetId, ruleId);
    // Next Monday after 2026-05-04 is 2026-05-11
    expect(nextDue).toBe("2026-05-11");
  });

  test("idempotency: re-running on same day produces 0 new drafts (ON CONFLICT DO NOTHING)", async () => {
    const today = "2026-05-12";
    const ruleId = await insertRule({
      tenantId: fx1.budgetId,
      categoryId: fx1.categoryId,
      actorUserId: fx1.userId,
      cadence: "WEEKLY",
      weeklyDow: 1,
      nextDueDate: "2026-05-11", // last Monday
      amount: "1000",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");

    // First run
    const r1 = await runScheduledEngine(today);
    expect(r1.isOk()).toBe(true);
    const countAfterFirst = await countLedgerDrafts(fx1.budgetId, ruleId);
    expect(countAfterFirst).toBe(1);

    // Second run — idempotent
    const r2 = await runScheduledEngine(today);
    expect(r2.isOk()).toBe(true);
    const countAfterSecond = await countLedgerDrafts(fx1.budgetId, ruleId);
    expect(countAfterSecond).toBe(1); // still 1
  });

  test("DAILY: 1 draft produced for today; re-run → 0 new", async () => {
    const today = "2026-05-12";
    const ruleId = await insertRule({
      tenantId: fx2.budgetId,
      categoryId: fx2.categoryId,
      actorUserId: fx2.userId,
      cadence: "DAILY",
      nextDueDate: today,
      amount: "500",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");

    const r1 = await runScheduledEngine(today);
    expect(r1.isOk()).toBe(true);
    const countFirst = await countLedgerDrafts(fx2.budgetId, ruleId);
    expect(countFirst).toBe(1);

    // Re-run same day
    const r2 = await runScheduledEngine(today);
    expect(r2.isOk()).toBe(true);
    const countSecond = await countLedgerDrafts(fx2.budgetId, ruleId);
    expect(countSecond).toBe(1);

    const nextDue = await getNextDueDate(fx2.budgetId, ruleId);
    // After today's draft, next_due_date = 2026-05-13
    expect(nextDue).toBe("2026-05-13");
  });

  test("YEARLY: 1 draft for past-due date; next_due_date advances by 1 year", async () => {
    const today = "2026-05-12";
    // Rule was due 2026-03-15 — past due
    const ruleId = await insertRule({
      tenantId: fx3.budgetId,
      categoryId: fx3.categoryId,
      actorUserId: fx3.userId,
      cadence: "YEARLY",
      yearlyMonth: 3, // March
      cadenceAnchor: 15,
      nextDueDate: "2026-03-15",
      amount: "12000",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");

    const result = await runScheduledEngine(today);
    expect(result.isOk()).toBe(true);

    const draftCount = await countLedgerDrafts(fx3.budgetId, ruleId);
    expect(draftCount).toBe(1);

    const nextDue = await getNextDueDate(fx3.budgetId, ruleId);
    // Next March 15 is 2027-03-15
    expect(nextDue).toBe("2027-03-15");
  });

  test("end_date caps drafts (inclusive) then deactivates the rule (mig 0069)", async () => {
    // TODAY = 2026-05-12. MONTHLY on the 1st, due since 2026-02-01, end_date
    // 2026-04-01. Occurrences: Feb-01, Mar-01, Apr-01 (all <= end_date) → 3
    // drafts. May-01 is <= today but > end_date, so it must NOT be created,
    // and the rule must go inactive. Without the cap it would produce 4 drafts;
    // without deactivation `active` would stay true — both assertions bite.
    const today = "2026-05-12";
    const ruleId = await insertRule({
      tenantId: fx4.budgetId,
      categoryId: fx4.categoryId,
      actorUserId: fx4.userId,
      cadence: "MONTHLY",
      cadenceAnchor: 1,
      nextDueDate: "2026-02-01",
      endDate: "2026-04-01",
      amount: "900",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");
    const result = await runScheduledEngine(today);
    expect(result.isOk()).toBe(true);

    expect(await countLedgerDrafts(fx4.budgetId, ruleId)).toBe(3);
    expect(await getRuleActive(fx4.budgetId, ruleId)).toBe(false);

    // Re-run: deactivated rule is never scanned again → still 3, still inactive.
    await runScheduledEngine(today);
    expect(await countLedgerDrafts(fx4.budgetId, ruleId)).toBe(3);
  });

  test("next_due already past end_date: 0 drafts, rule deactivated", async () => {
    // end_date already behind next_due_date (e.g. user shortened the deadline).
    // The engine materialises nothing and retires the rule.
    const today = "2026-05-12";
    const ruleId = await insertRule({
      tenantId: fx5.budgetId,
      categoryId: fx5.categoryId,
      actorUserId: fx5.userId,
      cadence: "MONTHLY",
      cadenceAnchor: 1,
      nextDueDate: "2026-05-01",
      endDate: "2026-04-01",
      amount: "400",
      currency: "EUR",
    });

    const { runScheduledEngine } =
      await import("../../src/handlers/scheduled-payment-engine");
    const result = await runScheduledEngine(today);
    expect(result.isOk()).toBe(true);

    expect(await countLedgerDrafts(fx5.budgetId, ruleId)).toBe(0);
    expect(await getRuleActive(fx5.budgetId, ruleId)).toBe(false);
  });
});
