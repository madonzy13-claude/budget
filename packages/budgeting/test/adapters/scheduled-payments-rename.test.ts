/**
 * scheduled-payments-rename.test.ts — the rename, asserted against real Postgres.
 *
 * "Recurring rules" was the engine's word for them; the household's word is
 * SCHEDULED PAYMENTS (user, 260807). A rename that stops at the UI leaves the
 * next reader translating between two vocabularies, so it goes all the way to
 * the table, its policy, its constraints and the ledger column that points at it.
 *
 * Every object is checked by NAME rather than by behaviour, because behaviour is
 * exactly what must not change — the existing suites prove that part. What this
 * catches is a half-done rename: a policy or index left holding the old name is
 * invisible until someone greps for it a year later.
 *
 * DATABASE_URL_APP comes from the infisical wrapper.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k])
    process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

let db: Awaited<ReturnType<typeof rawDb>>["db"];
let pool: Awaited<ReturnType<typeof rawDb>>["pool"];

async function rawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const p = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(p), pool: p };
}

const one = async (q: string): Promise<Record<string, unknown> | undefined> =>
  (await db.execute(sql.raw(q))).rows[0] as Record<string, unknown> | undefined;

beforeAll(async () => {
  const conn = await rawDb();
  db = conn.db;
  pool = conn.pool;
});

afterAll(async () => {
  await pool.end();
});

describe("scheduled_payments — the table", () => {
  test("exists under its new name, and the old name is gone", async () => {
    const now = await one(`
      SELECT to_regclass('budgeting.scheduled_payments') IS NOT NULL AS present
    `);
    const then = await one(`
      SELECT to_regclass('budgeting.recurring_rules') IS NOT NULL AS present
    `);
    expect(now?.present).toBe(true);
    // Not left behind as a compatibility shim: two names for one table is the
    // ambiguity this rename exists to remove.
    expect(then?.present).toBe(false);
  });

  test("keeps row-level security enabled AND forced", async () => {
    // A rename does not carry RLS anywhere, but a rename done as
    // drop-and-recreate would silently lose it — the 0072 data-loss lesson.
    const row = await one(`
      SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced
        FROM pg_class
       WHERE oid = 'budgeting.scheduled_payments'::regclass
    `);
    expect(row?.enabled).toBe(true);
    expect(row?.forced).toBe(true);
  });

  test("carries BOTH its policies under the new name", async () => {
    // Two, not one: tenant isolation for the app, and the cron-scan SELECT the
    // worker needs to find due payments across every tenant at once. Renaming
    // only the first would leave the engine's policy orphaned under a name that
    // no longer describes anything.
    const rows = (
      await db.execute(
        sql.raw(`
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'budgeting' AND tablename = 'scheduled_payments'
       ORDER BY policyname
    `),
      )
    ).rows as { policyname: string }[];
    expect(rows.map((r) => r.policyname)).toEqual([
      "scheduled_payments_tenant_isolation",
      "scheduled_payments_worker_cron_scan",
    ]);
  });

  test("renames every CHECK constraint with it", async () => {
    const rows = (
      await db.execute(
        sql.raw(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'budgeting.scheduled_payments'::regclass
         AND contype = 'c'
       ORDER BY conname
    `),
      )
    ).rows as { conname: string }[];
    expect(rows.map((r) => r.conname)).toEqual([
      "scheduled_payments_cadence_anchor_chk",
      "scheduled_payments_cadence_chk",
      "scheduled_payments_weekly_dow_chk",
      "scheduled_payments_yearly_month_chk",
    ]);
  });

  test("renames its indexes with it", async () => {
    const rows = (
      await db.execute(
        sql.raw(`
      SELECT indexname FROM pg_indexes
       WHERE schemaname = 'budgeting' AND tablename = 'scheduled_payments'
       ORDER BY indexname
    `),
      )
    ).rows as { indexname: string }[];
    expect(rows.map((r) => r.indexname)).toEqual([
      "scheduled_payments_next_due_idx",
      "scheduled_payments_pkey",
    ]);
  });
});

describe("expense_ledger — the column that points at one", () => {
  test("is scheduled_payment_id now, and recurring_rule_id is gone", async () => {
    const rows = (
      await db.execute(
        sql.raw(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'budgeting' AND table_name = 'expense_ledger'
         AND column_name IN ('scheduled_payment_id', 'recurring_rule_id')
    `),
      )
    ).rows as { column_name: string }[];
    expect(rows.map((r) => r.column_name)).toEqual(["scheduled_payment_id"]);
  });

  test("still points at the table, one draft per payment per day", async () => {
    // The FK and the uniqueness are what stop a rule double-drafting; a rename
    // that dropped either would only show up as duplicate drafts in production.
    const fk = await one(`
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conrelid = 'budgeting.expense_ledger'::regclass
         AND contype = 'f'
         AND pg_get_constraintdef(oid) ILIKE '%scheduled_payments%'
    `);
    expect(fk?.conname).toBe("expense_ledger_scheduled_payment_id_fkey");
    expect(String(fk?.def)).toContain("ON DELETE SET NULL");

    const idx = await one(`
      SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'budgeting'
         AND indexname = 'expense_ledger_scheduled_payment_date_uidx'
    `);
    expect(String(idx?.indexdef)).toContain("UNIQUE");
    expect(String(idx?.indexdef)).toContain("scheduled_payment_id");
    expect(String(idx?.indexdef)).toContain("transaction_date");
  });
});
