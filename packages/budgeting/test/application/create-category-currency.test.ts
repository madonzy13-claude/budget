/**
 * create-category-currency.test.ts — D-04: a category created without a
 * currency takes its budget's currency of that moment; an explicit one wins.
 * Real Postgres — run under `infisical run --env=dev`.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { createCategory } from "../../src/application/create-category";
import { DrizzleCategoryRepo } from "../../src/adapters/persistence/category-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();

async function asApp<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`, [
      USER,
      `{${TENANT}}`,
    ]);
    return await fn(c as unknown as Pool);
  } finally {
    c.release();
    await pool.end();
  }
}

describe.skipIf(!process.env.DATABASE_URL_APP)("Category currency on create", () => {
  beforeAll(async () => {
    await asApp(async (db) => {
      await db.query(
        `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
         VALUES ($1, $2, 'Ccy Create', true, now(), now())`,
        [USER, `ccy-create-${USER.slice(0, 8)}@example.com`],
      );
      await db.query(
        `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
         VALUES ($1, $2, 'Ccy Create', 'PRIVATE', 'PLN', $3, 1, now())`,
        [TENANT, `ccy-create-${TENANT.slice(0, 8)}`, USER],
      );
    });
  });

  afterAll(async () => {
    await asApp(async (db) => {
      await db.query(`DELETE FROM budgeting.categories WHERE tenant_id = $1`, [TENANT]);
      await db.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [TENANT]);
    });
  });

  const create = createCategory({ repo: new DrizzleCategoryRepo() });

  test("defaults to the budget currency when omitted", async () => {
    const r = await create({ tenantId: TENANT, actorUserId: USER, name: "Food" });
    expect(r.isOk()).toBe(true);
    expect(r._unsafeUnwrap().currency).toBe("PLN");
  });

  test("keeps an explicit currency", async () => {
    const r = await create({ tenantId: TENANT, actorUserId: USER, name: "Trips", currency: "EUR" });
    expect(r._unsafeUnwrap().currency).toBe("EUR");
  });
});
