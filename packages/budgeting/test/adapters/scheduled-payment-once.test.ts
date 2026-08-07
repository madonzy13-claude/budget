/**
 * scheduled-payment-once.test.ts — the ONCE cadence, against real Postgres.
 *
 * A one-time payment carries no anchor, no weekday and no month, so it has to
 * clear FOUR check constraints that were all written when every payment had a
 * rhythm. Only a real INSERT proves that; a unit test would just re-state the
 * TypeScript union.
 *
 * DATABASE_URL_APP comes from the infisical wrapper.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k])
    process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();

let db: Awaited<ReturnType<typeof rawDb>>["db"];
let pool: Awaited<ReturnType<typeof rawDb>>["pool"];

async function rawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(p), pool: p };
}

beforeAll(async () => {
  const conn = await rawDb();
  db = conn.db;
  pool = conn.pool;
  await db.execute(sql.raw(`SET app.current_user_id = '${USER}'`));
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
});

afterAll(async () => {
  await db.execute(
    sql.raw(`DELETE FROM budgeting.scheduled_payments
             WHERE tenant_id = '${TENANT}'::uuid`),
  );
  await pool.end();
});

const insertOnce = (id: string, endDate: string | null) =>
  db.execute(sql.raw(`
    INSERT INTO budgeting.scheduled_payments
      (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor,
       weekly_dow, yearly_month, note, active, next_due_date, end_date, actor_user_id)
    VALUES
      ('${id}'::uuid, '${TENANT}'::uuid, NULL, 250.00, 'PLN', 'ONCE', NULL,
       NULL, NULL, 'New sofa', true, DATE '2026-11-04',
       ${endDate === null ? "NULL" : `DATE '${endDate}'`}, '${USER}'::uuid)
  `));

describe("ONCE cadence at the database", () => {
  test("a one-time payment inserts with no anchor, weekday or month", async () => {
    const id = crypto.randomUUID();
    await insertOnce(id, "2026-11-04");
    const row = (
      await db.execute(
        sql.raw(`SELECT cadence, next_due_date, end_date
                   FROM budgeting.scheduled_payments WHERE id = '${id}'::uuid`),
      )
    ).rows[0] as Record<string, unknown>;
    expect(row.cadence).toBe("ONCE");
  });

  test("the cadence check names it alongside the rhythms", async () => {
    const def = (
      await db.execute(
        sql.raw(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
                  WHERE conname = 'scheduled_payments_cadence_chk'`),
      )
    ).rows[0] as { def: string };
    expect(def.def).toContain("ONCE");
    // The rhythms are still accepted — this widened the set, it did not swap it.
    for (const c of ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]) {
      expect(def.def).toContain(c);
    }
  });

  test("a cadence nobody defined is still refused", async () => {
    // The widening must not have loosened the column into free text.
    const id = crypto.randomUUID();
    // Wrapped in a real promise: drizzle's query builder is only thenable, and
    // `.rejects` wants a Promise.
    const bad = (async () => {
      await db.execute(sql.raw(`
        INSERT INTO budgeting.scheduled_payments
          (id, tenant_id, amount, currency, cadence, active, next_due_date, actor_user_id)
        VALUES ('${id}'::uuid, '${TENANT}'::uuid, 1.00, 'PLN', 'FORTNIGHTLY',
                true, DATE '2026-11-04', '${USER}'::uuid)
      `));
    })();
    await expect(bad).rejects.toThrow();
    // …and nothing landed: drizzle wraps the driver error, so the constraint
    // name is not in the message — the empty table is the real assertion.
    const found = (
      await db.execute(
        sql.raw(`SELECT count(*)::int AS n FROM budgeting.scheduled_payments
                  WHERE id = '${id}'::uuid`),
      )
    ).rows[0] as { n: number };
    expect(found.n).toBe(0);
  });
});
