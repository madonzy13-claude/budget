/**
 * Cushion wallets are spendable in the forecast when cushion mode is on.
 *
 * They were not, on a 260812 rule: "cushion money is not spendable where it
 * sits — moving it into a spendings wallet is a deliberate act". Enabling
 * cushion mode IS that deliberate act, and the rest of the app had already
 * moved: the Overview's "available to spend" card folds cushion wallets in when
 * the month is in cushion mode (r36). The band underneath it did not, so the
 * card's figure counted the cushion while the health dot beside it — which
 * comes from this projection — said the household would run short.
 *
 * Cushion is CASH, not a third buffer drawn after the reserve (user, 260904h).
 * The reserve keeps its own job untouched: it is reached for only when a
 * category spends beyond its plan, and only the reserve that category built.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { ok } from "@budget/shared-kernel";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { computeCashflowProjection } from "../../src/application/compute-cashflow-projection";

let pool: Pool;
const TENANT = "cf110000-0000-4000-8000-000000000001";
const OWNER = "cf110000-0000-4000-8000-000000000002";
const FOOD = "cf110000-0000-4000-8000-00000000000a";

const fxProvider = {
  rateAsOf: async () => ({ rate: "1", provider: "test", isStale: false }),
};

/** No reserve unless a test asks for one. */
const deps = {
  fxProvider,
  reservePositions: async () =>
    ok({ userDefinedCents: 0n, positions: new Map() }),
};

async function withTenant<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`SELECT set_config('app.tenant_ids', $1, false)`, [
      `{${TENANT}}`,
    ]);
    await c.query(`SELECT set_config('app.current_user_id', $1, false)`, [
      OWNER,
    ]);
    return await fn(c);
  } finally {
    c.release();
  }
}

async function setCushionMode(on: boolean): Promise<void> {
  await withTenant((c) =>
    c.query(
      `UPDATE tenancy.budgets SET cushion_mode_enabled = $2 WHERE id = $1`,
      [TENANT, on],
    ),
  );
}

/** The money the forecast believes the household starts today with. */
async function openingCash(): Promise<bigint> {
  const p = await computeCashflowProjection(deps as never)({
    tenantId: TENANT,
    budgetId: TENANT,
  });
  return p.days[0]!.openingCents;
}

beforeAll(async () => {
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  await withTenant(async (c) => {
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
       VALUES ($1, 'cashflow-cushion', 'b', 'PLN', $2, now()) ON CONFLICT (id) DO NOTHING`,
      [TENANT, OWNER],
    );
    // The example, to the złoty: 300 spendable, 1,000 in the cushion.
    for (const [name, type, balance] of [
      ["cash", "SPENDINGS", 300],
      ["rainy day", "CUSHION", 1000],
      ["earmarked", "RESERVE", 5000],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance,
                                        wallet_type, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, $2, 'PLN', $3, $4, now(), $5)`,
        [TENANT, name, balance, type, OWNER],
      );
    }
    await c.query(
      `INSERT INTO budgeting.categories
         (id, tenant_id, name, created_at, actor_user_id, sort_index)
       VALUES ($1, $2, 'Food', now(), $3, 0)`,
      [FOOD, TENANT, OWNER],
    );
    // Normal limit 900, cushion limit 500 — the tighter one the example uses.
    await c.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, effective_to,
          no_limit, actor_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, 900, 'PLN', 500, 'PLN',
               date_trunc('month', now())::date - INTERVAL '6 months', NULL,
               false, $3, now())`,
      [TENANT, FOOD, OWNER],
    );
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

describe("Cushion wallets in the cash-flow forecast", () => {
  test("outside cushion mode the cushion is not the household's to spend", async () => {
    await setCushionMode(false);
    // 300 of spendings. Not the 1,000 beside it, and not the earmarked reserve
    // wallet either — that one is never spendable here, in either mode.
    expect(await openingCash()).toBe(30000n);
  });

  test("in cushion mode it is cash, exactly as the Overview card already counts it", async () => {
    await setCushionMode(true);
    expect(await openingCash()).toBe(130000n);
  });

  test("the reserve keeps its own job: only what is BEYOND the plan reaches it", async () => {
    // The example: Food's cushion limit is 500, its reserve is 100, the wallets
    // hold 300 + 1,000. Spending 600 is 500 of plan — paid in cash, which is now
    // 300 of spendings and 200 of cushion — and 100 beyond it, which is what the
    // reserve is for.
    await setCushionMode(true);
    const withReserve = {
      fxProvider,
      reservePositions: async () =>
        ok({
          userDefinedCents: 10000n,
          positions: new Map([[FOOD, { reserveCents: 10000n }]]),
        }),
    };
    await withTenant((c) =>
      c.query(
        `INSERT INTO budgeting.scheduled_payments
           (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor,
            note, active, next_due_date, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, $2, 600, 'PLN', 'MONTHLY', 15, 'Shop',
                 true, date_trunc('month', now())::date + 14, now(), $3)`,
        [TENANT, FOOD, OWNER],
      ),
    );
    const p = await computeCashflowProjection(withReserve as never)({
      tenantId: TENANT,
      budgetId: TENANT,
    });
    await withTenant((c) =>
      c.query(
        `DELETE FROM budgeting.scheduled_payments WHERE category_id = $1::uuid`,
        [FOOD],
      ),
    );
    const drew = p.days.flatMap((d) =>
      d.drewReserve.filter((r) => r.categoryId === FOOD),
    );
    // The FIRST occurrence draws exactly the 100 that lies beyond the 500 plan —
    // not the whole 600, and not nothing.
    expect(drew.length).toBeGreaterThan(0);
    expect(drew[0]!.amountCents).toBe(10000n);
  });
});
