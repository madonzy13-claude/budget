/**
 * investments-sell-wallet.test.ts — Sell → Out of investments into a wallet
 * (13.1 D-20..D-25, D-37), real Postgres.
 *
 * The credit is a delta inside the sale's transaction: a currency mismatch or a
 * wallet the tenant cannot see rolls the whole sale back. RESERVE / CUSHION
 * targets fire their task recompute after commit. It is never income.
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
const { entry } = await import("@budget/investments/src/ports/history-repo");
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
       VALUES ($1, $2, 'SellW131', true, now(), now())`,
      [userId, `sellw131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'SellW131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `sellw131-${tenantId.slice(0, 8)}`, currency, userId],
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

async function buildApp(fix: Fixture, spies = { reserve: [] as unknown[], cushion: [] as unknown[] }) {
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
      recomputeCushionTaskRunner: async (i: unknown) => void spies.cushion.push(i),
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


async function wallet(fix: Fixture, type = "SPENDINGS", currency = "PLN", archived = false) {
  const id = crypto.randomUUID();
  await q(
    fix,
    `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order, archived_at)
     VALUES ($1, $2, 'Bank', $3, $4, 100, now(), $5, 1, CASE WHEN $6 THEN now() END)`,
    [id, fix.tenantId, type, currency, fix.userId, archived],
  );
  return id;
}
const balance = async (fix: Fixture, id: string) =>
  (await q<{ b: string }>(fix, `SELECT current_balance::text AS b FROM budgeting.wallets WHERE id = $1`, [id]))[0]?.b;
const history = async (fix: Fixture) =>
  q<{ kind: string; wallet_id: string | null; wd: string | null; flow: string }>(
    fix,
    `SELECT kind, wallet_id::text, wallet_delta_numeric::text AS wd, flow_cents::text AS flow
       FROM budgeting.investment_history WHERE budget_id = $1 AND kind = 'withdraw'`,
    [fix.tenantId],
  );
const sellOut = (app: Hono, id: string, wallet: unknown, receivedCents = "1234500", receivedCurrency = "PLN") =>
  app.request(`/investments/${id}/sell`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      effectiveDate: "2026-10-24",
      left: { valueCents: "0" },
      destination: { kind: "out", ...(wallet ? { wallet } : {}) },
      receivedCents,
      receivedCurrency,
    }),
  });

describe("Sell to wallet", () => {
  it("credits an existing wallet by exactly the received amount and links it", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const w = await wallet(fix);
    const res = await sellOut(app, h, { kind: "existing", walletId: w });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { walletId: string }).walletId).toBe(w);
    expect(await balance(fix, w)).toBe("12445.0000");
    expect(await history(fix)).toEqual([{ kind: "withdraw", wallet_id: w, wd: "12345.0000", flow: "-1234500" }]);
  });

  it("a wallet in another currency rolls the whole sale back", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const w = await wallet(fix, "SPENDINGS", "EUR");
    const res = await sellOut(app, h, { kind: "existing", walletId: w });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "wallet_currency_mismatch" });
    expect(await history(fix)).toHaveLength(0);
    expect(await balance(fix, w)).toBe("100.0000");
    const [row] = await q<{ archived: boolean }>(fix, `SELECT archived_at IS NOT NULL AS archived FROM budgeting.investments WHERE id = $1`, [h]);
    expect(row!.archived).toBe(false);
  });

  it("another tenant's wallet or an archived wallet is 404 and nothing moves", async () => {
    const fix = await createFixture();
    const other = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const foreign = await wallet(other);
    const archived = await wallet(fix, "SPENDINGS", "PLN", true);
    for (const w of [foreign, archived]) {
      const res = await sellOut(app, h, { kind: "existing", walletId: w });
      expect(res.status).toBe(404);
    }
    expect(await balance(other, foreign)).toBe("100.0000");
    expect(await history(fix)).toHaveLength(0);
  });

  it("a new wallet starts with the amount", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const res = await sellOut(app, h, { kind: "new", name: "From cash", walletType: "OTHER", currency: "PLN" });
    expect(res.status).toBe(201);
    const { walletId } = (await res.json()) as { walletId: string };
    const [w] = await q<{ name: string; wallet_type: string; b: string }>(
      fix,
      `SELECT name, wallet_type, current_balance::text AS b FROM budgeting.wallets WHERE id = $1`,
      [walletId],
    );
    expect(w).toEqual({ name: "From cash", wallet_type: "OTHER", b: "12345.0000" });
  });

  it("RESERVE and CUSHION targets recompute their task; others do not", async () => {
    for (const [type, reserve, cushion] of [
      ["RESERVE", 1, 0],
      ["CUSHION", 0, 1],
      ["SPENDINGS", 0, 0],
      ["POSSESSION", 0, 0],
    ] as const) {
      const fix = await createFixture();
      const spies = { reserve: [] as unknown[], cushion: [] as unknown[] };
      const app = await buildApp(fix, spies);
      const h = await seed(fix);
      const w = await wallet(fix, type);
      expect((await sellOut(app, h, { kind: "existing", walletId: w })).status).toBe(201);
      expect([spies.reserve.length, spies.cushion.length]).toEqual([reserve, cushion]);
      if (reserve) expect(spies.reserve[0]).toMatchObject({ tenantId: fix.tenantId, budgetId: fix.tenantId });
    }
  });

  it("is not income: contributions fall by the amount and no income row is written", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const w = await wallet(fix);
    await sellOut(app, h, { kind: "existing", walletId: w });
    const flows = await q<{ s: string }>(fix, `SELECT COALESCE(sum(flow_cents),0)::text AS s FROM budgeting.investment_history WHERE budget_id = $1`, [fix.tenantId]);
    expect(flows[0]!.s).toBe("-1234500");
    expect(await q(fix, `SELECT 1 FROM budgeting.incomes WHERE tenant_id = $1`, [fix.tenantId])).toHaveLength(0);
  });

  it("zero / negative received and a malformed wallet id are 422", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    expect((await sellOut(app, h, null, "0")).status).toBe(422);
    expect((await sellOut(app, h, null, "-5")).status).toBe(422);
    expect((await sellOut(app, h, { kind: "existing", walletId: "nope" })).status).toBe(422);
    expect((await app.request("/investments/nope/sell", { method: "POST", body: "{}" })).status).toBe(404);
  });
});
