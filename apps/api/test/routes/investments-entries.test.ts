/**
 * investments-entries.test.ts — the L3 ledger routes (13.1 D-12..D-19, D-21,
 * D-37), real Postgres: GET /:id/entries and the newest-only
 * DELETE /entries/:entryId.
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
       VALUES ($1, $2, 'Entries131', true, now(), now())`,
      [userId, `entries131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Entries131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `entries131-${tenantId.slice(0, 8)}`, currency, userId],
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

async function wallet(
  fix: Fixture,
  type = "SPENDINGS",
  currency = "PLN",
  archived = false,
) {
  const id = crypto.randomUUID();
  await q(
    fix,
    `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order, archived_at)
     VALUES ($1, $2, 'Bank', $3, $4, 100, now(), $5, 1, CASE WHEN $6 THEN now() END)`,
    [id, fix.tenantId, type, currency, fix.userId, archived],
  );
  return id;
}
const call = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/investments${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const entriesOf = async (app: Hono, id: string) =>
  ((await (await call(app, "GET", `/${id}/entries`)).json()) as { entries: Array<Record<string, unknown>> }).entries;
const buy = (app: Hono, id: string, date: string) =>
  call(app, "POST", `/${id}/buy`, { kind: "amount", amountCents: "1000", currency: "PLN", effectiveDate: date });
const startEntry = (fix: Fixture, id: string) =>
  q(fix, `INSERT INTO budgeting.investment_history (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency, cost_delta_cents, flow_cents, flow_currency)
          VALUES ($1, $1, $2, 'start', '2026-09-01', 1000000, 'PLN', 1000000, 1000000, 'PLN')`, [fix.tenantId, id]);

describe("Investment entries ledger", () => {
  it("lists entries newest first with only the newest deletable", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    await startEntry(fix, h);
    await buy(app, h, "2026-10-01");
    const res = await call(app, "GET", `/${h}/entries`);
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as { entries: Array<Record<string, unknown>> };
    expect(entries.map((e) => [e.kind, e.deletable, e.blockedReason])).toEqual([
      ["add", true, null],
      ["start", false, "not_newest"],
    ]);
    expect(entries[0]).toMatchObject({ amountCents: "1000", amountCurrency: "PLN", isLastEntry: false });
  });

  it("deletes the newest entry and restores the asset; an older one is 409 not_newest", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    await startEntry(fix, h);
    await buy(app, h, "2026-10-01");
    const [newest, older] = await entriesOf(app, h);
    const refused = await call(app, "DELETE", `/entries/${older!.id}`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "not_newest" });
    const res = await call(app, "DELETE", `/entries/${newest!.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wipedHoldingId: null, walletId: null });
    const [row] = await q<{ buy: string }>(fix, `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`, [h]);
    expect(row!.buy).toBe("1000000");
  });

  it("a linked leg is 409 linked_not_newest while the other asset has a later entry", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = await seed(fix, { name: "A" });
    const b = await seed(fix, { name: "B" });
    await startEntry(fix, a);
    await startEntry(fix, b);
    expect(
      (
        await call(app, "POST", `/${a}/sell`, {
          effectiveDate: "2026-10-01",
          left: { valueCents: "500000" },
          destination: { kind: "existing", holdingId: b },
          receivedCents: "500000",
          receivedCurrency: "PLN",
        })
      ).status,
    ).toBe(201);
    await buy(app, b, "2026-10-02");
    const [leg] = await entriesOf(app, a);
    const res = await call(app, "DELETE", `/entries/${leg!.id}`);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "linked_not_newest" });
  });

  it("deleting the only entry wipes the asset", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    await startEntry(fix, h);
    const [only] = await entriesOf(app, h);
    expect(only).toMatchObject({ isLastEntry: true, deletable: true });
    const res = await call(app, "DELETE", `/entries/${only!.id}`);
    expect(await res.json()).toMatchObject({ wipedHoldingId: h });
    expect(await q(fix, `SELECT 1 FROM budgeting.investments WHERE id = $1`, [h])).toHaveLength(0);
  });

  it("deleting a sale into a RESERVE / CUSHION wallet takes the money back and recomputes that task", async () => {
    for (const [type, reserve, cushion] of [["RESERVE", 1, 0], ["CUSHION", 0, 1]] as const) {
      const fix = await createFixture();
      const spies = { reserve: [] as unknown[], cushion: [] as unknown[] };
      const app = await buildApp(fix, spies);
      const h = await seed(fix);
      await startEntry(fix, h);
      const w = crypto.randomUUID();
      await q(fix, `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
                    VALUES ($1, $2, 'W', $3, 'PLN', 100, now(), $4, 1)`, [w, fix.tenantId, type, fix.userId]);
      await call(app, "POST", `/${h}/sell`, {
        effectiveDate: "2026-10-01",
        left: { valueCents: "500000" },
        destination: { kind: "out", wallet: { kind: "existing", walletId: w } },
        receivedCents: "500000",
        receivedCurrency: "PLN",
      });
      spies.reserve.length = 0;
      spies.cushion.length = 0;
      const [sale] = await entriesOf(app, h);
      expect(sale).toMatchObject({ kind: "withdraw", walletName: "W" });
      const res = await call(app, "DELETE", `/entries/${sale!.id}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ wipedHoldingId: null, walletId: w });
      const [bal] = await q<{ b: string }>(fix, `SELECT current_balance::text AS b FROM budgeting.wallets WHERE id = $1`, [w]);
      expect(bal!.b).toBe("100.0000");
      expect([spies.reserve.length, spies.cushion.length]).toEqual([reserve, cushion]);
    }
  });

  it("a malformed id is 404; another tenant's entry is 404 and nothing changes", async () => {
    const fix = await createFixture();
    const other = await createFixture();
    const app = await buildApp(fix);
    expect((await call(app, "DELETE", "/entries/nope")).status).toBe(404);
    expect((await call(app, "GET", "/nope/entries")).status).toBe(404);
    const theirs = await seed(other, { name: "Theirs" });
    await startEntry(other, theirs);
    const [id] = await q<{ id: string }>(other, `SELECT id::text FROM budgeting.investment_history WHERE holding_id = $1`, [theirs]);
    expect((await call(app, "DELETE", `/entries/${id!.id}`)).status).toBe(404);
    expect(await q(other, `SELECT 1 FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL`, [theirs])).toHaveLength(1);
  });
});
