/**
 * investment-history-cross-tenant.test.ts — Tenant-leak gate (T-13-05, Phase 13).
 *
 * budgeting.investment_history (0087) holds every holding's dated money moves.
 * RLS must hide tenant A's entries from a session scoped to tenant B — SELECT
 * returns nothing and UPDATE/DELETE touch nothing, even when the WHERE clause
 * names A's budget_id. Seeding mirrors investments-cross-tenant.test.ts.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools, withTenantTx } = await import("@budget/platform");
const { TenantId, UserId } = await import("@budget/shared-kernel");
resetPools();

interface SeededBudget {
  userId: string;
  budgetId: string;
}

async function seedBudget(): Promise<SeededBudget> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Investments Leak', true, now(), now())`,
      [userId, `inv-leak-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Investments Leak Budget', 'PRIVATE', 'USD', $3, 1, now())`,
      [budgetId, `ws-invleak-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

async function seedHoldingInBudget(budgetId: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.investments
         (id, tenant_id, budget_id, name, holding_type, quantity,
          current_price_cents, current_price_currency, sort_order, created_at)
       VALUES ($1, $2, $2, 'AAPL', 'equities', '1', 42000, 'USD', 0, now())`,
      [id, budgetId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

async function seedHistory(
  budgetId: string,
  holdingId: string,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.investment_history
         (id, tenant_id, budget_id, holding_id, kind, effective_date,
          amount_cents, amount_currency, cost_delta_cents, flow_cents)
       VALUES ($1, $2, $2, $3, 'start', current_date, 42000, 'USD', 42000, 42000)`,
      [id, budgetId, holdingId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

type Exec = {
  execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
};

describe("investment history tenant-leak gate", () => {
  let budgetA: SeededBudget;
  let budgetB: SeededBudget;
  let entryInA: string;

  beforeAll(async () => {
    budgetA = await seedBudget();
    budgetB = await seedBudget();
    const holdingInA = await seedHoldingInBudget(budgetA.budgetId);
    entryInA = await seedHistory(budgetA.budgetId, holdingInA);
  });

  it("RLS hides budgetA's history from a budgetB-scoped SELECT", async () => {
    const r = await withTenantTx(
      TenantId(budgetB.budgetId),
      UserId(budgetB.userId),
      async (tx) =>
        (
          await (tx as Exec).execute(sql`
            SELECT id::text AS id FROM budgeting.investment_history
             WHERE budget_id = ${budgetA.budgetId}::uuid
          `)
        ).rows,
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.length).toBe(0);
  });

  it("budgetB-scoped UPDATE and DELETE touch none of budgetA's rows", async () => {
    const r = await withTenantTx(
      TenantId(budgetB.budgetId),
      UserId(budgetB.userId),
      async (tx) => {
        const u = await (tx as Exec).execute(sql`
          UPDATE budgeting.investment_history SET deleted_at = now()
           WHERE id = ${entryInA}::uuid RETURNING id
        `);
        const d = await (tx as Exec).execute(sql`
          DELETE FROM budgeting.investment_history
           WHERE id = ${entryInA}::uuid RETURNING id
        `);
        return u.rows.length + d.rows.length;
      },
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value).toBe(0);
  });

  it("sanity: budgetA-scoped SELECT sees its own entry", async () => {
    const r = await withTenantTx(
      TenantId(budgetA.budgetId),
      UserId(budgetA.userId),
      async (tx) =>
        (
          await (tx as Exec).execute(sql`
            SELECT id::text AS id FROM budgeting.investment_history
             WHERE id = ${entryInA}::uuid AND deleted_at IS NULL
          `)
        ).rows,
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.length).toBe(1);
  });
});
