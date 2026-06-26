/**
 * investments-cross-tenant.test.ts — Tenant-leak gate test (T-9-13, Plan 09-05).
 *
 * budgeting.investments holds per-tenant portfolio data. Layer 2 (RLS) must hide
 * tenant A's holdings from any query scoped to tenant B, even when the WHERE clause
 * explicitly references tenant A's budget_id. This runs LIVE today (the table ships
 * in 09-01) — unlike the route-level scaffold in apps/api/test/routes/investments.test.ts
 * which waits for the 09-06 routes.
 *
 * Mirrors tasks-cross-tenant.test.ts Layer 2 (raw withTenantTx SELECT). The adapter
 * (HoldingRepo, 09-03) gets its own gate block when it lands; this asserts the RLS
 * floor in isolation so a cross-tenant holding leak is a CI failure now.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts): this is a new file.
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

describe("investments tenant-leak gate", () => {
  let budgetA: SeededBudget;
  let budgetB: SeededBudget;
  let holdingInA: string;

  beforeAll(async () => {
    budgetA = await seedBudget();
    budgetB = await seedBudget();
    holdingInA = await seedHoldingInBudget(budgetA.budgetId);
  });

  it("Layer 2: RLS hides budgetA's holdings when the GUC is scoped to budgetB", async () => {
    const r = await withTenantTx(
      TenantId(budgetB.budgetId),
      UserId(budgetB.userId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const res = await drizzleTx.execute(sql`
          SELECT id::text AS id, name, holding_type
            FROM budgeting.investments
           WHERE budget_id = ${budgetA.budgetId}::uuid
        `);
        return res.rows;
      },
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.length).toBe(0);
      expect(r.value.find((h) => h.id === holdingInA)).toBeUndefined();
    }
  });

  it("Layer 2 sanity: the same SELECT scoped to budgetA returns the seeded holding", async () => {
    const r = await withTenantTx(
      TenantId(budgetA.budgetId),
      UserId(budgetA.userId),
      async (tx) => {
        const drizzleTx = tx as {
          execute: (q: unknown) => Promise<{ rows: Record<string, unknown>[] }>;
        };
        const res = await drizzleTx.execute(sql`
          SELECT id::text AS id, name
            FROM budgeting.investments
           WHERE budget_id = ${budgetA.budgetId}::uuid
        `);
        return res.rows;
      },
    );
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.length).toBeGreaterThanOrEqual(1);
      expect(r.value.find((h) => h.id === holdingInA)).toBeDefined();
    }
  });
});
