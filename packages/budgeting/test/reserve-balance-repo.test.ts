/**
 * reserve-balance-repo.test.ts — Integration tests for ReserveBalanceRepo port + adapter.
 * D-PH2-11: 5 scenarios covering VIEW invariants (RSRV-02, RSCM-01, RSCM-02).
 * Requires real Postgres (DATABASE_URL_APP env).
 * TDD RED phase: createReserveBalanceRepo does not exist yet — all tests fail.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW) throw new Error("DATABASE_URL_APP required for integration tests");
// Substitute Docker hostname → localhost so the test runner can reach the DB.
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

interface Fixture {
  userId: string;
  budgetId: string;
  categoryId: string;
  currency: string;
}

// ──────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────

async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Reserve Test', true, now(), now())`,
      [userId, `reserve-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Reserve Budget', 'PRIVATE', $3, $4, 1, now())`,
      [budgetId, `ws-res-${budgetId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Test Category', now(), $3)`,
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

  return { userId, budgetId, categoryId, currency };
}

/**
 * Seed a category_limits row (SCD-2).
 * planned_amount_cents → normal_amount column (bigint, in cents).
 * cushion_amount_cents is in the cushion_amount_cents column (nullable, v1.1).
 * effectiveTo null = open segment.
 */
async function seedLimit(
  budgetId: string,
  categoryId: string,
  plannedCents: number,
  cushionCents: number,
  effectiveFrom: string,
  effectiveTo: string | null = null,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.category_limits
         (tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency,
          cushion_amount_cents,
          effective_from, effective_to, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $4, $5,
               $6::date, $7::date, $1)`,
      [
        budgetId,
        categoryId,
        plannedCents,
        "EUR",
        cushionCents,
        effectiveFrom,
        effectiveTo,
      ],
    );
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Seed an expense_ledger row (confirmed, no delete).
 * amount_converted_cents is the budget-currency amount.
 */
async function seedExpense(
  budgetId: string,
  categoryId: string,
  transactionDate: string,
  amountConvertedCents: number,
  kind: "SPENDING" | "INCOME" = "SPENDING",
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${budgetId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.expense_ledger
         (tenant_id, budget_id, category_id,
          amount_original_cents, currency_original,
          amount_converted_cents, fx_rate, fx_as_of,
          transaction_date, kind, confirmed_at, actor_user_id)
       VALUES ($1, $1, $2, $3, 'EUR', $3, 1.0, $4::date, $4::date, $5, now(), $1)`,
      [budgetId, categoryId, amountConvertedCents, transactionDate, kind],
    );
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Seed a budget_mode_history row (SCD-2).
 * effectiveTo null = open segment.
 */
async function seedBudgetMode(
  budgetId: string,
  actorUserId: string,
  mode: "NORMAL" | "CUSHION",
  effectiveFrom: string,
  effectiveTo: string | null = null,
): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${actorUserId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.budget_mode_history
         (budget_id, tenant_id, mode, effective_from, effective_to, actor_user_id)
       VALUES ($1, $1, $2, $3::date, $4::date, $5)`,
      [budgetId, mode, effectiveFrom, effectiveTo, actorUserId],
    );
  } finally {
    client.release();
    await pool.end();
  }
}

// ──────────────────────────────────────────────────────────────────────
// Import adapter under test (will fail RED — repo doesn't exist)
// ──────────────────────────────────────────────────────────────────────

const { createReserveBalanceRepo } = await import(
  "../src/adapters/persistence/reserve-balance-repo"
);

// ──────────────────────────────────────────────────────────────────────
// Scenario 1: Empty history — no category_limits rows
// ──────────────────────────────────────────────────────────────────────

describe("ReserveBalanceRepo — Scenario 1: empty history", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    // No limits seeded — category has zero history
  });

  test("getForBudget returns empty Map when no limits exist", async () => {
    const repo = createReserveBalanceRepo();
    const result = await repo.getForBudget(fix.budgetId, fix.budgetId, new Date());
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test("getForCategory returns Money(0, EUR) when no history", async () => {
    const repo = createReserveBalanceRepo();
    const { Money } = await import("@budget/shared-kernel");
    const money = await repo.getForCategory(
      fix.budgetId,
      fix.categoryId,
      fix.budgetId,
      new Date(),
    );
    expect(money.amountCents).toBe(0n);
    expect(money.currency).toBe("EUR");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 2: Single-month remainder
// ──────────────────────────────────────────────────────────────────────

describe("ReserveBalanceRepo — Scenario 2: single-month remainder", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    // planned=10000 cents (100 EUR), effective from 2026-04-01
    await seedLimit(fix.budgetId, fix.categoryId, 10000, 10000, "2026-04-01");
    // spending April: 3000 cents
    await seedExpense(fix.budgetId, fix.categoryId, "2026-04-15", 3000);
  });

  test("getForCategory returns cumulative reserve including current month (today=2026-05-12)", async () => {
    const repo = createReserveBalanceRepo();
    // Apr: max(0, 10000-3000)=7000
    // May: max(0, 7000+10000-0)=17000 (no spending in May yet)
    const asOf = new Date("2026-05-12");
    const money = await repo.getForCategory(
      fix.budgetId,
      fix.categoryId,
      fix.budgetId,
      asOf,
    );
    expect(money.amountCents).toBe(17000n);
    expect(money.currency).toBe("EUR");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 3: Multi-month accumulation with overspend → clamp at 0
// ──────────────────────────────────────────────────────────────────────

describe("ReserveBalanceRepo — Scenario 3: multi-month accumulation", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    // planned=10000, effective 2026-01-01
    await seedLimit(fix.budgetId, fix.categoryId, 10000, 10000, "2026-01-01");
    // Jan: 8000 spent
    await seedExpense(fix.budgetId, fix.categoryId, "2026-01-15", 8000);
    // Feb: 12000 spent (overspend)
    await seedExpense(fix.budgetId, fix.categoryId, "2026-02-15", 12000);
    // Mar: 5000 spent
    await seedExpense(fix.budgetId, fix.categoryId, "2026-03-15", 5000);
    // Apr, May: no spending
  });

  test("getForCategory returns 25000 on 2026-05-12", async () => {
    const repo = createReserveBalanceRepo();
    // Jan: max(0, 10000-8000) = 2000
    // Feb: max(0, 2000+10000-12000) = 0  (RSRV-02 clamp)
    // Mar: max(0, 0+10000-5000) = 5000
    // Apr: max(0, 5000+10000-0) = 15000
    // May: max(0, 15000+10000-0) = 25000
    const asOf = new Date("2026-05-12");
    const money = await repo.getForCategory(
      fix.budgetId,
      fix.categoryId,
      fix.budgetId,
      asOf,
    );
    expect(money.amountCents).toBe(25000n);
    expect(money.currency).toBe("EUR");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 4: Cushion-mode flip mid-history (RSCM-02)
// ──────────────────────────────────────────────────────────────────────

describe("ReserveBalanceRepo — Scenario 4: cushion-mode flip mid-history", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    // planned=10000, cushion=6000, effective 2026-01-01
    await seedLimit(fix.budgetId, fix.categoryId, 10000, 6000, "2026-01-01");
    // NORMAL from 2026-01-01 to 2026-03-01
    await seedBudgetMode(fix.budgetId, fix.userId, "NORMAL", "2026-01-01", "2026-03-01");
    // CUSHION from 2026-03-01 onwards
    await seedBudgetMode(fix.budgetId, fix.userId, "CUSHION", "2026-03-01");
    // 5000 spent each month Jan-Apr
    await seedExpense(fix.budgetId, fix.categoryId, "2026-01-15", 5000);
    await seedExpense(fix.budgetId, fix.categoryId, "2026-02-15", 5000);
    await seedExpense(fix.budgetId, fix.categoryId, "2026-03-15", 5000);
    await seedExpense(fix.budgetId, fix.categoryId, "2026-04-15", 5000);
  });

  test("getForCategory returns 18000 on 2026-05-12 (respects mode-as-of-month)", async () => {
    const repo = createReserveBalanceRepo();
    // Jan (NORMAL, budget=10000): max(0, 10000-5000) = 5000
    // Feb (NORMAL, budget=10000): max(0, 5000+10000-5000) = 10000
    // Mar (CUSHION, budget=6000): max(0, 10000+6000-5000) = 11000
    // Apr (CUSHION, budget=6000): max(0, 11000+6000-5000) = 12000
    // May (CUSHION, budget=6000, no spend): max(0, 12000+6000-0) = 18000
    const asOf = new Date("2026-05-12");
    const money = await repo.getForCategory(
      fix.budgetId,
      fix.categoryId,
      fix.budgetId,
      asOf,
    );
    expect(money.amountCents).toBe(18000n);
    expect(money.currency).toBe("EUR");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 5: Overspend pulls reserve to zero, not negative (RSRV-02)
// ──────────────────────────────────────────────────────────────────────

describe("ReserveBalanceRepo — Scenario 5: overspend clamps at zero", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture("EUR");
    // planned=10000, effective 2026-01-01
    await seedLimit(fix.budgetId, fix.categoryId, 10000, 10000, "2026-01-01");
    // Jan: 1000 spent → reserve=9000
    await seedExpense(fix.budgetId, fix.categoryId, "2026-01-15", 1000);
    // Feb: massive overspend 25000 → max(0, 9000+10000-25000)=0
    await seedExpense(fix.budgetId, fix.categoryId, "2026-02-15", 25000);
    // Mar: 0 spent → max(0, 0+10000-0)=10000 (resets from 0)
  });

  test("getForCategory shows Feb reserve=0 (not negative) and Mar recovers", async () => {
    const repo = createReserveBalanceRepo();
    // Through Mar: max(0, 0+10000-0)=10000
    // Apr: max(0, 10000+10000-0)=20000
    // May: max(0, 20000+10000-0)=30000
    const asOf = new Date("2026-05-12");
    const money = await repo.getForCategory(
      fix.budgetId,
      fix.categoryId,
      fix.budgetId,
      asOf,
    );
    expect(money.amountCents).toBe(30000n);
    expect(money.currency).toBe("EUR");
  });

  test("getForBudget includes category entry after recovery", async () => {
    const repo = createReserveBalanceRepo();
    const asOf = new Date("2026-05-12");
    const map = await repo.getForBudget(fix.budgetId, fix.budgetId, asOf);
    const balance = map.get(fix.categoryId);
    expect(balance).toBeDefined();
    expect(balance!.amountCents).toBe(30000n);
  });
});
