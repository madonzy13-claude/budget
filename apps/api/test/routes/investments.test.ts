/**
 * investments.test.ts — Investments route integration tests (Plan 09-06).
 * Real Postgres (DATABASE_URL_APP / _WORKER). Un-skipped from the 09-05 scaffold.
 * Covers INV-03 round-trip, cross-tenant RLS, and INV-14 on-add rate limit.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_APP_RAW = process.env.DATABASE_URL_APP;
const DB_WORKER_RAW = process.env.DATABASE_URL_WORKER;
if (!DB_APP_RAW || !DB_WORKER_RAW)
  throw new Error("DATABASE_URL_APP and _WORKER required for integration tests");
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

async function buildApp(fix: Fixture, priceSymbol?: string) {
  const { createInvestmentsModule } = await import(
    "@budget/investments/src/contracts/factory"
  );
  const { DrizzleHoldingRepo } = await import(
    "@budget/investments/src/adapters/persistence/holding-repo"
  );
  const { DrizzleInstrumentRepo } = await import(
    "@budget/investments/src/adapters/persistence/instrument-repo"
  );
  const { DrizzlePriceCacheRepo } = await import(
    "@budget/investments/src/adapters/persistence/price-cache-repo"
  );
  const { InMemoryPriceProvider } = await import(
    "@budget/investments/src/ports/price-provider"
  );
  const { appPool } = await import("@budget/platform");
  const { createInvestmentsRoute } = await import("../../src/routes/investments");

  const fxProvider = {
    rateAsOf: async () => ({ rate: "1", provider: "stub", isStale: false }),
  } as never;
  const priceProvider = new InMemoryPriceProvider(
    priceSymbol ? { [priceSymbol]: { price: "100.00", currency: "USD" } } : {},
  );

  const investments = createInvestmentsModule({
    pool: appPool(),
    fxProvider,
    holdingRepo: new DrizzleHoldingRepo(),
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

  it("the 11th on-add instant price fetch within a minute is rate-limited (INV-14)", async () => {
    const fix = await createFixture("EUR");
    const instrumentId = await seedInstrument("RLTEST");
    const app = await buildApp(fix, "RLTEST");

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.request(`/investments/price/${instrumentId}`, {
        method: "POST",
      });
      statuses.push(res.status);
    }
    // First 10 succeed (200); the 11th is rate-limited (429).
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
