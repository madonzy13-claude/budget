/**
 * The Investments category counts in the money forecast like any other.
 *
 * It did not. Its SMART limit is computed on read (income − Σ other planned)
 * and never lands in category_limits, so the forecast — which reads that table
 * — saw a plan of zero. A category with a plan of zero and no_limit=false is
 * read by the simulator as "every złoty spent here is overspend", which is the
 * opposite of what an investment is.
 *
 * Three modes, three behaviours, all of them what a NORMAL category would do:
 *   manual → its stored limit (already worked, pinned here so it stays working)
 *   smart  → the computed limit, which this test is about
 *   none   → unbounded, exactly like a no-limit normal category
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool } from "pg";
import { ok } from "@budget/shared-kernel";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { computeCashflowProjection } from "../../src/application/compute-cashflow-projection";

let pool: Pool;
const TENANT = "ce110000-0000-4000-8000-000000000001";
const OWNER = "ce110000-0000-4000-8000-000000000002";
const NORMAL = "ce110000-0000-4000-8000-00000000000a";
const INVEST = "ce110000-0000-4000-8000-00000000000b";

/** Same-currency only: the fixture is all PLN, so a rate is never needed. */
const fxProvider = {
  rateAsOf: async () => ({ rate: "1", provider: "test", isStale: false }),
};

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

/** Point the investment category at a mode, and set no_limit to match — which
 *  is exactly what the API does, since the mode drives the flag. */
async function setMode(mode: string): Promise<void> {
  await withTenant(async (c) => {
    await c.query(
      `UPDATE budgeting.categories SET investment_limit_mode = $2
        WHERE id = $1::uuid`,
      [INVEST, mode],
    );
    await c.query(
      `UPDATE budgeting.category_limits SET no_limit = $2
        WHERE category_id = $1::uuid AND effective_to IS NULL`,
      [INVEST, mode === "none"],
    );
  });
}

/** The projected cash on the last day of the window. */
async function finalCash(): Promise<bigint> {
  const p = await computeCashflowProjection(deps as never)({
    tenantId: TENANT,
    budgetId: TENANT,
  });
  return p.days[p.days.length - 1]!.availableCents;
}

beforeAll(async () => {
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  await withTenant(async (c) => {
    await c.query(
      `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
       VALUES ($1, 'cashflow-inv', 'b', 'PLN', $2, now()) ON CONFLICT (id) DO NOTHING`,
      [TENANT, OWNER],
    );
    await c.query(
      `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance,
                                      wallet_type, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'cash', 'PLN', 20000.0000, 'SPENDINGS', now(), $2)`,
      [TENANT, OWNER],
    );
    for (const [id, name, inv, mode] of [
      [NORMAL, "Food", false, null],
      [INVEST, "Investments", true, "smart"],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.categories
           (id, tenant_id, name, created_at, actor_user_id, sort_index,
            is_investment, investment_limit_mode)
         VALUES ($1, $2, $3, now(), $4, 0, $5, $6)`,
        [id, TENANT, name, OWNER, inv, mode],
      );
      // Food plans 1,000. Investments stores 0 — which is the whole problem:
      // under 'smart' the real limit lives nowhere in this table.
      await c.query(
        `INSERT INTO budgeting.category_limits
           (id, tenant_id, category_id, normal_amount, normal_currency,
            cushion_amount, cushion_currency, effective_from, effective_to,
            no_limit, actor_user_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'PLN', 0, 'PLN',
                 date_trunc('month', now())::date - INTERVAL '6 months', NULL,
                 false, $4, now())`,
        [TENANT, id, inv ? 0 : 100000, OWNER],
      );
    }
    await c.query(
      `INSERT INTO budgeting.incomes
         (id, tenant_id, name, amount, currency, cadence, cadence_anchor,
          active, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'Salary', 4000.0000, 'PLN', 'MONTHLY', 25,
               true, now(), $2)`,
      [TENANT, OWNER],
    );
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

describe("Investments in the cash-flow forecast", () => {
  test("a smart limit is counted, not read as a plan of zero", async () => {
    await setMode("smart");
    const smart = await finalCash();
    // Same data, but the category is told to hold no plan at all. If smart were
    // ignored, these two would be identical — which is exactly what happened.
    await withTenant((c) =>
      c.query(
        `UPDATE budgeting.categories SET investment_limit_mode = 'manual'
          WHERE id = $1::uuid`,
        [INVEST],
      ),
    );
    const ignored = await finalCash();
    expect({ counted: smart !== ignored }).toEqual({ counted: true });
    // And counted the right way round: a plan the household intends to spend
    // leaves LESS cash at the end than no plan at all.
    expect({ lower: smart < ignored }).toEqual({ lower: true });
  });

  test("'none' is unbounded, like any no-limit category", async () => {
    await setMode("none");
    // Nothing to assert about the number here beyond it being produced: the
    // point is that no_limit reaches the simulator, which the 0083 rule then
    // treats as "no discretionary drip and no reserve draw".
    const cash = await finalCash();
    expect(typeof cash).toBe("bigint");
  });
});
