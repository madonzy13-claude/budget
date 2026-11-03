/**
 * multi-currency-fixture.ts — one PLN budget with a PLN and two EUR categories,
 * for the Phase 14 read-model tests. Everything sits in 1999 (before the real
 * FX history) so the seeded rates never collide with real ones.
 *
 *   P = 1999-05 (past), C = 1999-06 (current), today = 1999-06-15.
 *   A  PLN, limit 1000.00 PLN (needs 600 / wants 400) — tx 100.00 PLN on 06-02
 *   B  EUR, limit  200.00 EUR                         — no spend
 *   T  EUR, limit    2.00 EUR                         — tx  10.00 EUR on 06-05
 *   EUR→PLN 05-20 4.0 (last in P), 06-10 4.5 (latest ≤ today), 06-20 9.9 (after today)
 *   PLN→EUR 05-20 0.25,            06-10 0.2,                  06-20 0.1
 */
import { Pool } from "pg";
import { setServerTestNow } from "@budget/shared-kernel";
import { seedFxRates, deleteFxRates } from "../fx-seed";

for (const k of ["DATABASE_URL_APP", "DATABASE_URL_WORKER", "DATABASE_URL_MIGRATOR"] as const) {
  if (process.env[k]) process.env[k] = process.env[k]!.replace("@db:", "@localhost:");
}

export type Fixture = { tenant: string; user: string; A: string; B: string; T: string };

const superUrl = () =>
  process.env.DATABASE_URL_MIGRATOR!.replace(
    /\/\/[^:]+:[^@]+@/,
    `//postgres:${process.env.POSTGRES_PASSWORD}@`,
  );

async function asApp(f: Fixture, fn: (db: Pool) => Promise<void>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP! });
  const c = await pool.connect();
  try {
    await c.query(
      `SELECT set_config('app.current_user_id', $1, false), set_config('app.tenant_ids', $2, false)`,
      [f.user, `{${f.tenant}}`],
    );
    await fn(c as unknown as Pool);
  } finally {
    c.release();
    await pool.end();
  }
}

export async function setBudgetCurrency(f: Fixture, ccy: string) {
  const pool = new Pool({ connectionString: superUrl() });
  await pool.query(`UPDATE tenancy.budgets SET default_currency = $1 WHERE id = $2`, [ccy, f.tenant]);
  await pool.end();
}

export async function createFixture(provider: string): Promise<Fixture> {
  process.env.ALLOW_TEST_CLOCK = "1";
  setServerTestNow(new Date("1999-06-15T12:00:00Z"));
  const f: Fixture = {
    tenant: crypto.randomUUID(),
    user: crypto.randomUUID(),
    A: crypto.randomUUID(),
    B: crypto.randomUUID(),
    T: crypto.randomUUID(),
  };
  const rates: [string, string, string][] = [
    ["1999-05-20", "4.0", "0.25"],
    ["1999-06-10", "4.5", "0.2"],
    ["1999-06-20", "9.9", "0.1"],
  ];
  await seedFxRates(
    rates.flatMap(([date, eurPln, plnEur]) => [
      { base: "EUR", quote: "PLN", date, rate: eurPln },
      { base: "PLN", quote: "EUR", date, rate: plnEur },
    ]),
    provider,
  );
  await asApp(f, async (db) => {
    await db.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Multi Ccy', true, now(), now())`,
      [f.user, `multi-ccy-${f.user.slice(0, 8)}@example.com`],
    );
    await db.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, timezone)
       VALUES ($1, $2, 'Multi Ccy', 'PRIVATE', 'PLN', $3, 1, now(), 'UTC')`,
      [f.tenant, `multi-ccy-${f.tenant.slice(0, 8)}`, f.user],
    );
    for (const [id, name, ccy, limit, needs, wants] of [
      [f.A, "A", "PLN", 100000, 60000, 40000],
      [f.B, "B", "EUR", 20000, null, null],
      [f.T, "T", "EUR", 200, null, null],
    ] as const) {
      await db.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, currency, cushion_mode, created_at, actor_user_id)
         VALUES ($1, $2, $3, $4, 'needs_wants', '1999-01-01', $5)`,
        [id, f.tenant, name, ccy, f.user],
      );
      await db.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount,
            cushion_currency, needs_amount, wants_amount, effective_from, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $3, $4, $5, $6, '1999-05-01', $7, now())`,
        [f.tenant, id, limit, ccy, needs, wants, f.user],
      );
    }
    for (const [cat, date, cents, ccy] of [
      [f.A, "1999-06-02", 10000, "PLN"],
      [f.T, "1999-06-05", 1000, "EUR"],
    ] as const) {
      // Stored converted cents deliberately wrong: nothing may read them.
      await db.query(
        `INSERT INTO budgeting.expense_ledger
           (tenant_id, budget_id, category_id, transaction_date, amount_original_cents,
            currency_original, amount_converted_cents, fx_rate, fx_as_of, kind, confirmed_at)
         VALUES ($1, $1, $2, $3::date, $4, $5, 999999, 1, $3::date, 'SPENDING', now())`,
        [f.tenant, cat, date, cents, ccy],
      );
    }
  });
  return f;
}

export async function dropFixture(f: Fixture, provider: string) {
  setServerTestNow(null);
  const pool = new Pool({ connectionString: superUrl() });
  for (const t of ["expense_ledger", "category_limits", "categories"])
    await pool.query(`DELETE FROM budgeting.${t} WHERE tenant_id = $1`, [f.tenant]);
  await pool.query(`DELETE FROM tenancy.budgets WHERE id = $1`, [f.tenant]);
  await pool.end();
  await deleteFxRates(provider);
}
