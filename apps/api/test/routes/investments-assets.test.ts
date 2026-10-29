/**
 * investments-assets.test.ts — Phase 13.1 asset routes, real Postgres.
 *
 * POST / joins an existing same-name asset (D-01/D-02/D-17), POST /:id/buy
 * books Swap → Buy (D-08), PATCH /:id is the slim Edit (D-06/D-07; CR-01:
 * never quantity or cost), GET /names feeds the autocomplete (hidden
 * included). Bad ids are 404, bad cents 422 (D-32 WR-01/WR-02).
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
       VALUES ($1, $2, 'Assets131', true, now(), now())`,
      [userId, `assets131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Assets131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `assets131-${tenantId.slice(0, 8)}`, currency, userId],
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

async function buildApp(fix: Fixture) {
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

const json = (app: Hono, path: string, method: string, body?: unknown) =>
  app.request(`/investments${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const coin = (over: Record<string, unknown> = {}) => ({
  name: "MyCoin",
  holdingType: "crypto",
  uiType: "crypto",
  quantity: "1",
  buyPriceCents: "10000",
  buyCurrency: "PLN",
  openedOn: "2026-10-01",
  ...over,
});
const row = async (fix: Fixture, id: string) =>
  (
    await q<{
      quantity: string;
      buy: string;
      cur: string | null;
      name: string;
      archived: boolean;
    }>(
      fix,
      `SELECT quantity::text, buy_price_cents::text AS buy, current_price_cents::numeric::text AS cur,
              name, archived_at IS NOT NULL AS archived
         FROM budgeting.investments WHERE id = $1`,
      [id],
    )
  )[0];
const entryCount = async (fix: Fixture, id: string) =>
  (
    await q(
      fix,
      `SELECT 1 FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL`,
      [id],
    )
  ).length;

describe("Investment assets", () => {
  it("adding the same name twice joins one asset (DCA)", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = (await (await json(app, "", "POST", coin())).json()) as {
      id: string;
      joined: boolean;
    };
    const res = await json(
      app,
      "",
      "POST",
      coin({ name: " mycoin ", quantity: "2", openedOn: "2026-10-02" }),
    );
    expect(res.status).toBe(201);
    const b = (await res.json()) as { id: string; joined: boolean };
    expect(a.joined).toBe(false);
    expect(b).toMatchObject({ id: a.id, joined: true });
    expect(Number((await row(fix, a.id))!.quantity)).toBe(3);
    expect(await entryCount(fix, a.id)).toBe(2);
  });

  it("Swap → Buy books a quantity buy and refuses a date before the latest entry", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const { id } = (await (await json(app, "", "POST", coin())).json()) as {
      id: string;
    };
    const ok = await json(app, `/${id}/buy`, "POST", {
      kind: "quantity",
      quantity: "1",
      priceCents: "20000",
      currency: "PLN",
      effectiveDate: "2026-10-05",
    });
    expect(ok.status).toBe(201);
    expect(Number((await row(fix, id))!.quantity)).toBe(2);
    expect((await row(fix, id))!.buy).toBe("15000");
    const early = await json(app, `/${id}/buy`, "POST", {
      kind: "quantity",
      quantity: "1",
      priceCents: "1",
      currency: "PLN",
      effectiveDate: "2026-10-04",
    });
    expect(early.status).toBe(422);
    expect(await early.json()).toEqual({ error: "before_latest_entry" });
  });

  it("broker add books the deposit and sets the value after", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const id = await seed(fix, {
      name: "IKE",
      uiType: "broker",
      holdingType: "other",
      buyPriceCents: 10_000_000n,
      currentPriceCents: 12_000_000n,
    });
    const res = await json(app, `/${id}/buy`, "POST", {
      kind: "broker",
      amountCents: "1000000",
      valueAfterCents: "13325000",
      effectiveDate: "2026-10-05",
    });
    expect(res.status).toBe(201);
    const r = (await row(fix, id))!;
    expect(r.buy).toBe("11000000");
    expect(Number(r.cur)).toBe(13_325_000);
    const [e] = await q<{ flow: string; value: string }>(
      fix,
      `SELECT flow_cents::text AS flow, value_delta_cents::text AS value FROM budgeting.investment_history WHERE holding_id = $1`,
      [id],
    );
    expect(e).toEqual({ flow: "1000000", value: "1325000" });
  });

  it("a deposit cannot be bought into", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const id = await seed(fix, {
      name: "Bank",
      uiType: "deposit",
      holdingType: "deposit",
    });
    const res = await json(app, `/${id}/buy`, "POST", {
      kind: "amount",
      amountCents: "100",
      currency: "PLN",
      effectiveDate: "2026-10-05",
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "deposit_not_allowed" });
  });

  // Round-5 gap 1: a deposit's opening entry sits on its start date.
  it("a new deposit's opening entry is dated on its start date", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const res = await json(app, "", "POST", {
      name: "Bank",
      holdingType: "deposit",
      uiType: "deposit",
      quantity: "1",
      buyPriceCents: "100000",
      buyCurrency: "PLN",
      depositRateBps: 500,
      depositStartDate: "2026-03-01",
      depositCapFrequency: "monthly",
      openedOn: "2026-10-01",
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const rows = await q<{ kind: string; d: string }>(
      fix,
      `SELECT kind, effective_date::text AS d FROM budgeting.investment_history
        WHERE holding_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    expect(rows).toEqual([{ kind: "add", d: "2026-03-01" }]);
  });

  it("Edit refuses ledger fields and leaves quantity and cost alone (CR-01)", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const id = await seed(fix, { name: "Pot", quantity: "1" });
    expect((await json(app, `/${id}`, "PATCH", { quantity: "2" })).status).toBe(
      422,
    );
    const res = await json(app, `/${id}`, "PATCH", { name: "Pot renamed" });
    expect(res.status).toBe(200);
    expect(await row(fix, id)).toMatchObject({
      name: "Pot renamed",
      quantity: "1.00000000",
      buy: "1000000",
    });
  });

  it("Edit refuses a label already used in the type", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    await seed(fix, { name: "Pot" });
    const id = await seed(fix, { name: "Other" });
    const res = await json(app, `/${id}`, "PATCH", { name: " POT " });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "label_taken" });
  });

  it("a new hand value books a Value updated entry", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const id = await seed(fix, { name: "Pot" });
    expect(
      (await json(app, `/${id}`, "PATCH", { currentValueCents: "1300000" }))
        .status,
    ).toBe(200);
    const kinds = await q<{ kind: string }>(
      fix,
      `SELECT kind FROM budgeting.investment_history WHERE holding_id = $1`,
      [id],
    );
    expect(kinds.map((k) => k.kind)).toEqual(["value_change"]);
    expect(Number((await row(fix, id))!.cur)).toBe(1_300_000);
  });

  it("GET /names lists the type's assets, hidden ones included", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const { id } = (await (await json(app, "", "POST", coin())).json()) as {
      id: string;
    };
    await q(
      fix,
      `UPDATE budgeting.investments SET archived_at = now() WHERE id = $1`,
      [id],
    );
    const res = await app.request("/investments/names?type=crypto");
    expect(res.status).toBe(200);
    const { names } = (await res.json()) as {
      names: Array<{ id: string; archived: boolean }>;
    };
    expect(names).toEqual([
      expect.objectContaining({ id, archived: true, name: "MyCoin" }),
    ]);
    expect((await app.request("/investments/names?type=nope")).status).toBe(
      422,
    );
  });

  it("a malformed id is 404 and malformed cents are 422", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const bad = await json(app, "/not-a-uuid/buy", "POST", {
      kind: "amount",
      amountCents: "1",
      currency: "PLN",
      effectiveDate: "2026-10-05",
    });
    expect(bad.status).toBe(404);
    const id = await seed(fix, { name: "Pot" });
    const cents = await json(app, `/${id}/buy`, "POST", {
      kind: "amount",
      amountCents: "12.5",
      currency: "PLN",
      effectiveDate: "2026-10-05",
    });
    expect(cents.status).toBe(422);
  });

  it("another tenant's asset is 404 and nothing is written", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const foreign = await seed(b, { name: "Theirs" });
    const app = await buildApp(a);
    const res = await json(app, `/${foreign}/buy`, "POST", {
      kind: "amount",
      amountCents: "100",
      currency: "PLN",
      effectiveDate: "2026-10-05",
    });
    expect(res.status).toBe(404);
    expect(await entryCount(b, foreign)).toBe(0);
  });
});
