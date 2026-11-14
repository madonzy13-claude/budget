/**
 * category-currency-defaults.test.ts — migration 0104 currency defaults.
 *
 * D-04: a category created without an explicit currency takes its budget's
 * currency of that moment. Reserve adjustments are written in their category's
 * currency (D-10/D-17 convert them from it at their own date).
 *
 * Real Postgres — run under `infisical run --env=dev`.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { DrizzleCategoryReserveAdjustmentsRepo } from "../../src/adapters/persistence/category-reserve-adjustments-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k])
    process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
const PLAIN_CAT = crypto.randomUUID();
const EUR_CAT = crypto.randomUUID();

async function rawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

const currencyOf = async (table: "categories" | "category_reserve_adjustments", where: string) => {
  const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => {
    const res = await tx.execute<{ currency: string }>(
      sql`SELECT currency FROM ${sql.raw(`budgeting.${table}`)} WHERE ${sql.raw(where)}`,
    );
    return ((res as any).rows ?? res)[0]?.currency as string | undefined;
  });
  if (r.isErr()) throw r.error;
  return r.value;
};

describe.skipIf(!process.env.DATABASE_URL_APP)("Category currency defaults (0104)", () => {
  beforeAll(async () => {
    const { db, pool } = await rawDb();
    await db.execute(sql.raw(`SET app.current_user_id = '${USER}'`));
    await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
    await db.execute(sql`
      INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
      VALUES (${USER}::uuid, ${"ccy-defaults-" + USER.slice(0, 8) + "@example.com"},
              'Ccy Defaults', true, now(), now())
      ON CONFLICT DO NOTHING`);
    await db.execute(sql`
      INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
      VALUES (${TENANT}::uuid, ${"ccy-defaults-" + TENANT.slice(0, 8)}, 'Ccy Defaults',
              'PRIVATE', 'PLN', ${USER}::uuid, 1, now())
      ON CONFLICT DO NOTHING`);
    await pool.end();

    const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => {
      // No currency given — the budget's (PLN) must be filled in.
      await tx.execute(sql`
        INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
        VALUES (${PLAIN_CAT}::uuid, ${TENANT}::uuid, 'Food', now(), ${USER}::uuid)`);
      await tx.execute(sql`
        INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id)
        VALUES (${EUR_CAT}::uuid, ${TENANT}::uuid, 'Trips', 'EUR', now(), ${USER}::uuid)`);
    });
    if (r.isErr()) throw r.error;
  });

  afterAll(async () => {
    const { db, pool } = await rawDb();
    await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
    await db.execute(
      sql`DELETE FROM budgeting.category_reserve_adjustments WHERE tenant_id = ${TENANT}::uuid`,
    );
    await db.execute(sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TENANT}::uuid`);
    await db.execute(sql`DELETE FROM tenancy.budgets WHERE id = ${TENANT}::uuid`);
    await pool.end();
  });

  test("a category created without a currency takes the budget's", async () => {
    expect(await currencyOf("categories", `id = '${PLAIN_CAT}'`)).toBe("PLN");
  });

  test("an explicit category currency is kept", async () => {
    expect(await currencyOf("categories", `id = '${EUR_CAT}'`)).toBe("EUR");
  });

  test("a reserve adjustment is written in its category's currency", async () => {
    const { id } = await new DrizzleCategoryReserveAdjustmentsRepo().create({
      tenantId: TENANT,
      categoryId: EUR_CAT,
      deltaCents: 1500n,
      actorUserId: USER,
    });
    expect(await currencyOf("category_reserve_adjustments", `id = '${id}'`)).toBe("EUR");
  });
});
