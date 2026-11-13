/**
 * demo-realism.test.ts — the demo must READ like a household (261113, user:
 * "in some places they are ridiculous"). Against a real Postgres.
 *
 * Money: value × rate(row currency → demo currency) × factor — wealth (wallets,
 * investments) 0.1–5, everything else 0.8–1.2. One factor for every currency
 * had made the family budget ~9× too expensive and the hryvnia one ~9× too
 * cheap. Names follow what a row IS: a "House" category becomes Housing, a
 * cushion wallet is never a credit card, BTC is never "Property Share 2".
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Pool, type PoolClient } from "pg";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { refreshPair, type CopyPair } from "../src/demo/copy";
import { merchantsForCategory, poolValues } from "../src/demo/pools";

let pool: Pool;

const SOURCE = "51111111-1111-1111-1111-111111111111";
const DEST = "52222222-2222-2222-2222-222222222222";
const OWNER = "53333333-3333-3333-3333-333333333333";
const DEMO = "54444444-4444-4444-4444-444444444444";

const CAT_HOUSE = "5aaaaaaa-0000-0000-0000-000000000001";
const CAT_FOOD = "5aaaaaaa-0000-0000-0000-000000000002";
const CAT_CAR = "5aaaaaaa-0000-0000-0000-000000000003";

// PLN → USD at 0.25; every other currency keeps its own.
const PAIR: CopyPair = {
  source: SOURCE,
  dest: DEST,
  label: "personal",
  currency: "USD",
  home: "PLN",
  currencyMap: { PLN: "USD" },
  fxMultipliers: { PLN: 0.25 },
  flowScale: 1.2,
  wealthScale: 0.5,
  demoUserId: DEMO,
  budgetName: "Personal",
  textLocale: "en",
};

async function asOwner<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`SET app.tenant_ids = '{${SOURCE},${DEST}}'`);
    await c.query(`SET app.current_user_id = '${OWNER}'`);
    return await fn(c);
  } finally {
    c.release();
  }
}

async function refresh() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await refreshPair(c, PAIR);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const q = async (sql: string) =>
  asOwner(async (c) => (await c.query(sql, [DEST])).rows);

beforeAll(async () => {
  const { urlApp } = await startTestcontainer();
  pool = new Pool({ connectionString: urlApp });
  // Reserve adjustments carry created_by → identity.users (user-scoped RLS).
  for (const id of [OWNER, DEMO]) {
    const c = await pool.connect();
    try {
      await c.query(`SET app.current_user_id = '${id}'`);
      await c.query(
        `INSERT INTO identity.users (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1::uuid, 'u', $1 || '@example.test', true, now(), now()) ON CONFLICT (id) DO NOTHING`,
        [id],
      );
    } finally {
      c.release();
    }
  }
  await asOwner(async (c) => {
    for (const [id, slug] of [
      [SOURCE, "realism-src"],
      [DEST, "realism-dest"],
    ] as const) {
      await c.query(
        `INSERT INTO tenancy.budgets (id, slug, name, default_currency, owner_user_id, created_at)
         VALUES ($1, $2, 'x', 'PLN', $3, now()) ON CONFLICT (id) DO NOTHING`,
        [id, slug, OWNER],
      );
    }
    for (const [id, name, i] of [
      [CAT_HOUSE, "House", 0],
      [CAT_FOOD, "Food & Home", 1],
      [CAT_CAR, "Car", 2],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id, sort_index)
         VALUES ($1, $2, $3, now(), $4, $5)`,
        [id, SOURCE, name, OWNER, i],
      );
    }
    await c.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency,
          needs_amount, wants_amount, effective_from, actor_user_id, created_at)
       VALUES (gen_random_uuid(), $1, $2, 1234567, 'PLN', 0, 'PLN', 864197, 370370, '2026-01-01', $3, now())`,
      [SOURCE, CAT_FOOD, OWNER],
    );
    // Wallets: three cushions, two spendings, one reserve, one EUR.
    for (const [type, ccy, bal, i] of [
      ["SPENDINGS", "PLN", "4000", 0],
      ["SPENDINGS", "PLN", "-2500", 1],
      ["CUSHION", "PLN", "10000", 2],
      ["CUSHION", "PLN", "20000", 3],
      ["CUSHION", "EUR", "1000", 4],
      ["RESERVE", "PLN", "8000", 5],
      ["POSSESSION", "PLN", "400000", 6],
      ["CUSHION", "CHF", "100", 7],
      ["CUSHION", "CHF", "200", 8],
    ] as const) {
      await c.query(
        `INSERT INTO budgeting.wallets (id, tenant_id, name, currency, current_balance, wallet_type, sort_order, created_at, actor_user_id)
         VALUES (gen_random_uuid(), $1, 'Owner wallet ' || $5::text, $2, $3, $4::budgeting.wallet_type, $5::int, now(), $6)`,
        [SOURCE, ccy, bal, type, i, OWNER],
      );
    }
    // Ledger: a PLN spending with no note, and a EUR one converted into PLN.
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, note, currency_original, fx_rate, fx_as_of,
          amount_original_cents, amount_converted_cents, transaction_date, kind, created_at)
       VALUES
         (gen_random_uuid(), $1, $1, $2, NULL, 'PLN', 1, '2026-10-01', 10000, 10000, '2026-10-01', 'SPENDING', now()),
         (gen_random_uuid(), $1, $1, $2, NULL, 'PLN', 1, '2026-10-03', 900000, 900000, '2026-10-03', 'SPENDING', now()),
         (gen_random_uuid(), $1, $1, $2, NULL, 'PLN', 1, '2026-10-04', 5000, 5000, '2026-10-04', 'SPENDING', now()),
         (gen_random_uuid(), $1, $1, $3, 'private note', 'EUR', 4.3, '2026-10-02', 1000, 4300, '2026-10-02', 'SPENDING', now())`,
      [SOURCE, CAT_HOUSE, CAT_CAR],
    );
    await c.query(
      `INSERT INTO budgeting.scheduled_payments
         (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor, note, next_due_date, actor_user_id)
       VALUES (gen_random_uuid(), $1, $2, 3000.0000, 'PLN', 'MONTHLY', 10, 'private', '2026-12-10', $3)`,
      [SOURCE, CAT_HOUSE, OWNER],
    );
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, category_id, note, currency_original, fx_rate, fx_as_of,
          amount_original_cents, amount_converted_cents, transaction_date, kind, scheduled_payment_id, created_at)
       SELECT gen_random_uuid(), $1, $1, $2, 'private', 'PLN', 1, '2026-11-10', 300000, 300000, '2026-11-10',
              'SPENDING', s.id, now()
         FROM budgeting.scheduled_payments s WHERE s.tenant_id = $1`,
      [SOURCE, CAT_HOUSE],
    );
    await c.query(
      `INSERT INTO budgeting.category_reserve_adjustments
         (id, tenant_id, category_id, delta_cents, note, created_by, occurred_at, currency)
       VALUES (gen_random_uuid(), $1, $2, 50000, NULL, $3, now(), 'PLN'),
              (gen_random_uuid(), $1, $2, -20000, 'private', $3, now(), 'PLN')`,
      [SOURCE, CAT_CAR, OWNER],
    );
    await c.query(
      `INSERT INTO budgeting.incomes (id, tenant_id, name, amount, currency, cadence, cadence_anchor, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'private side gig', 500.0000, 'PLN', 'MONTHLY', 1, $2),
              (gen_random_uuid(), $1, 'private employer', 9000.0000, 'PLN', 'MONTHLY', 1, $2)`,
      [SOURCE, OWNER],
    );
    // Investments: 6 gold coins bought at once, a one-unit broker account,
    // a manual stablecoin with a fractional quantity.
    const gold = "5bbbbbbb-0000-0000-0000-000000000001";
    const broker = "5bbbbbbb-0000-0000-0000-000000000002";
    const usdt = "5bbbbbbb-0000-0000-0000-000000000003";
    await c.query(
      `INSERT INTO budgeting.investments
         (id, tenant_id, budget_id, name, holding_type, ui_type, quantity, buy_price_cents, buy_currency,
          current_price_cents, current_price_currency, group_name, manual_ticker, sort_order, created_at)
       VALUES
         ($2, $1, $1, 'Owner coins', 'commodity', 'precious_metals', 6, 800000, 'PLN', 1500000, 'PLN', 'Owner group', NULL, 0, now()),
         ($3, $1, $1, 'Owner broker', 'other', 'broker', 1, 9000000, 'PLN', 10000000, 'PLN', NULL, NULL, 1, now()),
         ($4, $1, $1, 'Owner usdt', 'crypto', 'crypto', 0.00012345, 100, 'USD', 100, 'USD', NULL, 'USDT', 2, now())`,
      [SOURCE, gold, broker, usdt],
    );
    await c.query(
      `INSERT INTO budgeting.investment_history
         (id, tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency,
          qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency, value_delta_cents, created_at)
       VALUES
         (gen_random_uuid(), $1, $1, $2, 'start', '2022-10-31', 4800000, 'PLN', 6, 4800000, 'PLN', 4800000, 'PLN', 0, now()),
         (gen_random_uuid(), $1, $1, $3, 'add', '2026-01-15', 9000000, 'PLN', NULL, 9000000, 'PLN', 9000000, 'PLN', 9000000, now())`,
      [SOURCE, gold, broker],
    );
  });
  await refresh();
}, 180_000);

afterAll(async () => {
  await pool?.end();
});

describe("money", () => {
  test("wallets convert at the rate, then take the WEALTH factor", async () => {
    const rows = await q(
      `SELECT wallet_type::text t, currency, current_balance::float b FROM budgeting.wallets
        WHERE tenant_id = $1 AND wallet_type <> 'RESERVE' ORDER BY sort_order`,
    );
    // PLN × 0.25 × 0.5; EUR keeps its currency and only takes 0.5.
    expect(rows.map((r) => [r.currency, r.b])).toEqual([
      ["USD", 500],
      ["USD", -312.5],
      ["USD", 1250],
      ["USD", 2500],
      ["EUR", 500],
      ["USD", 50000],
      ["CHF", 50],
      ["CHF", 100],
    ]);
  });

  test("a reserve wallet takes the FLOW factor, like the reserves it holds", async () => {
    const [r] = await q(
      `SELECT current_balance::float b FROM budgeting.wallets WHERE tenant_id = $1 AND wallet_type = 'RESERVE'`,
    );
    expect(r.b).toBe(8000 * 0.25 * 1.2);
  });

  test("spendings convert at the rate, then take the FLOW factor; fx_rate still links them", async () => {
    const rows = await q(
      `SELECT currency_original c, amount_original_cents::int o, amount_converted_cents::int v, fx_rate::float r
         FROM budgeting.expense_ledger WHERE tenant_id = $1 ORDER BY transaction_date`,
    );
    expect(rows[0]).toEqual({ c: "USD", o: 3000, v: 3000, r: 1 });
    // EUR stays EUR (1000 × 1.2); converted PLN 4300 → USD × 0.25 × 1.2.
    expect(rows[1].c).toBe("EUR");
    expect(rows[1].o).toBe(1200);
    expect(rows[1].v).toBe(1290);
    expect(rows[1].r).toBeCloseTo(1290 / 1200, 6);
  });

  test("needs and wants still add up to the rounded limit", async () => {
    const [l] = await q(
      `SELECT normal_amount::int n, needs_amount::int nd, wants_amount::int w FROM budgeting.category_limits WHERE tenant_id = $1`,
    );
    expect(l.nd + l.w).toBe(l.n);
  });

  test("a scheduled payment is not rounded away from what it charges", async () => {
    const [s] = await q(
      `SELECT amount::float a, currency FROM budgeting.scheduled_payments WHERE tenant_id = $1`,
    );
    expect(s).toEqual({ a: 3000 * 0.25 * 1.2, currency: "USD" });
  });
});

describe("investments", () => {
  test("a one-unit account stays one unit; its value moves into the price", async () => {
    const [b] = await q(
      `SELECT quantity::float qty, current_price_cents::float p, buy_price_cents::float bp
         FROM budgeting.investments WHERE tenant_id = $1 AND ui_type = 'broker'`,
    );
    expect(b).toEqual({
      qty: 1,
      p: 10000000 * 0.25 * 0.5,
      bp: 9000000 * 0.25 * 0.5,
    });
  });

  test("a crypto quantity keeps its 8 decimals", async () => {
    const [u] = await q(
      `SELECT quantity::text qty, current_price_cents::float p FROM budgeting.investments
        WHERE tenant_id = $1 AND ui_type = 'crypto'`,
    );
    expect(u.qty).toBe("0.00006173"); // 0.00012345 × 0.5, never rounded to 0.0001
    expect(u.p).toBe(100); // a USD price is a market fact: unchanged
  });

  test("coins stay whole, and a multi-coin purchase becomes staged purchases", async () => {
    const [g] = await q(
      `SELECT id, quantity::float qty, buy_price_cents::float bp FROM budgeting.investments
        WHERE tenant_id = $1 AND ui_type = 'precious_metals'`,
    );
    expect(g.qty).toBe(3); // 6 × 0.5
    // The price per coin is converted, never scaled.
    expect(g.bp).toBe(800000 * 0.25);
    const entries = await asOwner(
      async (c) =>
        (
          await c.query(
            `SELECT kind, effective_date::text d, qty_delta::float qd, cost_delta_cents::text cost
               FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL
              ORDER BY effective_date`,
            [g.id],
          )
        ).rows,
    );
    expect(entries.length).toBeGreaterThan(1);
    expect(entries[0].kind).toBe("start");
    expect(entries[0].d).toBe("2022-10-31");
    expect(entries.slice(1).every((e) => e.kind === "buy")).toBe(true);
    expect(entries.every((e) => Number.isInteger(e.qd) && e.qd >= 1)).toBe(
      true,
    );
    expect(entries.reduce((a, e) => a + e.qd, 0)).toBe(3);
    // Same total cost as the one purchase it replaces: 48,000 × 0.25 × 0.5.
    expect(entries.reduce((a, e) => a + BigInt(e.cost), 0n)).toBe(600000n);
  });

  test("holding names follow their type", async () => {
    const rows = await q(
      `SELECT ui_type, name, group_name FROM budgeting.investments WHERE tenant_id = $1 ORDER BY sort_order`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.ui_type, r]));
    expect(by.precious_metals.name).toMatch(/oz$/);
    expect(by.precious_metals.group_name).toBe("Gold Coins");
    expect(by.broker.name).toBe("Brokerage Account");
    expect(by.crypto.name).toBe("USDT – Exchange");
  });
});

describe("names", () => {
  test("a category is named for what the source category IS", async () => {
    const rows = await q(
      `SELECT name FROM budgeting.categories WHERE tenant_id = $1 ORDER BY sort_index`,
    );
    expect(rows.map((r) => r.name)).toEqual(["Housing", "Groceries", "Car"]);
  });

  test("every spending has a note, from its own category's vocabulary", async () => {
    const rows = await q(
      `SELECT c.name category, l.note FROM budgeting.expense_ledger l
         JOIN budgeting.categories c ON c.id = l.category_id WHERE l.tenant_id = $1`,
    );
    const cats = poolValues("en", "category");
    for (const r of rows) {
      expect(r.note).not.toBeNull();
      expect(merchantsForCategory("en", cats.indexOf(r.category))).toContain(
        r.note,
      );
    }
  });

  test("the biggest spending in a category gets its priciest item, the smallest its cheapest", async () => {
    // 261113: "Car wash" for a $2,617 payment read as nonsense.
    const rows = await q(
      `SELECT l.note FROM budgeting.expense_ledger l JOIN budgeting.categories c ON c.id = l.category_id
        WHERE l.tenant_id = $1 AND c.name = 'Housing' ORDER BY l.amount_converted_cents DESC`,
    );
    const list = merchantsForCategory(
      "en",
      poolValues("en", "category").indexOf("Housing"),
    );
    expect(rows[0].note).toBe(list[0]);
    expect(rows.at(-1)!.note).toBe(list.at(-1));
  });

  test("a wallet name that would repeat takes its currency instead of a number", async () => {
    const rows = await q(
      `SELECT name FROM budgeting.wallets WHERE tenant_id = $1 AND wallet_type = 'CUSHION' ORDER BY sort_order`,
    );
    expect(rows.map((r) => r.name).filter((n) => / \d+$/.test(n))).toEqual([]);
    expect(rows.some((r) => / CHF$/.test(r.name))).toBe(true);
  });

  test("a scheduled payment is named from its category", async () => {
    const [s] = await q(
      `SELECT note FROM budgeting.scheduled_payments WHERE tenant_id = $1`,
    );
    const cats = poolValues("en", "category");
    expect(merchantsForCategory("en", cats.indexOf("Housing"))).toContain(
      s.note,
    );
  });

  test("a payment made by a scheduled payment carries that payment's name", async () => {
    const rows = await q(
      `SELECT l.note, s.note AS scheduled FROM budgeting.expense_ledger l
         JOIN budgeting.scheduled_payments s ON s.id = l.scheduled_payment_id
        WHERE l.tenant_id = $1`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].note).toBe(rows[0].scheduled);
  });

  test("reserve notes say which way the money moved", async () => {
    const rows = await q(
      `SELECT delta_cents::int d, note FROM budgeting.category_reserve_adjustments WHERE tenant_id = $1 ORDER BY delta_cents`,
    );
    expect(poolValues("en", "reserveOut")).toContain(rows[0].note);
    expect(poolValues("en", "reserveIn")).toContain(rows[1].note);
  });

  test("wallet names follow the wallet type and never repeat", async () => {
    const rows = await q(
      `SELECT wallet_type::text t, name FROM budgeting.wallets WHERE tenant_id = $1 ORDER BY sort_order`,
    );
    const names = rows.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    for (const r of rows) {
      const base = r.name.replace(/ ([A-Z]{3}|\d+)$/, "");
      expect(poolValues("en", `wallet${r.t}` as never)).toContain(base);
    }
  });

  test("the biggest monthly income is the salary", async () => {
    const rows = await q(
      `SELECT name, amount::float a FROM budgeting.incomes WHERE tenant_id = $1 ORDER BY amount DESC`,
    );
    expect(rows[0].name).toBe("Salary");
    expect(rows[1].name).not.toBe("Salary");
  });
});
