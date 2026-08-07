/**
 * overview-repo-scheduled-split.test.ts — telling ORDINARY spend apart from the
 * scheduled payments inside it (260807).
 *
 * Reserve sizing needs both halves separately. What a category spends by habit
 * is what its limit has to cover month to month; what it spends on scheduled
 * payments is already known from the schedule and is projected forward on its
 * own. Reading only the total forced a choice between two wrong answers:
 * charge the past lump twice (once through history, once through the forward
 * projection), or net a forward RATE out of an unrelated historical window and
 * hope they cancel.
 *
 * The ledger already carries the link — expense_ledger.scheduled_payment_id, set
 * whenever a draft is confirmed — so the split is a fact, not an estimate.
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
const CAT = crypto.randomUUID();
const RULE = crypto.randomUUID();

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
    VALUES (${USER}::uuid, ${"sched-split-" + USER.slice(0, 8) + "@example.com"},
            'Sched Split User', true, now(), now())
    ON CONFLICT DO NOTHING`);
  await db.execute(sql`
    INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
    VALUES (${TENANT}::uuid, ${"sched-split-" + TENANT.slice(0, 8)}, 'Sched Split Budget',
            'PRIVATE', 'EUR', ${USER}::uuid, 1, now())
    ON CONFLICT DO NOTHING`);
  await pool.end();

  const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => {
    await tx.execute(sql`
      INSERT INTO budgeting.categories (id, tenant_id, name, cushion_mode, created_at, actor_user_id)
      VALUES (${CAT}::uuid, ${TENANT}::uuid, 'Travel', 'none', now(), ${USER}::uuid)`);
    await tx.execute(sql`
      INSERT INTO budgeting.scheduled_payments
        (id, tenant_id, category_id, amount, currency, cadence, yearly_month,
         cadence_anchor, active, next_due_date, actor_user_id)
      VALUES (${RULE}::uuid, ${TENANT}::uuid, ${CAT}::uuid, 4500, 'EUR', 'YEARLY',
              10, 15, true, DATE '2027-10-15', ${USER}::uuid)`);
    // One ordinary month, and one month holding BOTH an ordinary purchase and
    // the scheduled camping payment.
    const rows: [string, number, string | null][] = [
      ["2026-03-04", 12000, null],
      ["2026-04-02", 8000, null],
      ["2026-04-15", 450000, RULE],
    ];
    for (const [date, cents, ruleId] of rows) {
      await tx.execute(sql`
        INSERT INTO budgeting.expense_ledger
          (id, tenant_id, budget_id, category_id, transaction_date,
           amount_original_cents, currency_original, amount_converted_cents,
           fx_rate, fx_as_of, scheduled_payment_id, confirmed_at, kind,
           created_at, updated_at)
        VALUES (gen_random_uuid(), ${TENANT}::uuid, ${TENANT}::uuid, ${CAT}::uuid,
                ${date}::date, ${cents}::bigint, 'EUR', ${cents}::bigint, 1,
                ${date}::date, ${ruleId}::uuid, now(), 'SPENDING', now(), now())`);
    }
  });
  if (r.isErr()) throw r.error;
});

afterAll(async () => {
  const { db, pool } = await rawDb();
  await db.execute(sql.raw(`SET app.tenant_ids = '{${TENANT}}'`));
  await db.execute(
    sql`DELETE FROM budgeting.expense_ledger WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.scheduled_payments WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TENANT}::uuid`,
  );
  await pool.end();
});

const monthsOf = async () => {
  const rows = await createOverviewRepo().monthlySpendByCategory(
    TENANT,
    "2026-03-01",
    "2026-04-30",
  );
  return new Map(rows.map((r) => [r.month, r]));
};

describe("monthlySpendByCategory — the scheduled half", () => {
  test("still reports the whole month's spend", async () => {
    const m = await monthsOf();
    expect(m.get("2026-04")!.spent_cents).toBe(458000n);
  });

  test("says how much of it came from a scheduled payment", async () => {
    const m = await monthsOf();
    expect(m.get("2026-04")!.scheduled_cents).toBe(450000n);
  });

  test("an ordinary month reports none", async () => {
    const m = await monthsOf();
    expect(m.get("2026-03")!.spent_cents).toBe(12000n);
    expect(m.get("2026-03")!.scheduled_cents).toBe(0n);
  });

  test("the ordinary remainder is the difference, and it is what habit costs", async () => {
    const m = await monthsOf();
    const april = m.get("2026-04")!;
    expect(april.spent_cents - april.scheduled_cents).toBe(8000n);
  });
});
