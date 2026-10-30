/**
 * investments-sell-into.test.ts — Swap → Sell into another investment, real
 * Postgres (13.1 UAT tests 10, 11, 14). A quantity destination is priced
 * quantity × price — the chosen price (New) or its own price (Existing) — and
 * received follows; buy price is never received ÷ quantity, and a tracked
 * destination keeps its live current price. Bad destination input is 422 (this router's validation status),
 * never 500.
 */
import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_APP_RAW = process.env.DATABASE_URL_APP;
if (!DB_APP_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_APP_RAW.replace("@db:", "@localhost:");
if (process.env.DATABASE_URL_WORKER)
  process.env.DATABASE_URL_WORKER = process.env.DATABASE_URL_WORKER.replace(
    "@db:",
    "@localhost:",
  );
const DB_APP = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();
const { DrizzleHoldingRepo } =
  await import("@budget/investments/src/adapters/persistence/holding-repo");
const { DrizzleHistoryRepo } =
  await import("@budget/investments/src/adapters/persistence/history-repo");
type NewHolding =
  import("@budget/investments/src/ports/holding-repo").NewHolding;

interface Fixture {
  userId: string;
  tenantId: string;
}

async function createFixture(currency = "PLN"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'SellI131', true, now(), now())`,
      [userId, `selli131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'SellI131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `selli131-${tenantId.slice(0, 8)}`, currency, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), tenantId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, tenantId };
}

/** Run SQL inside the tenant's RLS scope (app role). */
async function q<T = Record<string, unknown>>(
  fix: Fixture,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = new Pool({ connectionString: DB_APP });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{"${fix.tenantId}"}`,
    ]);
    const r = await c.query(text, params);
    await c.query("COMMIT");
    return r.rows as T[];
  } finally {
    c.release();
    await pool.end();
  }
}

const holdingRepo = new DrizzleHoldingRepo();
const historyRepo = new DrizzleHistoryRepo();

function nh(over: Partial<NewHolding> = {}): NewHolding {
  return {
    name: "Cash PLN",
    holdingType: "cash_fx",
    uiType: "cash",
    icon: null,
    color: null,
    group: null,
    instrumentId: null,
    manualTicker: null,
    buyPriceCents: 1_000_000n,
    buyCurrency: "PLN",
    quantity: "1",
    currentPriceCents: 1_000_000n,
    currentPriceCurrency: "PLN",
    metal: null,
    metalKind: null,
    unitOfMeasure: null,
    premiumPct: null,
    depositRateBps: null,
    depositStartDate: null,
    depositEndDate: null,
    depositCapFrequency: null,
    ...over,
  };
}

const seed = async (fix: Fixture, over: Partial<NewHolding> = {}) =>
  (await holdingRepo.create(fix.tenantId, fix.tenantId, fix.userId, nh(over)))
    .id;

async function buildApp(
  fix: Fixture,
  spies = { reserve: [] as unknown[], cushion: [] as unknown[] },
) {
  const { createInvestmentsModule } =
    await import("@budget/investments/src/contracts/factory");
  const { DrizzleInstrumentRepo } =
    await import("@budget/investments/src/adapters/persistence/instrument-repo");
  const { DrizzlePriceCacheRepo } =
    await import("@budget/investments/src/adapters/persistence/price-cache-repo");
  const { InMemoryPriceProvider } =
    await import("@budget/investments/src/ports/price-provider");
  const { appPool } = await import("@budget/platform");
  const { createInvestmentsRoute } =
    await import("../../src/routes/investments");
  const fxProvider = {
    rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
  } as never;
  const investments = createInvestmentsModule({
    pool: appPool(),
    fxProvider,
    holdingRepo,
    historyRepo,
    instrumentRepo: new DrizzleInstrumentRepo(appPool()),
    priceCacheRepo: new DrizzlePriceCacheRepo(appPool()),
    priceProvider: new InMemoryPriceProvider({}),
  });
  const deps = {
    investments,
    tenancy: {
      workspaceRepo: { findById: async () => ({ default_currency: "PLN" }) },
    },
    identity: { userRepo: { findById: async () => null } },
    budgeting: {
      recomputeReserveTopup: async (i: unknown) => void spies.reserve.push(i),
      recomputeCushionTaskRunner: async (i: unknown) =>
        void spies.cushion.push(i),
    },
  } as never;
  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: fix.userId } });
    c.set("tenantId", fix.tenantId);
    c.set("tenantIds", [fix.tenantId]);
    c.set("userId", fix.userId);
    await next();
  });
  app.route("/investments", createInvestmentsRoute(deps));
  return app;
}

const sell = (app: Hono, id: string, body: Record<string, unknown>) =>
  app.request(`/investments/${id}/sell`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ effectiveDate: "2026-10-24", ...body }),
  });
const row = async (fix: Fixture, id: string) =>
  (
    await q<{ qty: string; buy: string; cur: string }>(
      fix,
      `SELECT quantity::text AS qty, buy_price_cents::text AS buy,
              trim_scale(current_price_cents::numeric)::text AS cur
         FROM budgeting.investments WHERE id = $1`,
      [id],
    )
  )[0];
const legs = async (fix: Fixture) =>
  q<{ kind: string; amount: string; cost: string; qty: string | null }>(
    fix,
    `SELECT kind, amount_cents::text AS amount, cost_delta_cents::text AS cost,
            qty_delta::text AS qty
       FROM budgeting.investment_history
      WHERE budget_id = $1 AND kind IN ('convert_out', 'convert_in', 'transfer_out', 'transfer_in')
      ORDER BY created_at, kind DESC`,
    [fix.tenantId],
  );
const btc = (over: Partial<NewHolding> = {}) =>
  nh({
    name: "BTC",
    holdingType: "crypto",
    uiType: "crypto",
    quantity: "1",
    buyPriceCents: 100_000n,
    currentPriceCents: 120_000n,
    ...over,
  });

describe("Sell into another investment", () => {
  it("a new tracked destination keeps the chosen buy price and its live price", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(fix, btc());
    const res = await sell(app, src, {
      left: { quantity: "0.5" },
      destination: {
        kind: "new",
        holding: {
          name: "USDT",
          holdingType: "crypto",
          uiType: "crypto",
          quantity: "16284.6",
          currentPriceCents: "101",
          currentPriceCurrency: "PLN",
        },
        priceCents: "100",
      },
      receivedCents: "999999",
      receivedCurrency: "PLN",
    });
    expect(res.status).toBe(201);
    const { newHoldingId } = (await res.json()) as { newHoldingId: string };
    expect(await row(fix, newHoldingId)).toEqual({
      qty: "16284.60000000",
      buy: "100",
      cur: "101",
    });
    expect(await legs(fix)).toEqual([
      {
        kind: "convert_out",
        amount: "1628460",
        cost: "-50000",
        qty: "-0.50000000",
      },
      {
        kind: "convert_in",
        amount: "1628460",
        cost: "1628460",
        qty: "16284.60000000",
      },
    ]);
  });

  it("an existing destination is priced at its own price; a client price is ignored", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(fix, btc());
    const eth = await seed(
      fix,
      btc({ name: "ETH", buyPriceCents: 900n, currentPriceCents: 1_000n }),
    );
    const res = await sell(app, src, {
      left: { quantity: "0.5" },
      destination: {
        kind: "existing",
        holdingId: eth,
        quantityBought: "2",
        priceCents: "5",
      },
      receivedCurrency: "PLN",
    });
    expect(res.status).toBe(201);
    expect(await row(fix, eth)).toEqual({
      qty: "3.00000000",
      buy: "967",
      cur: "1000",
    });
  });

  // Round-5 gap 6: a sale in another currency books into the SAME asset.
  it("an existing destination takes a sale received in another currency", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(fix, btc());
    const pot = await seed(fix, { name: "Pot" });
    const before = await q<{ n: number }>(
      fix,
      `SELECT count(*)::int AS n FROM budgeting.investments WHERE budget_id = $1`,
      [fix.tenantId],
    );
    const res = await sell(app, src, {
      left: { quantity: "0.5" },
      destination: { kind: "existing", holdingId: pot },
      receivedCents: "40000",
      receivedCurrency: "EUR",
    });
    expect(res.status).toBe(201);
    expect(
      await q<{ n: number }>(
        fix,
        `SELECT count(*)::int AS n FROM budgeting.investments WHERE budget_id = $1`,
        [fix.tenantId],
      ),
    ).toEqual(before);
    expect((await row(fix, pot))!.cur).toBe("1040000");
    // R6-2: both legs keep the deal's figure in their asset's currency.
    const stored = await q<{ kind: string; a: string | null }>(
      fix,
      `SELECT kind, asset_amount_cents::text AS a FROM budgeting.investment_history
        WHERE budget_id = $1 AND kind IN ('convert_out', 'convert_in')`,
      [fix.tenantId],
    );
    expect(stored.every((r) => r.a !== null)).toBe(true);
  });

  // Round-5 scope change: same name, same currency — booked by id only.
  it("selling into one of two identical assets leaves the other untouched", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(fix, btc());
    const a = await seed(fix, { name: "Pot" });
    const b = await seed(fix, { name: "Pot" });
    const res = await sell(app, src, {
      left: { quantity: "0.5" },
      destination: { kind: "existing", holdingId: b },
      receivedCents: "5000",
      receivedCurrency: "PLN",
    });
    expect(res.status).toBe(201);
    expect((await row(fix, a))!.cur).toBe("1000000");
    expect((await row(fix, b))!.cur).toBe("1005000");
  });

  it("bad destination input is a 422, never a 500", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(fix, btc());
    const eth = await seed(fix, btc({ name: "ETH" }));
    const into = (destination: unknown, extra = {}) =>
      sell(app, src, {
        left: { quantity: "0.5" },
        destination,
        receivedCurrency: "PLN",
        ...extra,
      });
    const newCoin = (over: Record<string, unknown>) => ({
      kind: "new",
      holding: {
        name: "SOL",
        holdingType: "crypto",
        uiType: "crypto",
        quantity: "2",
      },
      priceCents: "100",
      ...over,
    });
    for (const q of ["0", "-1", "abc"])
      expect(
        (await into({ kind: "existing", holdingId: eth, quantityBought: q }))
          .status,
      ).toBe(422);
    for (const p of ["0", "-1", "abc"])
      expect((await into(newCoin({ priceCents: p }))).status).toBe(422);
    const noPrice = await into(newCoin({ priceCents: undefined }));
    expect(noPrice.status).toBe(422);
    expect(await noPrice.json()).toEqual({ error: "price_required" });
    const noQty = await into({ kind: "existing", holdingId: eth });
    expect(await noQty.json()).toEqual({ error: "quantity_required" });
    const noReceived = await into({ kind: "out" });
    expect(noReceived.status).toBe(422);
    expect(await noReceived.json()).toEqual({ error: "received_required" });
    expect(await legs(fix)).toHaveLength(0);
  });

  // UAT 11: once the source average is right, Transfer moves cost at it.
  it("transfer moves cost at the source average", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const src = await seed(
      fix,
      btc({ quantity: "2.1", buyPriceCents: 6_099_100n }),
    );
    const res = await app.request(`/investments/${src}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        effectiveDate: "2026-10-24",
        move: { quantity: "0.3" },
        to: { kind: "new", name: "BTC Cold" },
      }),
    });
    expect(res.status).toBe(201);
    const [out, inn] = await legs(fix);
    expect(out).toMatchObject({ kind: "transfer_out", cost: "-1829730" });
    expect(inn).toMatchObject({ kind: "transfer_in", cost: "1829730" });
  });
});
