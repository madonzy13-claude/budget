/**
 * investments-transfer.test.ts — Swap → Transfer route (13.1 D-10), real
 * Postgres. Not a sale: contributions and realized stay put; both assets'
 * newest-entry dates gate the move (D-15).
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
       VALUES ($1, $2, 'Xfer131', true, now(), now())`,
      [userId, `xfer131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Xfer131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `xfer131-${tenantId.slice(0, 8)}`, currency, userId],
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

const xfer = (app: Hono, id: string, body: Record<string, unknown>) =>
  app.request(`/investments/${id}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ effectiveDate: "2026-10-24", ...body }),
  });
const flowSum = async (fix: Fixture) =>
  (
    await q<{ s: string }>(
      fix,
      `SELECT COALESCE(sum(flow_cents),0)::text AS s FROM budgeting.investment_history WHERE budget_id = $1 AND deleted_at IS NULL`,
      [fix.tenantId],
    )
  )[0]!.s;
const realized = async (fix: Fixture) =>
  (
    await q<{ s: string }>(
      fix,
      `SELECT COALESCE(sum(realized_budget_cents),0)::text AS s FROM budgeting.investment_history WHERE budget_id = $1 AND deleted_at IS NULL`,
      [fix.tenantId],
    )
  )[0]!.s;
const coin = (fix: Fixture, name: string) =>
  seed(fix, {
    name,
    uiType: "collectibles",
    holdingType: "other",
    quantity: "4",
    buyPriceCents: 2_500n,
    currentPriceCents: 3_000n,
  });

describe("Transfer route", () => {
  it("moves quantity between same-type assets as linked flow-0 legs", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = await coin(fix, "Coins A");
    const b = await coin(fix, "Coins B");
    const flow0 = await flowSum(fix);
    const realized0 = await realized(fix);
    const res = await xfer(app, a, {
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: b },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      transferId: string;
      newHoldingId: string | null;
    };
    expect(body.transferId).toBeTruthy();
    expect(body.newHoldingId).toBeNull();
    const rows = await q<{ kind: string; holding_id: string; t: string }>(
      fix,
      `SELECT kind, holding_id::text, transfer_id::text AS t FROM budgeting.investment_history
        WHERE budget_id = $1 AND kind IN ('transfer_out','transfer_in') ORDER BY kind DESC`,
      [fix.tenantId],
    );
    expect(rows).toEqual([
      { kind: "transfer_out", holding_id: a, t: body.transferId },
      { kind: "transfer_in", holding_id: b, t: body.transferId },
    ]);
    expect(await flowSum(fix)).toBe(flow0);
    expect(await realized(fix)).toBe(realized0);
  });

  it("to a new label creates the asset", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = await coin(fix, "Coins A");
    const res = await xfer(app, a, {
      move: { quantity: "4" },
      to: { kind: "new", name: "Vault" },
    });
    expect(res.status).toBe(201);
    const { newHoldingId } = (await res.json()) as { newHoldingId: string };
    const [n] = await q<{ name: string; quantity: string }>(
      fix,
      `SELECT name, quantity::text FROM budgeting.investments WHERE id = $1`,
      [newHoldingId],
    );
    expect(n).toEqual({ name: "Vault", quantity: "4.00000000" });
    const [src] = await q<{ archived: boolean }>(
      fix,
      `SELECT archived_at IS NOT NULL AS archived FROM budgeting.investments WHERE id = $1`,
      [a],
    );
    expect(src!.archived).toBe(true);
  });

  it("a date before either asset's newest entry is 422", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = await coin(fix, "Coins A");
    const b = await coin(fix, "Coins B");
    await q(
      fix,
      `INSERT INTO budgeting.investment_history (tenant_id, budget_id, holding_id, kind, effective_date) VALUES ($1, $1, $2, 'add', '2026-10-25')`,
      [fix.tenantId, b],
    );
    const res = await xfer(app, a, {
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: b },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "before_latest_entry" });
  });

  it("a malformed id is 404; another tenant's destination is 404 and nothing is written", async () => {
    const fix = await createFixture();
    const other = await createFixture();
    const app = await buildApp(fix);
    const a = await coin(fix, "Coins A");
    const theirs = await coin(other, "Theirs");
    expect(
      (
        await xfer(app, "nope", {
          move: { quantity: "1" },
          to: { kind: "new", name: "X" },
        })
      ).status,
    ).toBe(404);
    const res = await xfer(app, a, {
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: theirs },
    });
    expect(res.status).toBe(404);
    expect(
      await q(
        fix,
        `SELECT 1 FROM budgeting.investment_history WHERE budget_id = $1 AND kind LIKE 'transfer%'`,
        [fix.tenantId],
      ),
    ).toHaveLength(0);
  });

  it("a different type is 422 transfer_type_mismatch", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const a = await coin(fix, "Coins A");
    const cash = await seed(fix, { name: "Cash" });
    const res = await xfer(app, a, {
      move: { quantity: "1" },
      to: { kind: "existing", holdingId: cash },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "transfer_type_mismatch" });
  });
});
