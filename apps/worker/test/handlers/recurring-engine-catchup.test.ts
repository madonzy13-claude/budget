/**
 * recurring-engine-catchup.test.ts — Integration tests for the recurring engine catch-up loop.
 *
 * Verifies:
 *   - 3 missed weekly drafts → 3 rows in expense_ledger (confirmed_at IS NULL)
 *   - Re-run same day → ON CONFLICT DO NOTHING (idempotency, T-02-03)
 *   - next_due_date advanced past today after catch-up
 *   - DAILY cadence: 1 draft on today's run; re-run → 0 new
 *   - YEARLY cadence: 1 draft for past due date; next_due_date advances by 1 year
 *
 * Uses runRecurringEngine() with todayOverride for deterministic date control.
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
       VALUES ($1, $2, 'Recurring', now(), $3)`,
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
      `INSERT INTO budgeting.recurring_rules
         (tenant_id, category_id, amount, currency, cadence,
          cadence_anchor, weekly_dow, yearly_month,
          note, active, next_due_date, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10::date, $11)
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
        "Auto-recurring",
        opts.nextDueDate,
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
          AND recurring_rule_id = $2::uuid
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
      `SELECT next_due_date FROM budgeting.recurring_rules WHERE id = $1::uuid AND tenant_id = $2::uuid`,
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

// ──────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────

describe("recurring engine catch-up", () => {
  let fx1: Fixture;
  let fx2: Fixture;
  let fx3: Fixture;

  beforeAll(async () => {
    [fx1, fx2, fx3] = await Promise.all([
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

    const { runRecurringEngine } =
      await import("../../src/handlers/recurring-engine");

    const result = await runRecurringEngine(today);
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

    const { runRecurringEngine } =
      await import("../../src/handlers/recurring-engine");

    // First run
    const r1 = await runRecurringEngine(today);
    expect(r1.isOk()).toBe(true);
    const countAfterFirst = await countLedgerDrafts(fx1.budgetId, ruleId);
    expect(countAfterFirst).toBe(1);

    // Second run — idempotent
    const r2 = await runRecurringEngine(today);
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

    const { runRecurringEngine } =
      await import("../../src/handlers/recurring-engine");

    const r1 = await runRecurringEngine(today);
    expect(r1.isOk()).toBe(true);
    const countFirst = await countLedgerDrafts(fx2.budgetId, ruleId);
    expect(countFirst).toBe(1);

    // Re-run same day
    const r2 = await runRecurringEngine(today);
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

    const { runRecurringEngine } =
      await import("../../src/handlers/recurring-engine");

    const result = await runRecurringEngine(today);
    expect(result.isOk()).toBe(true);

    const draftCount = await countLedgerDrafts(fx3.budgetId, ruleId);
    expect(draftCount).toBe(1);

    const nextDue = await getNextDueDate(fx3.budgetId, ruleId);
    // Next March 15 is 2027-03-15
    expect(nextDue).toBe("2027-03-15");
  });
});
