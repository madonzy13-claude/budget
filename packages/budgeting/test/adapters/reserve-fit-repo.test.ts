/**
 * reserve-fit-repo.test.ts — the one-off list against real Postgres.
 *
 * Covers what only a database can tell us: the shortlist really is the biggest
 * spends per category, a charge linked to a REPEATING rule is never offered (it
 * will happen again by construction — user, 260813), the un-tick round-trips
 * even for a spend the shortlist does not carry, and the annotation is scoped to
 * the budget rather than leaking across tenants.
 *
 * DATABASE_URL_APP comes from the infisical wrapper.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { createReserveFitRepo } from "../../src/adapters/persistence/reserve-fit-repo";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER"] as const) {
  if (process.env[k])
    process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

const TENANT = crypto.randomUUID();
const OTHER_TENANT = crypto.randomUUID();
const USER = crypto.randomUUID();
const CAT = crypto.randomUUID();
const RULE = crypto.randomUUID();
const TX_JUMP = crypto.randomUUID();
const TX_INSURANCE = crypto.randomUUID();
const TX_SMALL = crypto.randomUUID();

async function rawDb() {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  return { db: drizzle(pool), pool };
}

const repo = createReserveFitRepo();

beforeAll(async () => {
  const { db, pool } = await rawDb();
  await db.execute(sql.raw(`SET app.current_user_id = '${USER}'`));
  await db.execute(
    sql.raw(`SET app.tenant_ids = '{${TENANT},${OTHER_TENANT}}'`),
  );
  await db.execute(sql`
    INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${USER}::uuid, ${"fit-" + USER.slice(0, 8) + "@example.com"}, 'Fit User', true, now(), now())
    ON CONFLICT DO NOTHING`);
  for (const t of [TENANT, OTHER_TENANT]) {
    await db.execute(sql`
      INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
      VALUES (${t}::uuid, ${"fit-" + t.slice(0, 8)}, 'Fit Budget', 'PRIVATE', 'PLN', ${USER}::uuid, 1, now())
      ON CONFLICT DO NOTHING`);
  }
  await pool.end();

  const r = await withTenantTx(TenantId(TENANT), UserId(USER), async (tx) => {
    await tx.execute(sql`
      INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
      VALUES (${CAT}::uuid, ${TENANT}::uuid, 'Car', now(), ${USER}::uuid)`);
    await tx.execute(sql`
      INSERT INTO budgeting.scheduled_payments
        (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor,
         active, next_due_date, created_at, actor_user_id, yearly_month)
      VALUES (${RULE}::uuid, ${TENANT}::uuid, ${CAT}::uuid, 5000, 'PLN', 'YEARLY', 1,
              true, '2026-09-01'::date, now(), ${USER}::uuid, 9)`);
    const spend = async (
      id: string,
      date: string,
      note: string,
      cents: number,
      ruleId: string | null,
    ) =>
      tx.execute(sql`
        INSERT INTO budgeting.expense_ledger
          (id, tenant_id, budget_id, category_id, kind, transaction_date, note,
           amount_original_cents, amount_converted_cents, currency_original,
           fx_rate, fx_as_of, confirmed_at, created_at, scheduled_payment_id)
        VALUES (${id}::uuid, ${TENANT}::uuid, ${TENANT}::uuid, ${CAT}::uuid, 'SPENDING',
                ${date}::date, ${note}, ${cents}, ${cents}, 'PLN', 1, ${date}::date,
                now(), now(), ${ruleId}::uuid)`);
    await spend(TX_JUMP, "2026-03-14", "Parachute jump", 480000, null);
    await spend(TX_INSURANCE, "2026-02-01", "Insurance", 500000, RULE);
    await spend(TX_SMALL, "2026-01-09", "Wiper fluid", 3000, null);
  });
  if (r.isErr()) throw r.error;
});

afterAll(async () => {
  const { db, pool } = await rawDb();
  await db.execute(
    sql.raw(`SET app.tenant_ids = '{${TENANT},${OTHER_TENANT}}'`),
  );
  await db.execute(
    sql`DELETE FROM budgeting.reserve_fit_exclusions WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.expense_ledger WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.scheduled_payments WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM budgeting.categories WHERE tenant_id = ${TENANT}::uuid`,
  );
  await db.execute(
    sql`DELETE FROM tenancy.budgets WHERE id IN (${TENANT}::uuid, ${OTHER_TENANT}::uuid)`,
  );
  await pool.end();
});

const list = () =>
  repo.largeTransactions({
    budgetId: TENANT,
    from: "2026-01-01",
    to: "2026-03-31",
  });

describe("reserve-fit exclusions repo", () => {
  test("lists the budget's spends, biggest first, none excluded yet", async () => {
    const rows = await list();
    // The 5,000 insurance charge is bigger than either, and absent: it is
    // linked to a YEARLY rule (see below).
    expect(rows.map((r) => r.ledger_id)).toEqual([TX_JUMP, TX_SMALL]);
    expect(rows.every((r) => !r.excluded)).toBe(true);
    expect(rows[0]?.amount_cents).toBe(480000n);
    expect(rows[0]?.note).toBe("Parachute jump");
  });

  test("a charge from a repeating rule is never offered as a one-off", async () => {
    const rows = await list();
    // "Which spend won't happen again" — a yearly premium will, so ticking it
    // is always wrong and it used to eat a shortlist slot every year (user,
    // 260813).
    expect(rows.find((r) => r.ledger_id === TX_INSURANCE)).toBeUndefined();
    expect(
      rows.find((r) => r.ledger_id === TX_JUMP)?.scheduled_cadence,
    ).toBeNull();
  });

  // The dialog stages every tick and saves once, so the write is a batch: what
  // to start ignoring and what to count again, in one transaction (260804).
  test("saves a batch of decisions at once, and is idempotent", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [TX_JUMP, TX_SMALL],
      remove: [],
      actorUserId: USER,
    });
    await repo.setExclusions({
      budgetId: TENANT,
      add: [TX_JUMP],
      remove: [],
      actorUserId: USER,
    });
    const rows = await list();
    expect(
      rows
        .filter((r) => r.excluded)
        .map((r) => r.ledger_id)
        .sort(),
    ).toEqual([TX_JUMP, TX_SMALL].sort());
  });

  test("the same save can exclude one and restore another", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [TX_INSURANCE],
      remove: [TX_SMALL],
      actorUserId: USER,
    });
    const rows = await list();
    expect(rows.filter((r) => r.excluded).map((r) => r.ledger_id)).toEqual([
      TX_JUMP,
    ]);
    // The insurance tick landed even though the shortlist never carries that
    // row — the exclusions table is the record, not the list (260813).
    const summed = await repo.excludedSpendByCategory({
      budgetId: TENANT,
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(summed).toContainEqual({
      category_id: CAT,
      month: "2026-02",
      cents: 500000n,
    });
  });

  test("an empty batch changes nothing", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [],
      remove: [],
      actorUserId: USER,
    });
    expect((await list()).filter((r) => r.excluded).length).toBe(1);
  });

  test("restoring everything clears the annotations", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [],
      remove: [TX_JUMP, TX_INSURANCE],
      actorUserId: USER,
    });
    expect((await list()).every((r) => !r.excluded)).toBe(true);
  });

  test("another budget cannot annotate this budget's transaction", async () => {
    await repo.setExclusions({
      budgetId: OTHER_TENANT,
      add: [TX_JUMP],
      remove: [],
      actorUserId: USER,
    });
    // The INSERT selects the ledger row within the OTHER tenant, which cannot
    // see it — so nothing is written and this budget's list is untouched.
    expect((await list()).every((r) => !r.excluded)).toBe(true);
  });

  // "How far off plan" needs the same decisions, but only as monthly sums: it
  // subtracts them from each category's AVERAGE while its totals stay honest.
  test("sums the set-aside spend per category and month", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [TX_JUMP, TX_INSURANCE],
      remove: [],
      actorUserId: USER,
    });
    const rows = await repo.excludedSpendByCategory({
      budgetId: TENANT,
      from: "2026-01-01",
      to: "2026-03-31",
    });
    expect(rows).toEqual([
      { category_id: CAT, month: "2026-02", cents: 500000n },
      { category_id: CAT, month: "2026-03", cents: 480000n },
    ]);
  });

  test("counts nothing once the decisions are taken back", async () => {
    await repo.setExclusions({
      budgetId: TENANT,
      add: [],
      remove: [TX_JUMP, TX_INSURANCE],
      actorUserId: USER,
    });
    expect(
      await repo.excludedSpendByCategory({
        budgetId: TENANT,
        from: "2026-01-01",
        to: "2026-03-31",
      }),
    ).toEqual([]);
  });

  test("a range that misses the spend lists nothing", async () => {
    const rows = await repo.largeTransactions({
      budgetId: TENANT,
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(rows).toEqual([]);
  });
});
