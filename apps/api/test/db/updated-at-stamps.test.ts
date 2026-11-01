/**
 * updated-at-stamps.test.ts — R6 (user): every wallet and asset shows when
 * its amount last changed. A trigger stamps it on ANY path that changes the
 * balance / value (inline edit, a sale paid into a wallet, the price cron),
 * and only then — renaming must not look like a fresh balance.
 */
import { describe, it, expect } from "bun:test";
import { Pool } from "pg";

const url = (process.env.DATABASE_URL_APP ?? "").replace("@db:", "@localhost:");

async function asTenant<T>(
  tenantId: string,
  userId: string,
  run: (c: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${tenantId}"}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    const r = await run(c);
    await c.query("COMMIT");
    return r;
  } finally {
    c.release();
    await pool.end();
  }
}

async function fixture() {
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Stamps', true, now(), now())`,
      [userId, `stamps-${userId.slice(0, 8)}@example.com`],
    );
    await pool.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Stamps', 'PRIVATE', 'PLN', $3, 1, now(), true)`,
      [tenantId, `stamps-${tenantId.slice(0, 8)}`, userId],
    );
    await pool.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), tenantId, userId],
    );
  } finally {
    await pool.end();
  }
  return { userId, tenantId };
}

describe("amount-updated stamps", () => {
  it("a wallet's balance change stamps balance_updated_at; a rename does not", async () => {
    const { userId, tenantId } = await fixture();
    const id = await asTenant(
      tenantId,
      userId,
      async (c) =>
        (
          await c.query(
            `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
           VALUES (gen_random_uuid(), $1, 'Cash', 'SPENDINGS', 'PLN', 10, now() - interval '3 days', $2, 1)
           RETURNING id`,
            [tenantId, userId],
          )
        ).rows[0].id as string,
    );
    const stamp = () =>
      asTenant(
        tenantId,
        userId,
        async (c) =>
          (
            await c.query(
              `SELECT balance_updated_at FROM budgeting.wallets WHERE id = $1`,
              [id],
            )
          ).rows[0].balance_updated_at as Date | null,
      );
    const first = await stamp();
    expect(first).not.toBeNull();
    await asTenant(tenantId, userId, (c) =>
      c.query(`UPDATE budgeting.wallets SET name = 'Wallet' WHERE id = $1`, [
        id,
      ]),
    );
    expect((await stamp())!.getTime()).toBe(first!.getTime());
    await new Promise((r) => setTimeout(r, 20));
    await asTenant(tenantId, userId, (c) =>
      c.query(
        `UPDATE budgeting.wallets SET current_balance = 25 WHERE id = $1`,
        [id],
      ),
    );
    expect((await stamp())!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it("an asset's value change stamps value_updated_at; a rename does not", async () => {
    const { userId, tenantId } = await fixture();
    const id = await asTenant(
      tenantId,
      userId,
      async (c) =>
        (
          await c.query(
            `INSERT INTO budgeting.investments (id, tenant_id, budget_id, name, holding_type, quantity,
                                               current_price_cents, current_price_currency, sort_order, created_at)
           VALUES (gen_random_uuid(), $1, $1, 'Pot', 'other', '1', 10000, 'PLN', 1, now() - interval '3 days')
           RETURNING id`,
            [tenantId],
          )
        ).rows[0].id as string,
    );
    const stamp = () =>
      asTenant(
        tenantId,
        userId,
        async (c) =>
          (
            await c.query(
              `SELECT value_updated_at FROM budgeting.investments WHERE id = $1`,
              [id],
            )
          ).rows[0].value_updated_at as Date | null,
      );
    const first = await stamp();
    expect(first).not.toBeNull();
    await asTenant(tenantId, userId, (c) =>
      c.query(`UPDATE budgeting.investments SET name = 'Jar' WHERE id = $1`, [
        id,
      ]),
    );
    expect((await stamp())!.getTime()).toBe(first!.getTime());
    await new Promise((r) => setTimeout(r, 20));
    await asTenant(tenantId, userId, (c) =>
      c.query(
        `UPDATE budgeting.investments SET current_price_cents = 12000 WHERE id = $1`,
        [id],
      ),
    );
    expect((await stamp())!.getTime()).toBeGreaterThan(first!.getTime());
  });
});
