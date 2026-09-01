/**
 * The Investments category has a third limit mode: 'none' (no limit).
 *
 * 'smart' and 'manual' were the only two, and 'smart' was assigned on create —
 * so every user who never opened the dialog had a computed limit they never
 * asked for, and the money forecast treated the category as a plan of zero that
 * every złoty overspent. 'none' is the new default and behaves exactly like a
 * normal category's no-limit: the mode drives category_limits.no_limit, so
 * nothing downstream needs to know the category is special.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";

let pool: Pool;
const TENANT = "cd110000-0000-4000-8000-000000000001";
const OWNER = "cd110000-0000-4000-8000-000000000002";

beforeAll(async () => {
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER,
    ]);
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
       VALUES ($1, 'inv-mode-none', 'b', 'PLN', $2, now()) ON CONFLICT (id) DO NOTHING`,
      [TENANT, OWNER],
    );
    await c.query(
      `INSERT INTO budgeting.categories
         (id, tenant_id, name, created_at, actor_user_id, sort_index,
          is_investment, investment_limit_mode)
       VALUES (gen_random_uuid(), $1, 'Investments', now(), $2, 0, true, 'manual')
       ON CONFLICT DO NOTHING`,
      [TENANT, OWNER],
    );
  } finally {
    c.release();
  }
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

/**
 * Set the tenant's investment category to `mode`; resolves to the constraint
 * error, or null when it was accepted. An UPDATE rather than an INSERT because
 * categories_one_investment_per_tenant allows exactly one.
 */
async function setMode(mode: string | null): Promise<string | null> {
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER,
    ]);
    await c.query(
      `UPDATE budgeting.categories SET investment_limit_mode = $2
        WHERE tenant_id = $1::uuid AND is_investment`,
      [TENANT, mode],
    );
    return null;
  } catch (e) {
    return (e as Error).message;
  } finally {
    c.release();
  }
}

describe("investment_limit_mode", () => {
  test("accepts 'none'", async () => {
    expect(await setMode("none")).toBeNull();
  });

  test("still accepts 'manual' and 'smart'", async () => {
    // The migration must widen the constraint, not replace it — 'manual' is a
    // deliberate user choice that survives, and 'smart' is still selectable.
    expect(await setMode("manual")).toBeNull();
    expect(await setMode("smart")).toBeNull();
  });

  test("still rejects anything else", async () => {
    const err = await setMode("whatever");
    expect(err).toContain("categories_investment_limit_mode_chk");
  });
});
