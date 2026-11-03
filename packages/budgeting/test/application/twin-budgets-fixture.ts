/**
 * twin-budgets-fixture.ts — two PLN budgets that hold the SAME money, one in
 * EUR and one already in PLN at the seeded rates (Phase 14 read-time
 * conversion). Every read model must answer identically for the two; reading
 * stored converted cents or a raw foreign amount breaks the tie.
 *
 * Throwaway testcontainer, so real-dated rates are safe to seed:
 * EUR→PLN 4.0 before today, 4.5 from today (TS conversions get 4.5 via the stub).
 *
 *   SPENDINGS wallet  500.00 EUR   | 2,250.00 PLN
 *   CUSHION wallet    100.00 EUR   |   450.00 PLN
 *   Food limit        200 / 150 EUR (normal / cushion) | 900 / 675 PLN
 *   tx this month     10.00 EUR on the 1st             | 40 or 45 PLN (rate of that day)
 *   tx last month     20.00 EUR on the 15th            | 80.00 PLN
 *   unconfirmed draft  5.00 EUR on the 1st             | 20 or 22.50 PLN
 */
import { Pool } from "pg";
import { Temporal } from "temporal-polyfill";
import { startTestcontainer } from "@budget/db/test/testcontainer";

export type Twin = { tenant: string; owner: string; food: string };
export const today = Temporal.Now.plainDateISO();
const monthStart = today.with({ day: 1 });
const lastMonth15 = monthStart.subtract({ months: 1 }).with({ day: 15 });
const rateBefore = monthStart.subtract({ days: 40 });
/** EUR→PLN on a date, as seeded. */
export const rateOn = (d: Temporal.PlainDate) => (Temporal.PlainDate.compare(d, today) < 0 ? 4 : 4.5);

export const fxProvider = {
  rateAsOf: async (from: string, to: string) => {
    if (from === to) return { rate: "1", provider: "test", isStale: false };
    if (from === "EUR" && to === "PLN") return { rate: "4.5", provider: "test", isStale: false };
    throw new Error(`no rate ${from}->${to}`);
  },
};

let pool: Pool;

async function asTenant(t: Twin, fn: (c: any) => Promise<void>) {
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false), set_config('app.current_user_id', $2, false)`, [
      `{${t.tenant}}`,
      t.owner,
    ]);
    await fn(c);
  } finally {
    c.release();
  }
}

async function seedBudget(t: Twin, ccy: "EUR" | "PLN") {
  const k = ccy === "EUR" ? 1 : 0; // 1 → amounts in EUR, 0 → their PLN equivalent
  const amt = (eurCents: number, d: Temporal.PlainDate | null) =>
    k ? eurCents : Math.round(eurCents * (d ? rateOn(d) : 4.5));
  await asTenant(t, async (c) => {
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at,
                                    cushion_enabled, cushion_target_months)
       VALUES ($1, $2, 'twin', 'PLN', $3, now(), true, 2)`,
      [t.tenant, `twin-${t.tenant.slice(0, 8)}`, t.owner],
    );
    for (const [name, type, eur] of [
      ["cash", "SPENDINGS", 50000],
      ["rainy", "CUSHION", 10000],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, wallet_type, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::numeric / 100, $5, now(), $6)`,
        [t.tenant, name, ccy, amt(eur, null), type, t.owner],
      );
    }
    await c.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, currency, created_at, actor_user_id, sort_index)
       VALUES ($1, $2, 'Food', $3, now(), $4, 0)`,
      [t.food, t.tenant, ccy, t.owner],
    );
    await c.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency,
          effective_from, no_limit, actor_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $5, $4, $5, $6::date, false, $7, now())`,
      [t.tenant, t.food, amt(20000, null), amt(15000, null), ccy, monthStart.subtract({ months: 6 }).toString(), t.owner],
    );
    for (const [d, eur, confirmed] of [
      [monthStart, 1000, true],
      [lastMonth15, 2000, true],
      [monthStart, 500, false],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.expense_ledger
           (tenant_id, budget_id, category_id, transaction_date, amount_original_cents, currency_original,
            amount_converted_cents, fx_rate, fx_as_of, kind, confirmed_at)
         VALUES ($1, $1, $2, $3::date, $4, $5, 999999, 1, $3::date, 'SPENDING', ${confirmed ? "now()" : "NULL"})`,
        [t.tenant, t.food, d.toString(), amt(eur, d), ccy],
      );
    }
  });
}

/** Boots the container once, seeds rates and both budgets. */
export async function createTwins(): Promise<{ eur: Twin; pln: Twin }> {
  const { urlApp, urlWorker } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  const w = new Pool({ connectionString: urlWorker });
  for (const [d, r] of [
    [rateBefore, "4.0"],
    [today, "4.5"],
  ] as const) {
    await w.query(
      `INSERT INTO budgeting.fx_rates (base, quote, date, rate, provider) VALUES ('EUR', 'PLN', $1::date, $2, 'twin')
       ON CONFLICT (base, quote, date) DO UPDATE SET rate = EXCLUDED.rate`,
      [d.toString(), r],
    );
  }
  await w.end();
  const mk = (): Twin => ({ tenant: crypto.randomUUID(), owner: crypto.randomUUID(), food: crypto.randomUUID() });
  const eur = mk();
  const pln = mk();
  await seedBudget(eur, "EUR");
  await seedBudget(pln, "PLN");
  return { eur, pln };
}

export const endTwins = () => pool?.end();

/** JSON of a result with the twin's ids swapped, so the two can be compared. */
export const normalise = (v: unknown, t: Twin) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x))
    .replaceAll(t.tenant, "TENANT")
    .replaceAll(t.food, "FOOD");
