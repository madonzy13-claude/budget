/**
 * overview-repo-needs-split.test.ts — the needs/wants split the charts draw must
 * be the one the user typed.
 *
 * The category slider writes an explicit needs/wants split onto the limit row
 * (needs_amount / wants_amount). The Overview planned query used to ignore
 * those columns and infer needs from the CUSHION amount instead, so a user who
 * moved House's whole budget into "needs" saw the charts keep the old split
 * (user report, 260803).
 *
 * Real Postgres — DATABASE_URL_APP comes from the infisical wrapper.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { createOverviewRepo } from "../../src/adapters/persistence/overview-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k])
    process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
/** Explicit split: 300 of the 500 is essential, the rest discretionary. */
const SPLIT_CAT = crypto.randomUUID();
/** No split written (a limit from before the columns existed) — infer from cushion. */
const LEGACY_CAT = crypto.randomUUID();

async function rawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

beforeAll(async () => {
  const { db, pool } = await rawDb();
  await db.execute(sql.raw(`SET app.current_user_id = '${USER}'`));
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
  await db.execute(sql`
    INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${USER}::uuid, ${"needs-split-" + USER.slice(0, 8) + "@example.com"},
            'Needs Split User', true, now(), now())
    ON CONFLICT DO NOTHING`);
  await db.execute(sql`
    INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
    VALUES (${TENANT}::uuid, ${"needs-split-" + TENANT.slice(0, 8)}, 'Needs Split Budget',
            'PRIVATE', 'EUR', ${USER}::uuid, 1, now())
    ON CONFLICT DO NOTHING`);
  await pool.end();

  const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => {
    for (const [id, name] of [
      [SPLIT_CAT, "House"],
      [LEGACY_CAT, "Legacy"],
    ] as const) {
      await tx.execute(sql`
        INSERT INTO budgeting.categories (id, tenant_id, name, cushion_mode, created_at, actor_user_id)
        VALUES (${id}::uuid, ${TENANT}::uuid, ${name}, 'needs_wants', now(), ${USER}::uuid)`);
    }
    // House: planned 500, cushion 200, but the user typed needs 500 / wants 0.
    await tx.execute(sql`
      INSERT INTO budgeting.category_limits
        (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount,
         cushion_currency, needs_amount, wants_amount, effective_from, actor_user_id, created_at)
      VALUES (gen_random_uuid(), ${TENANT}::uuid, ${SPLIT_CAT}::uuid, 50000, 'EUR', 20000,
              'EUR', 50000, 0, '2026-06-01'::date, ${USER}::uuid, now())`);
    // Legacy: planned 500, cushion 200, no split columns → needs falls back to 200.
    await tx.execute(sql`
      INSERT INTO budgeting.category_limits
        (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount,
         cushion_currency, effective_from, actor_user_id, created_at)
      VALUES (gen_random_uuid(), ${TENANT}::uuid, ${LEGACY_CAT}::uuid, 50000, 'EUR', 20000,
              'EUR', '2026-06-01'::date, ${USER}::uuid, now())`);
  });
  if (r.isErr()) throw r.error;
});

afterAll(async () => {
  const { db, pool } = await rawDb();
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
  await db.execute(
    sql`DELETE FROM budgeting.category_limits WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(sql`DELETE FROM tenancy.budgets WHERE id = ${TENANT}::uuid`);
  await pool.end();
});

describe("monthlyPlannedByCategory — needs/wants split", () => {
  const rowFor = async (categoryId: string) => {
    const rows = await createOverviewRepo().monthlyPlannedByCategory(
      TENANT,
      "2026-06-01",
      "2026-06-30",
    );
    return rows.find(
      (r) => r.category_id === categoryId && r.month === "2026-06",
    );
  };

  test("uses the split the user typed, not the cushion amount", async () => {
    const row = await rowFor(SPLIT_CAT);
    expect(row?.planned_cents).toBe(50000n);
    // needs 500 / wants 0 — the cushion (200) says nothing about intent here.
    expect(row?.needs_cents).toBe(50000n);
  });

  test("falls back to the cushion when no split was ever written", async () => {
    const row = await rowFor(LEGACY_CAT);
    expect(row?.planned_cents).toBe(50000n);
    expect(row?.needs_cents).toBe(20000n);
  });
});
