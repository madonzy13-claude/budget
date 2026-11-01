/**
 * investment-history-cross-tenant.test.ts — Tenant-leak gate (T-13-05, Phase 13).
 *
 * budgeting.investment_history (0087) holds every holding's dated money moves.
 * RLS must hide tenant A's entries from a session scoped to tenant B — SELECT
 * returns nothing and UPDATE/DELETE touch nothing, even when the WHERE clause
 * names A's budget_id. Seeding mirrors investments-cross-tenant.test.ts.
 *
 * 13.1 adds the asset paths: the wallet link columns, the booking commit's
 * wallet credit (cross-context write) and the label lookups must all stay
 * inside the caller's tenant.
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
         (id, tenant_id, budget_id, name, holding_type, ui_type, quantity,
          current_price_cents, current_price_currency, sort_order, created_at)
       VALUES ($1, $2, $2, 'AAPL', 'equities', 'stocks', '1', 42000, 'USD', 0, now())`,
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

async function seedWallet(budgetId: string, userId: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const id = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
       VALUES ($1, $2, 'Bank', 'SPENDINGS', 'USD', 100, now(), $3, 1)`,
      [id, budgetId, userId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
    await pool.end();
  }
  return id;
}

async function seedHistory(
  budgetId: string,
  holdingId: string,
  walletId: string | null = null,
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
          amount_cents, amount_currency, cost_delta_cents, flow_cents,
          wallet_id, wallet_delta_numeric, backfilled)
       VALUES ($1, $2, $2, $3, 'start', current_date, 42000, 'USD', 42000, 42000,
               $4, CASE WHEN $4::uuid IS NULL THEN NULL ELSE 12.5 END, true)`,
      [id, budgetId, holdingId, walletId],
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
  let walletInA: string;
  let holdingInA: string;

  beforeAll(async () => {
    budgetA = await seedBudget();
    budgetB = await seedBudget();
    holdingInA = await seedHoldingInBudget(budgetA.budgetId);
    walletInA = await seedWallet(budgetA.budgetId, budgetA.userId);
    entryInA = await seedHistory(budgetA.budgetId, holdingInA, walletInA);
  });

  const balanceInA = async () => {
    const r = await withTenantTx(
      TenantId(budgetA.budgetId),
      UserId(budgetA.userId),
      async (tx) =>
        (
          await (tx as Exec).execute(sql`
            SELECT current_balance::text AS b FROM budgeting.wallets WHERE id = ${walletInA}::uuid
          `)
        ).rows[0]?.b,
    );
    return r.isOk() ? r.value : undefined;
  };

  it("13.1: the wallet link / backfill columns of budgetA stay hidden from budgetB", async () => {
    const r = await withTenantTx(
      TenantId(budgetB.budgetId),
      UserId(budgetB.userId),
      async (tx) =>
        (
          await (tx as Exec).execute(sql`
            SELECT wallet_id, wallet_delta_numeric, backfilled FROM budgeting.investment_history
             WHERE id = ${entryInA}::uuid
          `)
        ).rows,
    );
    expect(r.isOk() && r.value.length).toBe(0);
  });

  it("13.1: a budgetB booking cannot credit budgetA's wallet", async () => {
    const { DrizzleHistoryRepo } =
      await import("../../packages/investments/src/adapters/persistence/history-repo");
    await expect(
      new DrizzleHistoryRepo().commit(budgetB.budgetId, budgetB.userId, {
        budgetId: budgetB.budgetId,
        patches: [],
        entries: [],
        walletCredit: {
          target: { walletId: walletInA },
          amountMajor: "1000",
          currency: "USD",
        },
      }),
    ).rejects.toThrow("not_found");
    expect(await balanceInA()).toBe("100.0000");
  });

  it("13.1: a budgetB undo cannot soft-delete budgetA's entry or reverse its wallet credit", async () => {
    const { DrizzleHistoryRepo } =
      await import("../../packages/investments/src/adapters/persistence/history-repo");
    await new DrizzleHistoryRepo().commit(budgetB.budgetId, budgetB.userId, {
      budgetId: budgetB.budgetId,
      patches: [],
      entries: [],
      softDeleteEntryIds: [entryInA],
      walletCredit: {
        target: { walletId: walletInA },
        amountMajor: "12.5",
        currency: "USD",
        reverse: true,
      },
    });
    expect(await balanceInA()).toBe("100.0000");
    const r = await withTenantTx(
      TenantId(budgetA.budgetId),
      UserId(budgetA.userId),
      async (tx) =>
        (
          await (tx as Exec).execute(sql`
            SELECT 1 FROM budgeting.investment_history WHERE id = ${entryInA}::uuid AND deleted_at IS NULL
          `)
        ).rows.length,
    );
    expect(r.isOk() && r.value).toBe(1);
  });

  it("13.1: lookups scoped to budgetB never return budgetA's assets", async () => {
    const { DrizzleHoldingRepo } =
      await import("../../packages/investments/src/adapters/persistence/holding-repo");
    const repo = new DrizzleHoldingRepo();
    // Labels are not unique since 13.1-51 — assets are found by id.
    expect(
      await repo.findById(budgetB.budgetId, budgetB.userId, holdingInA),
    ).toBeNull();
    expect(
      await repo.listNames(budgetB.budgetId, budgetA.budgetId, "stocks"),
    ).toEqual([]);
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
