/**
 * investments.test.ts — Investments route integration tests (Plan 09-06).
 * Real Postgres (DATABASE_URL_APP / _WORKER). Un-skipped from the 09-05 scaffold.
 * Covers INV-03 round-trip, cross-tenant RLS, and INV-14 on-add rate limit.
 */
import { describe, it, expect, afterAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_APP_RAW = process.env.DATABASE_URL_APP;
const DB_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (!DB_APP_RAW || !DB_WORKER_RAW)
  throw new Error(
    "DATABASE_URL_APP and _WORKER required for integration tests",
  );
process.env.DATABASE_URL_APP = DB_APP_RAW.replace("@db:", "@localhost:");
process.env.DATABASE_URL_WORKER = DB_WORKER_RAW.replace("@db:", "@localhost:");
const DB_APP = process.env.DATABASE_URL_APP;
const DB_WORKER = process.env.DATABASE_URL_WORKER;

const { resetPools } = await import("@budget/platform");
resetPools();

const TEST_PROVIDER = "test_inv06";

interface Fixture {
  userId: string;
  tenantId: string;
}

async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_APP });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Inv06 Test', true, now(), now())`,
      [userId, `inv06-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Inv06 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `inv06-${tenantId.slice(0, 8)}`, currency, userId],
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

async function seedInstrument(symbol: string): Promise<string> {
  const pool = new Pool({ connectionString: DB_WORKER });
  try {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO budgeting.instruments (symbol, display_name, provider, asset_class, quote_currency, refresh_cadence, active, fetched_at)
       VALUES ($1, $1, $2, 'equities', 'USD', 'hourly', true, now())
       ON CONFLICT (symbol, provider) DO UPDATE SET active = true
       RETURNING id::text AS id`,
      [symbol, TEST_PROVIDER],
    );
    return r.rows[0].id;
  } finally {
    await pool.end();
  }
}

async function buildApp(fix: Fixture, priceSymbol?: string | string[]) {
  const { createInvestmentsModule } =
    await import("@budget/investments/src/contracts/factory");
  const { DrizzleHoldingRepo } =
    await import("@budget/investments/src/adapters/persistence/holding-repo");
  const { DrizzleHistoryRepo } =
    await import("@budget/investments/src/adapters/persistence/history-repo");
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
  const priceMap: Record<string, { price: string; currency: string }> = {};
  for (const s of priceSymbol
    ? Array.isArray(priceSymbol)
      ? priceSymbol
      : [priceSymbol]
    : []) {
    priceMap[s] = { price: "100.00", currency: "USD" };
  }
  const priceProvider = new InMemoryPriceProvider(priceMap);

  const investments = createInvestmentsModule({
    pool: appPool(),
    fxProvider,
    holdingRepo: new DrizzleHoldingRepo(),
    historyRepo: new DrizzleHistoryRepo(),
    instrumentRepo: new DrizzleInstrumentRepo(appPool()),
    priceCacheRepo: new DrizzlePriceCacheRepo(appPool()),
    priceProvider,
  });

  const deps = {
    investments,
    tenancy: {
      workspaceRepo: {
        findById: async () => ({ default_currency: "EUR" }),
      },
    },
    // The route reads the actor's timezone to date a holding in their own day
    // (deps.identity.userRepo.findById(...)?.timezone, falling back to UTC).
    // Without the repo the lookup threw before any assertion ran. null exercises
    // the fallback, which is what these currency/round-trip cases assume.
    identity: {
      userRepo: { findById: async () => null },
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
  app.route("/investments", createInvestmentsRoute(deps as never));
  return app;
}

afterAll(async () => {
  // Best-effort: holdings reference these instruments (FK), so a delete may fail.
  // seedInstrument is idempotent (ON CONFLICT), so leftover test instruments are
  // harmless; cleaning the cache rows is enough.
  const pool = new Pool({ connectionString: DB_WORKER });
  try {
    await pool.query(
      `DELETE FROM budgeting.instrument_price_cache
        WHERE instrument_id IN (SELECT id FROM budgeting.instruments WHERE provider = $1)`,
      [TEST_PROVIDER],
    );
  } catch {
    /* best-effort */
  } finally {
    await pool.end();
  }
});

describe("Investments routes", () => {
  it("POST then GET round-trips a custom holding with all fields (INV-03)", async () => {
    const fix = await createFixture("EUR");
    const app = await buildApp(fix);

    const postRes = await app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Vintage Watch",
        holdingType: "other",
        quantity: "1",
        currentPriceCents: 250000,
        currentPriceCurrency: "EUR",
      }),
    });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as any;
    expect(created.name).toBe("Vintage Watch");
    expect(created.instrumentId).toBeNull();

    const getRes = await app.request("/investments");
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as any;
    const row = body.holdings.find((h: any) => h.id === created.id);
    expect(row).toBeDefined();
    expect(row.name).toBe("Vintage Watch");
    expect(row.valueInBudgetCents).toBe("250000");
    // R6 (user): every asset says when its value last changed.
    expect(Number.isNaN(Date.parse(row.valueUpdatedAt))).toBe(false);
  });

  // user, 261023: typing 170 for 3 units stored 56.67/unit and showed 169.98.
  it("keeps a sub-cent unit price so the total typed for many units survives", async () => {
    const fix = await createFixture("PLN");
    const app = await buildApp(fix);

    const postRes = await app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Land plot",
        holdingType: "other",
        quantity: "3",
        currentPriceCents: 10000,
        currentPriceCurrency: "PLN",
      }),
    });
    const created = (await postRes.json()) as any;

    const patchRes = await app.request(`/investments/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPriceCents: "5666.666667" }),
    });
    expect(patchRes.status).toBe(200);

    const body = (await (await app.request("/investments")).json()) as any;
    const row = body.holdings.find((h: any) => h.id === created.id);
    expect(row.currentPriceCents).toBe("5666.666667");
    expect(row.valueCents).toBe("17000");
  });

  // 13.1 CR-01 regression: a label edit never writes quantity or cost.
  it("a label PATCH leaves quantity and buy price unchanged", async () => {
    const fix = await createFixture("PLN");
    const app = await buildApp(fix);
    const created = (await (
      await app.request("/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bond fund",
          holdingType: "other",
          uiType: "other",
          quantity: "3",
          buyPriceCents: "1000",
          buyCurrency: "PLN",
          currentPriceCents: "1200",
          currentPriceCurrency: "PLN",
        }),
      })
    ).json()) as any;
    const res = await app.request(`/investments/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bond fund II" }),
    });
    expect(res.status).toBe(200);
    const after = (await res.json()) as any;
    expect(after).toMatchObject({
      name: "Bond fund II",
      quantity: "3.00000000",
      buyPriceCents: "1000",
    });
  });

  it("a holding created under tenant B is NOT visible in tenant A's GET (RLS, INV-03)", async () => {
    const a = await createFixture("EUR");
    const b = await createFixture("EUR");
    const appA = await buildApp(a);
    const appB = await buildApp(b);

    const postB = await appB.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tenant B Secret",
        holdingType: "other",
        quantity: "1",
        currentPriceCents: 9999,
        currentPriceCurrency: "EUR",
      }),
    });
    expect(postB.status).toBe(201);
    const bHolding = (await postB.json()) as any;

    const getA = await appA.request("/investments");
    const aBody = (await getA.json()) as any;
    expect(aBody.holdings.some((h: any) => h.id === bHolding.id)).toBe(false);
  });

  it("listHoldings reads the refreshed instrument_price_cache price for a tracked holding, not the add-time row price (B4/INV-08)", async () => {
    const fix = await createFixture("USD");
    const instrumentId = await seedInstrument("CACHEWIN");
    const app = await buildApp(fix);

    // Add a TRACKED holding with an add-time price of 100.00 (10000 cents).
    const postRes = await app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tracked Co",
        holdingType: "equities",
        instrumentId,
        quantity: "1",
        buyPriceCents: 10000,
        buyCurrency: "USD",
        currentPriceCents: 10000,
        currentPriceCurrency: "USD",
      }),
    });
    expect(postRes.status).toBe(201);
    const created = (await postRes.json()) as any;
    expect(created.currentPriceCents).toBe("10000"); // add-time row price

    // The hourly cron refreshes the cache to 150.00.
    const wk = new Pool({ connectionString: DB_WORKER });
    try {
      await wk.query(
        `INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
         VALUES ($1::uuid, '150.00', 'USD', now())
         ON CONFLICT (instrument_id) DO UPDATE SET price = EXCLUDED.price, fetched_at = now()`,
        [instrumentId],
      );
    } finally {
      await wk.end();
    }

    const getRes = await app.request("/investments");
    const body = (await getRes.json()) as any;
    const row = body.holdings.find((h: any) => h.id === created.id);
    expect(row).toBeDefined();
    // Cache (15000) wins over the add-time row price (10000).
    expect(row.currentPriceCents).toBe("15000");
    expect(row.valueInBudgetCents).toBe("15000");
  });

  // R6 (user): hidden assets leave the list but are fetched on their own, so
  // each group can offer "Show N hidden assets".
  it("GET /?hidden=1 lists only the hidden assets; GET / leaves them out", async () => {
    const fix = await createFixture("USD");
    const app = await buildApp(fix);
    const add = async (name: string) =>
      (
        (await (
          await app.request("/investments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              holdingType: "cash_fx",
              uiType: "cash",
              quantity: "1",
              currentPriceCents: 10000,
              currentPriceCurrency: "USD",
            }),
          })
        ).json()) as { id: string }
      ).id;
    const shown = await add("Shown");
    const hidden = await add("Hidden");
    const hide = await app.request(`/investments/${hidden}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(hide.status).toBe(200);
    const ids = async (q: string) =>
      (
        (await (await app.request(`/investments${q}`)).json()) as {
          holdings: { id: string; weightPct: number }[];
        }
      ).holdings;
    expect((await ids("")).map((h) => h.id)).toEqual([shown]);
    const list = await ids("?hidden=1");
    expect(list.map((h) => h.id)).toEqual([hidden]);
    // A hidden asset is no share of the portfolio.
    expect(list[0]!.weightPct).toBe(0);
  });

  // R6 (user, USDC - Kraken): the name picker read the stored row price, so a
  // bad or stale one showed there while the list showed the live price.
  it("GET /names values a tracked asset at the cache price, like the list", async () => {
    const fix = await createFixture("USD");
    const instrumentId = await seedInstrument("NAMECACHE");
    const app = await buildApp(fix);
    const postRes = await app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Tracked Names",
        holdingType: "equities",
        uiType: "stocks",
        instrumentId,
        quantity: "2",
        buyPriceCents: 10000,
        buyCurrency: "USD",
        currentPriceCents: 39370,
        currentPriceCurrency: "USD",
      }),
    });
    expect(postRes.status).toBe(201);
    const wk = new Pool({ connectionString: DB_WORKER });
    try {
      await wk.query(
        `INSERT INTO budgeting.instrument_price_cache (instrument_id, price, currency, fetched_at)
         VALUES ($1::uuid, '150.00', 'USD', now())
         ON CONFLICT (instrument_id) DO UPDATE SET price = EXCLUDED.price, fetched_at = now()`,
        [instrumentId],
      );
    } finally {
      await wk.end();
    }
    const res = await app.request("/investments/names?type=stocks");
    const { names } = (await res.json()) as {
      names: Array<{ name: string; valueCents: string; valueCurrency: string }>;
    };
    expect(names.find((n) => n.name === "Tracked Names")).toMatchObject({
      valueCents: "30000",
      valueCurrency: "USD",
    });
  });

  it("the 11th on-add instant price fetch within a minute is rate-limited (INV-14)", async () => {
    const fix = await createFixture("EUR");
    // 11 DISTINCT instruments: the read-through cache (9.2) serves a repeated
    // same-instrument fetch without charging the limit (that's the quota-protection
    // point), so the per-user/minute throttle is exercised by distinct cache-miss
    // fetches — each charges the counter, the 11th trips it.
    const symbols = Array.from({ length: 11 }, (_, i) => `RLTEST${i}`);
    const ids: string[] = [];
    for (const s of symbols) ids.push(await seedInstrument(s));
    const app = await buildApp(fix, symbols);

    const statuses: number[] = [];
    for (const id of ids) {
      const res = await app.request(`/investments/price/${id}`, {
        method: "POST",
      });
      statuses.push(res.status);
    }
    // First 10 succeed (200); the 11th is rate-limited (429).
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("Stocks type (Phase 13, D-10/D-11)", () => {
  const post = (app: Awaited<ReturnType<typeof buildApp>>, uiType: string) =>
    app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `S-${uiType}`,
        holdingType: "equities",
        uiType,
        quantity: "1",
        buyPriceCents: 10000,
        buyCurrency: "EUR",
        currentPriceCents: 12000,
        currentPriceCurrency: "EUR",
      }),
    });
  const storedUiType = async (fix: Fixture, id: string) => {
    const pool = new Pool({ connectionString: DB_APP });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
        `{"${fix.tenantId}"}`,
      ]);
      const r = await c.query<{ ui_type: string }>(
        `SELECT ui_type FROM budgeting.investments WHERE id = $1`,
        [id],
      );
      await c.query("COMMIT");
      return r.rows[0]?.ui_type;
    } finally {
      c.release();
      await pool.end();
    }
  };

  it("POST uiType stocks stores stocks", async () => {
    const fix = await createFixture("EUR");
    const app = await buildApp(fix);
    const res = await post(app, "stocks");
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await storedUiType(fix, id)).toBe("stocks");
  });

  it("a stale client's legacy 'equity' is stored as stocks", async () => {
    const fix = await createFixture("EUR");
    const app = await buildApp(fix);
    const res = await post(app, "equity");
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(await storedUiType(fix, id)).toBe("stocks");
  });

  it("GET carries typeWeights and no custom-group fields", async () => {
    const fix = await createFixture("EUR");
    const app = await buildApp(fix);
    await post(app, "stocks");
    const body = (await (await app.request("/investments")).json()) as any;
    expect(body.typeWeights).toEqual({ stocks: 100 });
    // 13-12: custom-group compat fields are gone.
    expect(body.groupWeights).toBeUndefined();
    expect("group" in body.holdings[0]).toBe(false);
  });
});
