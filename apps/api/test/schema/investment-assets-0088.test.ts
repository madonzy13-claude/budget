/**
 * investment-assets-0088.test.ts — gate for migration 0088 (Phase 13.1).
 *
 * Two parts:
 *  - Catalog: the post-migration shape (new ledger kinds + columns, the label
 *    unique index, the newest-entry index, FORCE RLS restored). Skipped until
 *    0088 is recorded in drizzle.__drizzle_migrations (plan 13.1-05 applies it).
 *  - Data: seeds a pre-0088 fixture tenant INSIDE one transaction, runs the
 *    migration SQL twice (idempotency) and ROLLBACKs — real data is never touched.
 *    Asserts D-33 clean merge (quantity AND amount shape), D-34 rename-not-merge
 *    for conflicts, D-35 cost-0 Start backfill, task payload repoint and
 *    conservation of Σqty / history rows.
 *
 * Runs as the migrator (table owner): with FORCE lifted inside the tx the owner
 * bypasses RLS, exactly like the real migration run.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { holdingShape } from "../../../../packages/investments/src/domain/holding";

const RAW = process.env.DATABASE_URL_MIGRATOR;
const URL = RAW?.replace("@db:", "@localhost:");
const SQL_PATH = join(
  import.meta.dir,
  "../../../../drizzle/0088_investment_assets.sql",
);
const WHEN_0088 = 1782915601012;

let pool: Pool;
let applied = false;
beforeAll(async () => {
  if (!URL) return;
  pool = new Pool({ connectionString: URL });
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations WHERE created_at = $1`,
    [WHEN_0088],
  );
  applied = r.rows[0].n > 0;
});
afterAll(() => pool?.end());

describe.skipIf(!URL)("Migration 0088 investment assets — catalog", () => {
  test("applied: ledger kinds, columns, indexes and FORCE RLS", async () => {
    if (!applied) return; // plan 13.1-05 applies 0088 to dev
    const chk = await pool.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'investment_history_kind_chk'
          AND conrelid = 'budgeting.investment_history'::regclass`,
    );
    for (const k of ["transfer_out", "transfer_in", "price_change"])
      expect(chk.rows[0].def).toContain(`'${k}'`);
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'budgeting' AND table_name = 'investment_history'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    for (const c of [
      "wallet_id",
      "wallet_delta_numeric",
      "wallet_created",
      "prior_price_cents",
      "prior_price_currency",
      "backfilled",
    ])
      expect(names).toContain(c);
    const idx = await pool.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'budgeting'
          AND indexname IN ('investments_label_uq', 'investments_label_ccy_uq', 'investment_history_newest_idx')`,
    );
    // Round-5 scope change (0093): no asset-name uniqueness is left.
    expect(idx.rows.map((r) => r.indexname)).toEqual([
      "investment_history_newest_idx",
    ]);
    const force = await pool.query(
      `SELECT relname, relforcerowsecurity AS f FROM pg_class
        WHERE oid IN ('budgeting.investments'::regclass, 'budgeting.investment_history'::regclass)`,
    );
    expect(force.rows.every((r) => r.f)).toBe(true);
  });
});

describe.skipIf(!URL)("Migration 0088 investment assets — data", () => {
  let c: PoolClient;
  const budgetId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  let instrumentId = "";
  const ids: Record<string, string> = {};
  let rowsBefore = 0;
  let historyBefore = 0;
  let noHistoryBefore = 0;

  const statements = () =>
    readFileSync(SQL_PATH, "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.replace(/^--.*$/gm, "").trim().length > 0);

  const LIFTED = [
    "identity.users",
    "tenancy.budgets",
    "tenancy.budget_members",
    "budgeting.investments",
    "budgeting.investment_history",
    "budgeting.tasks",
  ];
  const lift = async () => {
    for (const t of LIFTED)
      await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
  };
  // The migration restores FORCE at its end; lift again so the owner can read back.
  const run = async () => {
    for (const s of statements()) await c.query(s);
    await lift();
  };

  let seq = 0;
  async function holding(
    key: string,
    o: {
      name: string;
      ui: string;
      ht: string;
      qty: string;
      buy: number | null;
      buyCcy: string | null;
      cur?: number | null;
      curCcy?: string | null;
      inst?: string | null;
      archived?: boolean;
      history?: boolean;
    },
  ) {
    const id = crypto.randomUUID();
    ids[key] = id;
    seq++;
    await c.query(
      `INSERT INTO budgeting.investments
         (id, tenant_id, budget_id, instrument_id, name, holding_type, ui_type, quantity,
          buy_price_cents, buy_currency, current_price_cents, current_price_currency,
          archived_at, created_at,
          deposit_rate_bps, deposit_start_date, deposit_cap_frequency)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               CASE WHEN $12 THEN now() END, now() - make_interval(days => 100 - $13::int),
               CASE WHEN $5 = 'deposit' THEN 500 END,
               CASE WHEN $5 = 'deposit' THEN DATE '2026-01-01' END,
               CASE WHEN $5 = 'deposit' THEN 'monthly' END)`,
      [
        id,
        budgetId,
        o.inst ?? null,
        o.name,
        o.ht,
        o.ui,
        o.qty,
        o.buy,
        o.buyCcy,
        o.cur ?? null,
        o.curCcy ?? null,
        o.archived ?? false,
        seq,
      ],
    );
    if (o.history !== false) {
      const amountShape =
        holdingShape({ holdingType: o.ht, uiType: o.ui, quantity: o.qty }) !==
        "quantity";
      const cost = Math.round((o.buy ?? 0) * Number(o.qty));
      // 0087 convention: Start carries qty_delta = quantity even for amount rows.
      await c.query(
        `INSERT INTO budgeting.investment_history
           (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency,
            qty_delta, cost_delta_cents, cost_currency, flow_cents, flow_currency)
         VALUES ($1, $1, $2, 'start', CURRENT_DATE - 100 + $3::int, $4, $5, $6, $4, $5, $4, $5)`,
        [
          budgetId,
          id,
          seq,
          cost,
          o.buyCcy ?? o.curCcy ?? "PLN",
          amountShape ? "1" : o.qty,
        ],
      );
    }
    return id;
  }

  const one = async (q: string, p: unknown[] = []) =>
    (await c.query(q, p)).rows[0];
  const assets = async () =>
    (
      await c.query(
        `SELECT id, name, ui_type, holding_type, quantity::text AS quantity,
                buy_price_cents::text AS buy, current_price_cents::numeric::text AS cur
           FROM budgeting.investments WHERE budget_id = $1 ORDER BY name`,
        [budgetId],
      )
    ).rows;
  const byName = async (name: string) =>
    (await assets()).filter((a) => a.name === name);

  beforeAll(async () => {
    c = await pool.connect();
    await c.query("BEGIN");
    await lift();
    await c.query(`DROP INDEX IF EXISTS budgeting.investments_label_uq`);
    // The dev DB keeps 0088's backup table; its copied kind CHECK predates the
    // transfer / price kinds that live rows now carry (rolled back with the tx).
    await c.query(
      `ALTER TABLE IF EXISTS budgeting._investment_history_bak_0088
         DROP CONSTRAINT IF EXISTS investment_history_kind_chk`,
    );
    await c.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'mig 0088', true, now(), now())`,
      [userId, `mig0088-${userId.slice(0, 8)}@example.com`],
    );
    await c.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'mig 0088', 'PRIVATE', 'PLN', $3, 1, now(), true)`,
      [budgetId, `mig0088-${budgetId.slice(0, 8)}`, userId],
    );
    const inst = await c.query(
      `INSERT INTO budgeting.instruments
         (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, fetched_at)
       VALUES ($1, 'Mig coin', 'coingecko', 'crypto', 'USD', 'hourly', true, now())
       RETURNING id::text AS id`,
      [`MIG${budgetId.slice(0, 6)}`],
    );
    instrumentId = inst.rows[0].id;

    // D-33 clean quantity group: 3 active BTC rows, same ccy + instrument.
    for (const [k, qty, buy] of [
      ["btc1", "1", 3_000_000],
      ["btc2", "2", 4_000_000],
      ["btc3", "0.5", 5_000_000],
    ] as const)
      await holding(k, {
        name: k === "btc2" ? " btc " : "BTC",
        ui: "crypto",
        ht: "crypto",
        qty,
        buy,
        buyCcy: "USD",
        cur: 6_000_000,
        curCcy: "USD",
        inst: instrumentId,
      });
    // D-33 clean amount groups: quantity stays 1, prices are totals.
    await holding("cash1", {
      name: "Envelope",
      ui: "cash",
      ht: "cash_fx",
      qty: "1",
      buy: 100_000,
      buyCcy: "PLN",
      cur: 100_000,
      curCcy: "PLN",
    });
    await holding("cash2", {
      name: "Envelope",
      ui: "cash",
      ht: "cash_fx",
      qty: "1",
      buy: 50_000,
      buyCcy: "PLN",
      cur: 50_000,
      curCcy: "PLN",
    });
    await holding("flat1", {
      name: "Flat",
      ui: "real_estate",
      ht: "real_estate",
      qty: "1",
      buy: 20_000_000,
      buyCcy: "PLN",
      cur: 25_000_000,
      curCcy: "PLN",
    });
    await holding("flat2", {
      name: "Flat",
      ui: "real_estate",
      ht: "real_estate",
      qty: "1",
      buy: 5_000_000,
      buyCcy: "PLN",
      cur: 6_000_000,
      curCcy: "PLN",
    });
    // D-34 conflicts.
    await holding("coins1", {
      name: "Coins",
      ui: "cash",
      ht: "cash_fx",
      qty: "1",
      buy: 10_000,
      buyCcy: "PLN",
      cur: 10_000,
      curCcy: "PLN",
    });
    await holding("coins2", {
      name: "Coins",
      ui: "cash",
      ht: "cash_fx",
      qty: "3",
      buy: 10_000,
      buyCcy: "PLN",
      cur: 10_000,
      curCcy: "PLN",
    });
    await holding("wal1", {
      name: "Wallet",
      ui: "cash",
      ht: "cash_fx",
      qty: "1",
      buy: null,
      buyCcy: null,
      cur: 70_000,
      curCcy: "PLN",
    });
    await holding("wal2", {
      name: "Wallet",
      ui: "cash",
      ht: "cash_fx",
      qty: "1",
      buy: null,
      buyCcy: null,
      cur: 30_000,
      curCcy: "EUR",
    });
    await holding("eth1", {
      name: "ETH",
      ui: "crypto",
      ht: "crypto",
      qty: "1",
      buy: 200_000,
      buyCcy: "USD",
    });
    await holding("eth2", {
      name: "ETH",
      ui: "crypto",
      ht: "crypto",
      qty: "1",
      buy: 200_000,
      buyCcy: "EUR",
    });
    await holding("sol1", {
      name: "SOL",
      ui: "crypto",
      ht: "crypto",
      qty: "4",
      buy: 10_000,
      buyCcy: "USD",
      inst: instrumentId,
    });
    await holding("sol2", {
      name: "SOL",
      ui: "crypto",
      ht: "crypto",
      qty: "4",
      buy: 10_000,
      buyCcy: "USD",
      inst: null,
    });
    await holding("doge1", {
      name: "DOGE",
      ui: "crypto",
      ht: "crypto",
      qty: "9",
      buy: 10,
      buyCcy: "USD",
      archived: true,
    });
    await holding("doge2", {
      name: "DOGE",
      ui: "crypto",
      ht: "crypto",
      qty: "9",
      buy: 10,
      buyCcy: "USD",
    });
    await holding("dep1", {
      name: "Bank 5%",
      ui: "deposit",
      ht: "deposit",
      qty: "1",
      buy: 1_000_000,
      buyCcy: "PLN",
    });
    await holding("dep2", {
      name: "Bank 5%",
      ui: "deposit",
      ht: "deposit",
      qty: "1",
      buy: 1_000_000,
      buyCcy: "PLN",
    });
    // D-35 backfill: no ledger entries at all.
    await holding("gold", {
      name: "Gold coin",
      ui: "precious_metals",
      ht: "commodity",
      qty: "2",
      buy: null,
      buyCcy: null,
      cur: 900_000,
      curCcy: "USD",
      history: false,
    });
    await holding("old", {
      name: "Old fund",
      ui: "other",
      ht: "other",
      qty: "1",
      buy: null,
      buyCcy: null,
      archived: true,
      history: false,
    });

    await c.query(
      `INSERT INTO budgeting.tasks (tenant_id, budget_id, kind, payload_json)
       VALUES ($1, $1, 'INVESTMENT_INSTRUMENT_DELISTED', jsonb_build_object('holding_id', $2::text))`,
      [budgetId, ids.btc3],
    );

    rowsBefore = (await assets()).length;
    historyBefore = (
      await one(
        `SELECT count(*)::int AS n FROM budgeting.investment_history WHERE budget_id = $1`,
        [budgetId],
      )
    ).n;
    noHistoryBefore = 2;

    await run();
  });

  afterAll(async () => {
    await c?.query("ROLLBACK");
    c?.release();
  });

  test("clean quantity group merges into the oldest row with weighted average cost", async () => {
    const rows = (await assets()).filter(
      (a) => a.name.trim().toLowerCase() === "btc",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.btc1);
    expect(Number(rows[0].quantity)).toBe(3.5);
    // (3,000,000×1 + 4,000,000×2 + 5,000,000×0.5) / 3.5 = 3,857,142.857
    expect(rows[0].buy).toBe("3857143");
    const h = await one(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE holding_id = $1)::int AS on_survivor
         FROM budgeting.investment_history
        WHERE holding_id IN ($1, $2, $3)`,
      [ids.btc1, ids.btc2, ids.btc3],
    );
    expect(h).toEqual({ n: 3, on_survivor: 3 });
  });

  test("amount groups keep quantity 1 with summed prices and stay amount-shaped", async () => {
    for (const [name, buy, cur] of [
      ["Envelope", "150000", "150000"],
      ["Flat", "25000000", "31000000"],
    ] as const) {
      const rows = await byName(name);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].quantity)).toBe(1);
      expect(rows[0].buy).toBe(buy);
      expect(Number(rows[0].cur)).toBe(Number(cur));
      expect(
        holdingShape({
          holdingType: rows[0].holding_type,
          uiType: rows[0].ui_type,
          quantity: rows[0].quantity,
        }),
      ).toBe("amount");
      const q = await one(
        `SELECT count(*) FILTER (WHERE qty_delta IS NOT NULL)::int AS with_qty, count(*)::int AS n
           FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL`,
        [rows[0].id],
      );
      expect(q.n).toBe(2);
      expect(q.with_qty).toBeLessThanOrEqual(1);
    }
  });

  test("conflicting same-name groups are renamed, not merged (D-34)", async () => {
    const names = (await assets()).map((a) => a.name);
    for (const n of [
      "Coins",
      "Coins (2)",
      "Wallet",
      "Wallet (2)",
      "ETH",
      "ETH (2)",
      "SOL",
      "SOL (2)",
      "DOGE",
      "DOGE (2)",
      "Bank 5%",
      "Bank 5% (2)",
    ])
      expect(names).toContain(n);
    const renamed = async (k: string) =>
      (
        await one(`SELECT name FROM budgeting.investments WHERE id = $1`, [
          ids[k],
        ])
      ).name;
    expect(await renamed("coins2")).toBe("Coins (2)");
    expect(await renamed("wal2")).toBe("Wallet (2)");
    expect(await renamed("eth2")).toBe("ETH (2)");
    expect(await renamed("sol2")).toBe("SOL (2)");
    // Keeper = sub-group with the oldest ACTIVE row, so the older archived row is renamed.
    expect(await renamed("doge1")).toBe("DOGE (2)");
    expect(await renamed("dep2")).toBe("Bank 5% (2)");
    expect(Number((await byName("Wallet"))[0].cur)).toBe(70_000);
  });

  test("assets without entries get one cost-0 backfilled Start (D-35)", async () => {
    const rows = (
      await c.query(
        `SELECT holding_id, kind, cost_delta_cents::text AS cost, flow_cents::text AS flow,
                qty_delta::text AS qty, cost_currency, flow_currency, backfilled
           FROM budgeting.investment_history WHERE holding_id IN ($1, $2) ORDER BY holding_id = $1 DESC`,
        [ids.gold, ids.old],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "start",
      cost: "0",
      flow: "0",
      cost_currency: "USD",
      flow_currency: "USD",
      backfilled: true,
    });
    expect(Number(rows[0].qty)).toBe(2);
    expect(rows[1]).toMatchObject({
      kind: "start",
      cost: "0",
      qty: null,
      cost_currency: "PLN",
      backfilled: true,
    });
  });

  test("every asset has an entry; quantity assets' entries sum to their quantity", async () => {
    const r = await c.query(
      `SELECT i.id, i.holding_type, i.ui_type, i.quantity::text AS quantity,
              count(h.id)::int AS n, coalesce(sum(h.qty_delta), 0)::text AS q
         FROM budgeting.investments i
         LEFT JOIN budgeting.investment_history h ON h.holding_id = i.id AND h.deleted_at IS NULL
        WHERE i.budget_id = $1 GROUP BY i.id`,
      [budgetId],
    );
    for (const a of r.rows) {
      expect(a.n).toBeGreaterThan(0);
      if (
        holdingShape({
          holdingType: a.holding_type,
          uiType: a.ui_type,
          quantity: a.quantity,
        }) === "quantity"
      )
        expect(Number(a.q)).toBe(Number(a.quantity));
    }
  });

  test("row and history counts are conserved", async () => {
    // BTC 3→1, Envelope 2→1, Flat 2→1.
    expect((await assets()).length).toBe(rowsBefore - 4);
    const h = await one(
      `SELECT count(*)::int AS n FROM budgeting.investment_history WHERE budget_id = $1`,
      [budgetId],
    );
    expect(h.n).toBe(historyBefore + noHistoryBefore);
  });

  test("task payloads follow the merged-away holding to its survivor", async () => {
    const t = await one(
      `SELECT payload_json->>'holding_id' AS h FROM budgeting.tasks WHERE budget_id = $1`,
      [budgetId],
    );
    expect(t.h).toBe(ids.btc1);
  });

  test("running the migration again changes nothing (idempotent)", async () => {
    const before = JSON.stringify(await assets());
    const h = `SELECT count(*)::int AS n FROM budgeting.investment_history WHERE budget_id = $1`;
    const hBefore = (await one(h, [budgetId])).n;
    await run();
    expect(JSON.stringify(await assets())).toBe(before);
    expect((await one(h, [budgetId])).n).toBe(hBefore);
  });

  test("ledger accepts the new kinds and wallet/price columns", async () => {
    await c.query("SAVEPOINT kinds");
    await c.query(
      `INSERT INTO budgeting.investment_history
         (tenant_id, budget_id, holding_id, kind, effective_date, wallet_delta_numeric,
          wallet_created, prior_price_cents, prior_price_currency, backfilled)
       VALUES ($1, $1, $2, 'transfer_out', CURRENT_DATE, 12.5, false, 100.5, 'USD', false),
              ($1, $1, $2, 'transfer_in', CURRENT_DATE, NULL, false, NULL, NULL, false),
              ($1, $1, $2, 'price_change', CURRENT_DATE, NULL, false, 1, 'USD', false)`,
      [budgetId, ids.btc1],
    );
    await c.query("ROLLBACK TO SAVEPOINT kinds");
  });

  test("the label is unique per budget + type, case- and space-insensitive", async () => {
    await c.query("SAVEPOINT uq");
    const code = await c
      .query(
        `INSERT INTO budgeting.investments (tenant_id, budget_id, name, holding_type, ui_type, quantity)
         VALUES ($1, $1, ' envelope ', 'cash_fx', 'cash', 1)`,
        [budgetId],
      )
      .then(
        () => "inserted",
        (e: { code: string }) => e.code,
      );
    await c.query("ROLLBACK TO SAVEPOINT uq");
    expect(code).toBe("23505");
  });
});
