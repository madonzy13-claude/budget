/**
 * investments-history.test.ts — Phase 13 history ledger, real Postgres.
 *
 * "History repo": the booking writer is atomic and tenant-scoped.
 * "Sell route": POST /investments/:id/sell books new / existing / out, partial
 * and complete, deposits partially (D-20), and refuses cross-tenant ids.
 * "Create entry": POST / writes the holding's first dated history entry.
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
       VALUES ($1, $2, 'Hist13 Test', true, now(), now())`,
      [userId, `hist13-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Hist13 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `hist13-${tenantId.slice(0, 8)}`, currency, userId],
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

describe("History repo", () => {
  it("commits a new holding and two transfer legs sharing one transfer id", async () => {
    const fix = await createFixture();
    const src = await seed(fix, {
      name: "Broker",
      uiType: "broker",
      holdingType: "other",
    });
    const r = await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [
        { id: src, buyPriceCents: 500_000n, currentPriceCents: 500_000n },
      ],
      newHolding: nh({ name: "Erste" }),
      entries: [
        entry({
          holdingRef: src,
          kind: "convert_out",
          effectiveDate: "2026-10-24",
          transfer: true,
        }),
        entry({
          holdingRef: "$new",
          kind: "convert_in",
          effectiveDate: "2026-10-24",
          transfer: true,
        }),
      ],
    });
    expect(r.newHoldingId).not.toBeNull();
    expect(r.transferId).not.toBeNull();
    const rows = await q<{ transfer_id: string; holding_id: string }>(
      fix,
      `SELECT transfer_id::text, holding_id::text FROM budgeting.investment_history
        WHERE budget_id = $1 ORDER BY kind`,
      [fix.tenantId],
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((x) => x.transfer_id))).toEqual(
      new Set([r.transferId!]),
    );
    expect(rows.map((x) => x.holding_id).sort()).toEqual(
      [src, r.newHoldingId!].sort(),
    );
    const [patched] = await q<{ buy: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`,
      [src],
    );
    expect(patched!.buy).toBe("500000");
  });

  it("a patch on another tenant's holding throws not_found and writes nothing", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const foreign = await seed(b);
    await expect(
      historyRepo.commit(a.tenantId, a.userId, {
        budgetId: a.tenantId,
        patches: [{ id: foreign, buyPriceCents: 1n }],
        newHolding: nh({ name: "Should vanish" }),
        entries: [
          entry({
            holdingRef: "$new",
            kind: "add",
            effectiveDate: "2026-10-24",
          }),
        ],
      }),
    ).rejects.toThrow("not_found");
    expect(
      await q(a, `SELECT 1 FROM budgeting.investments WHERE budget_id = $1`, [
        a.tenantId,
      ]),
    ).toHaveLength(0);
    const [still] = await q<{ buy: string }>(
      b,
      `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`,
      [foreign],
    );
    expect(still!.buy).toBe("1000000");
  });

  it("listFlows skips deleted entries", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      entries: [
        entry({
          holdingRef: h,
          kind: "add",
          effectiveDate: "2026-01-01",
          flowCents: 100n,
          flowCurrency: "PLN",
        }),
        entry({
          holdingRef: h,
          kind: "add",
          effectiveDate: "2026-02-01",
          flowCents: 200n,
          flowCurrency: "PLN",
        }),
      ],
    });
    await q(
      fix,
      `UPDATE budgeting.investment_history SET deleted_at = now()
        WHERE budget_id = $1 AND effective_date = '2026-02-01'`,
      [fix.tenantId],
    );
    const flows = await historyRepo.listFlows(fix.tenantId, fix.tenantId);
    expect(flows.map((f) => f.flowCents)).toEqual([100n]);
  });
});

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

const sell = (app: Hono, id: string, body: Record<string, unknown>) =>
  app.request(`/investments/${id}/sell`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      effectiveDate: "2026-10-24",
      receivedCurrency: "PLN",
      ...body,
    }),
  });

const flowSum = async (fix: Fixture) =>
  BigInt(
    (
      await q<{ s: string }>(
        fix,
        `SELECT COALESCE(sum(flow_cents), 0)::text AS s FROM budgeting.investment_history
          WHERE budget_id = $1 AND deleted_at IS NULL`,
        [fix.tenantId],
      )
    )[0]!.s,
  );

describe("Sell route", () => {
  it("out of investments, partial: source updated, one withdraw row", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await seed(fix, {
      name: "Broker",
      uiType: "broker",
      holdingType: "other",
      buyPriceCents: 5_500_000n,
      currentPriceCents: 9_600_000n,
    });
    const res = await sell(app, b, {
      left: { valueCents: "3000000" },
      destination: { kind: "out" },
      receivedCents: "6600000",
    });
    expect(res.status).toBe(201);
    const [h] = await q<{ buy: string; cur: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy, current_price_cents::bigint::text AS cur
         FROM budgeting.investments WHERE id = $1`,
      [b],
    );
    expect(h).toEqual({ buy: "1718750", cur: "3000000" });
    const rows = await q<{
      kind: string;
      vd: string;
      flow: string;
      realized: string;
    }>(
      fix,
      `SELECT kind, value_delta_cents::text AS vd, flow_cents::text AS flow,
              realized_budget_cents::text AS realized
         FROM budgeting.investment_history WHERE holding_id = $1`,
      [b],
    );
    expect(rows).toEqual([
      {
        kind: "withdraw",
        vd: "-6600000",
        flow: "-6600000",
        realized: "2818750",
      },
    ]);
  });

  it("into a new holding: pair shares a transfer id, contributions unchanged", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await seed(fix, {
      name: "Broker",
      uiType: "broker",
      holdingType: "other",
      buyPriceCents: 5_500_000n,
      currentPriceCents: 9_600_000n,
    });
    const before = await flowSum(fix);
    const res = await sell(app, b, {
      left: { valueCents: "0" },
      destination: {
        kind: "new",
        holding: { name: "Erste", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "9600000",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      archived: boolean;
      newHoldingId: string;
    };
    expect(body.archived).toBe(false); // round 4: no auto-archive
    const legs = await q<{ transfer_id: string }>(
      fix,
      `SELECT transfer_id::text FROM budgeting.investment_history
        WHERE budget_id = $1 AND kind IN ('convert_out','convert_in')`,
      [fix.tenantId],
    );
    expect(legs).toHaveLength(2);
    expect(legs[0]!.transfer_id).toBe(legs[1]!.transfer_id);
    expect(await flowSum(fix)).toBe(before);
    const [n] = await q<{ buy: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`,
      [body.newHoldingId],
    );
    expect(n!.buy).toBe("9600000");
  });

  it("partial deposit: remainder restarts; prior principal + start kept for undo", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const d = await seed(fix, {
      name: "Lokata",
      uiType: "deposit",
      holdingType: "deposit",
      buyPriceCents: 1_000_000n,
      currentPriceCents: null,
      depositRateBps: 500,
      depositStartDate: "2025-10-24",
      depositCapFrequency: "yearly",
    });
    const res = await sell(app, d, {
      left: { valueCents: "650000" },
      destination: { kind: "out" },
      receivedCents: "400000",
    });
    expect(res.status).toBe(201);
    const [h] = await q<{ buy: string; start: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy, deposit_start_date::text AS start
         FROM budgeting.investments WHERE id = $1`,
      [d],
    );
    expect(h).toEqual({ buy: "650000", start: "2026-10-24" });
    const [e] = await q<{ pp: string; ps: string; realized: string }>(
      fix,
      `SELECT prior_principal_cents::text AS pp, prior_start_date::text AS ps,
              realized_budget_cents::text AS realized
         FROM budgeting.investment_history WHERE holding_id = $1 AND kind = 'withdraw'`,
      [d],
    );
    expect(e).toEqual({ pp: "1000000", ps: "2025-10-24", realized: "50000" });
  });

  it("another tenant's destination or source → 404 and nothing written", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const app = await buildApp(a);
    const mine = await seed(a, { name: "Mine" });
    const theirs = await seed(b, { name: "Theirs" });
    const r1 = await sell(app, mine, {
      left: { valueCents: "0" },
      destination: { kind: "existing", holdingId: theirs },
      receivedCents: "1000000",
    });
    expect(r1.status).toBe(404);
    const r2 = await sell(app, theirs, {
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "1000000",
    });
    expect(r2.status).toBe(404);
    expect(
      await q(
        a,
        `SELECT 1 FROM budgeting.investment_history WHERE budget_id = $1`,
        [a.tenantId],
      ),
    ).toHaveLength(0);
    expect(
      await q(
        b,
        `SELECT 1 FROM budgeting.investment_history WHERE budget_id = $1`,
        [b.tenantId],
      ),
    ).toHaveLength(0);
  });

  it("rejects a future date, zero received and keep ≥ value", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    const future = new Date(Date.now() + 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(
      (
        await sell(app, h, {
          effectiveDate: future,
          left: { valueCents: "0" },
          destination: { kind: "out" },
          receivedCents: "1",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await sell(app, h, {
          left: { valueCents: "0" },
          destination: { kind: "out" },
          receivedCents: "0",
        })
      ).status,
    ).toBe(422);
    const r = await sell(app, h, {
      left: { valueCents: "1000000" },
      destination: { kind: "out" },
      receivedCents: "1",
    });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe(
      "keep_out_of_range",
    );
  });

  it("a failure mid-commit leaves no partial rows", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    await expect(
      historyRepo.commit(fix.tenantId, fix.userId, {
        budgetId: fix.tenantId,
        patches: [{ id: h, buyPriceCents: 1n }],
        entries: [
          entry({
            holdingRef: h,
            kind: "withdraw",
            effectiveDate: "2026-10-24",
          }),
          // invalid kind → CHECK violation after the patch + first row
          entry({
            holdingRef: h,
            kind: "bogus" as never,
            effectiveDate: "2026-10-24",
          }),
        ],
      }),
    ).rejects.toThrow();
    const [row] = await q<{ buy: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`,
      [h],
    );
    expect(row!.buy).toBe("1000000");
    expect(
      await q(
        fix,
        `SELECT 1 FROM budgeting.investment_history WHERE holding_id = $1`,
        [h],
      ),
    ).toHaveLength(0);
  });
});

describe("Create entry", () => {
  it("POST / with openedOn writes the first history row", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const res = await app.request("/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "BOSSA - IKE",
        holdingType: "other",
        uiType: "broker",
        quantity: "1",
        buyPriceCents: 5500000,
        buyCurrency: "PLN",
        currentPriceCents: 9600000,
        currentPriceCurrency: "PLN",
        openedOn: "2023-05-01",
      }),
    });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const rows = await q<{ kind: string; d: string; flow: string }>(
      fix,
      `SELECT kind, effective_date::text AS d, flow_cents::text AS flow
         FROM budgeting.investment_history WHERE holding_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ kind: "add", d: "2023-05-01", flow: "5500000" }]);
  });
});

const req = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/investments${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const brokerSeed = (fix: Fixture) =>
  seed(fix, {
    name: "Broker",
    uiType: "broker",
    holdingType: "other",
    buyPriceCents: 5_500_000n,
    currentPriceCents: 9_600_000n,
  });

const holdingState = async (fix: Fixture, id: string) =>
  (
    await q<{ buy: string; cur: string; qty: string; archived: boolean }>(
      fix,
      `SELECT buy_price_cents::text AS buy, current_price_cents::bigint::text AS cur,
              quantity::text AS qty, archived_at IS NOT NULL AS archived
         FROM budgeting.investments WHERE id = $1`,
      [id],
    )
  )[0];

// 13.1: every asset carries a ledger entry (D-35); seed one like 0088 did.
const startEntry = (fix: Fixture, id: string) =>
  q(
    fix,
    `INSERT INTO budgeting.investment_history (tenant_id, budget_id, holding_id, kind, effective_date)
     VALUES ($1, $1, $2, 'start', '2026-09-01')`,
    [fix.tenantId, id],
  );
const entryIds = async (app: Hono, id: string) =>
  (
    (await (await req(app, "GET", `/${id}/entries`)).json()) as {
      entries: {
        id: string | null;
        kind: string;
        counterpartyName: string | null;
        realizedBudgetCents: string | null;
      }[];
    }
  ).entries;

describe("Ledger, undo, type summary (13-08 → 13.1)", () => {
  it("the ledger lists the conversion with the other asset's name", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    await startEntry(fix, b);
    await sell(app, b, {
      left: { valueCents: "3000000" },
      destination: {
        kind: "new",
        holding: { name: "Erste", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "6600000",
    });
    expect((await entryIds(app, b))[0]).toMatchObject({
      kind: "convert_out",
      counterpartyName: "Erste",
      realizedBudgetCents: "2818750",
    });
  });

  it("deleting a convert_out undoes both legs; realized and flows go back", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    const cash = await seed(fix, { name: "Cash" });
    await startEntry(fix, b);
    await startEntry(fix, cash);
    const flowBefore = await flowSum(fix);
    await sell(app, b, {
      left: { valueCents: "3000000" },
      destination: { kind: "existing", holdingId: cash },
      receivedCents: "6600000",
    });
    const summary = async () =>
      (
        (await (await req(app, "GET", "/type-summary")).json()) as {
          types: Record<string, { realizedBudgetCents: string }>;
        }
      ).types;
    expect((await summary()).broker?.realizedBudgetCents).toBe("2818750");
    // Round-6 gap 6: the asset's own realized, the same figure.
    const holdings = (
      (await (await req(app, "GET", "/type-summary")).json()) as {
        holdings?: Record<string, { realizedBudgetCents: string }>;
      }
    ).holdings;
    expect(holdings?.[b]?.realizedBudgetCents).toBe("2818750");
    const [out] = await entryIds(app, b);
    const del = await req(app, "DELETE", `/entries/${out!.id}`);
    expect(del.status).toBe(200);
    expect(await holdingState(fix, b)).toMatchObject({
      buy: "5500000",
      cur: "9600000",
    });
    expect(await holdingState(fix, cash)).toMatchObject({
      buy: "1000000",
      cur: "1000000",
    });
    const deleted = await q(
      fix,
      `SELECT 1 FROM budgeting.investment_history WHERE budget_id = $1
          AND kind IN ('convert_out','convert_in') AND deleted_at IS NOT NULL`,
      [fix.tenantId],
    );
    expect(deleted).toHaveLength(2);
    expect((await summary()).broker).toBeUndefined();
    expect(await flowSum(fix)).toBe(flowBefore);
  });

  it("delete + re-enter through the API equals entering once", async () => {
    const state = async (twice: boolean) => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const b = await brokerSeed(fix);
      await startEntry(fix, b);
      const s = () =>
        sell(app, b, {
          left: { valueCents: "3000000" },
          destination: { kind: "out" },
          receivedCents: "6600000",
        });
      await s();
      if (twice) {
        const [row] = await entryIds(app, b);
        await req(app, "DELETE", `/entries/${row!.id}`);
        await s();
      }
      const summary = (await (
        await req(app, "GET", "/type-summary")
      ).json()) as { types: Record<string, unknown> };
      return {
        h: await holdingState(fix, b),
        flow: await flowSum(fix),
        t: summary.types,
      };
    };
    expect(await state(true)).toEqual(await state(false));
  });

  it("another tenant's entry → 404, untouched", async () => {
    const a = await createFixture();
    const b = await createFixture();
    const appA = await buildApp(a);
    const appB = await buildApp(b);
    const theirs = await brokerSeed(b);
    await startEntry(b, theirs);
    await sell(appB, theirs, {
      left: { valueCents: "3000000" },
      destination: { kind: "out" },
      receivedCents: "6600000",
    });
    const [row] = await entryIds(appB, theirs);
    expect((await req(appA, "DELETE", `/entries/${row!.id}`)).status).toBe(404);
    expect(await holdingState(b, theirs)).toMatchObject({ buy: "1718750" });
  });

  it("deleting a conversion's new destination wipes it and restores the source", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    await startEntry(fix, b);
    const res = await sell(app, b, {
      left: { valueCents: "0" },
      destination: {
        kind: "new",
        holding: { name: "Erste", holdingType: "cash_fx", uiType: "cash" },
      },
      receivedCents: "9600000",
    });
    const { newHoldingId } = (await res.json()) as { newHoldingId: string };
    const [leg] = await entryIds(app, newHoldingId);
    expect((await req(app, "DELETE", `/entries/${leg!.id}`)).status).toBe(200);
    expect(await holdingState(fix, newHoldingId)).toBeUndefined();
    expect(await holdingState(fix, b)).toEqual({
      buy: "5500000",
      cur: "9600000",
      qty: "1.00000000",
      archived: false,
    });
  });

  it("the Phase 13 adjust / delete-holding / history routes are gone", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    await startEntry(fix, b);
    const [row] = await entryIds(app, b);
    expect(
      (
        await req(app, "POST", `/${b}/adjust`, {
          kind: "value_change",
          newValueCents: "1",
          effectiveDate: "2026-10-24",
        })
      ).status,
    ).toBe(404);
    expect((await req(app, "DELETE", `/${b}`)).status).toBe(404);
    expect((await req(app, "DELETE", `/history/${row!.id}`)).status).toBe(404);
    expect((await req(app, "GET", `/${b}/history`)).status).toBe(404);
  });

  // 13.1 (D-06, CR-01): the Edit body is strict — cost is not a field at all.
  it("PATCH that sends a buy price → 422 (ledger-owned field)", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    const res = await req(app, "PATCH", `/${b}`, { buyPriceCents: "1" });
    expect(res.status).toBe(422);
    expect(await holdingState(fix, b)).toMatchObject({ buy: "5500000" });
  });

  it("type summary keeps a sold-out type's realized (D-14)", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const b = await brokerSeed(fix);
    await sell(app, b, {
      left: { valueCents: "0" },
      destination: { kind: "out" },
      receivedCents: "9600000",
    });
    const s = (await (await req(app, "GET", "/type-summary")).json()) as {
      currency: string;
      types: Record<
        string,
        { realizedBudgetCents: string; soldCostBudgetCents: string }
      >;
    };
    expect(s.currency).toBe("PLN");
    expect(s.types.broker).toEqual({
      realizedBudgetCents: "4100000",
      soldCostBudgetCents: "5500000",
    });
  });

  it("PUT type-order saves the order; bad keys and duplicates are 422", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const ok = await req(app, "PUT", "/type-order", {
      order: ["crypto", "stocks"],
    });
    expect(ok.status).toBe(200);
    const s = (await (await req(app, "GET", "/type-summary")).json()) as {
      order: string[];
    };
    expect(s.order).toEqual(["crypto", "stocks"]);
    expect(
      (await req(app, "PUT", "/type-order", { order: ["equity"] })).status,
    ).toBe(422);
    expect(
      (await req(app, "PUT", "/type-order", { order: ["stocks", "stocks"] }))
        .status,
    ).toBe(422);
  });
});
