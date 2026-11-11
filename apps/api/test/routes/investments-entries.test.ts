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
  rateOn: (date: Date) => string = () => "1",
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
    rateAsOf: async (_f: string, _t: string, d: Date) => ({
      rate: rateOn(d),
      provider: "stub",
      isStale: false,
    }),
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

const call = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/investments${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const entriesOf = async (app: Hono, id: string, query = "") =>
  (
    (await (await call(app, "GET", `/${id}/entries${query}`)).json()) as {
      entries: Array<Record<string, unknown>>;
    }
  ).entries;
const buy = (app: Hono, id: string, date: string) =>
  call(app, "POST", `/${id}/buy`, {
    kind: "amount",
    amountCents: "1000",
    currency: "PLN",
    effectiveDate: date,
  });
const startEntry = (fix: Fixture, id: string) =>
  q(
    fix,
    `INSERT INTO budgeting.investment_history (tenant_id, budget_id, holding_id, kind, effective_date, amount_cents, amount_currency, cost_delta_cents, flow_cents, flow_currency)
          VALUES ($1, $1, $2, 'start', '2026-09-01', 1000000, 'PLN', 1000000, 1000000, 'PLN')`,
    [fix.tenantId, id],
  );

describe("Investment entries ledger", () => {
  it("lists entries newest first with only the newest deletable", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const h = await seed(fix);
    await startEntry(fix, h);
    await buy(app, h, "2026-10-01");
    const res = await call(app, "GET", `/${h}/entries`);
    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(entries.map((e) => [e.kind, e.deletable, e.blockedReason])).toEqual([
      ["add", true, null],
      ["start", false, "not_newest"],
    ]);
    expect(entries[0]).toMatchObject({
      amountCents: "1000",
      amountCurrency: "PLN",
      isLastEntry: false,
    });
  });

  // R6 (user): each row says what the asset held right after it — the
  // account's value, or quantity × that deal's own price — in its currency.
  it("each entry carries the asset's total right after it", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const cash = await seed(fix); // 10,000 PLN
    await startEntry(fix, cash);
    await buy(app, cash, "2026-10-01"); // +10 PLN
    expect(
      (await entriesOf(app, cash)).map((e) => [e.afterCents, e.afterCurrency]),
    ).toEqual([
      ["1001000", "PLN"],
      ["1000000", "PLN"],
    ]);

    const coin = (
      (await (
        await call(app, "POST", "", {
          name: "Coin",
          holdingType: "crypto",
          uiType: "crypto",
          quantity: "1",
          buyPriceCents: "10000",
          buyCurrency: "PLN",
          currentPriceCents: "30000",
          currentPriceCurrency: "PLN",
          openedOn: "2026-09-01",
        })
      ).json()) as { id: string }
    ).id;
    await call(app, "POST", `/${coin}/buy`, {
      kind: "quantity",
      quantity: "1",
      priceCents: "20000",
      currency: "PLN",
      effectiveDate: "2026-10-01",
    });
    // 2 × 200 at the second buy; 1 × 100 at the first.
    expect((await entriesOf(app, coin)).map((e) => e.afterCents)).toEqual([
      "40000",
      "10000",
    ]);
  });

  // R6 (user): with the asset shown in another currency, that total is
  // converted at the entry's OWN date rate, not today's.
  it("the total after an entry follows the picked currency at that date's rate", async () => {
    const fix = await createFixture();
    // 1 PLN = 0.20 EUR before October, 0.25 from then on.
    const app = await buildApp(fix, undefined, (d) =>
      d.toISOString().slice(0, 10) >= "2026-10-01" ? "0.25" : "0.2",
    );
    const cash = await seed(fix); // 10,000 PLN
    await startEntry(fix, cash);
    await buy(app, cash, "2026-10-01"); // +10 PLN
    expect(
      (await entriesOf(app, cash, "?currency=EUR")).map((e) => [
        e.afterCents,
        e.afterCurrency,
      ]),
    ).toEqual([
      ["250250", "EUR"], // 10,010 PLN × 0.25
      ["200000", "EUR"], // 10,000 PLN × 0.20
    ]);
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
    const [row] = await q<{ buy: string }>(
      fix,
      `SELECT buy_price_cents::text AS buy FROM budgeting.investments WHERE id = $1`,
      [h],
    );
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
    expect(
      await q(fix, `SELECT 1 FROM budgeting.investments WHERE id = $1`, [h]),
    ).toHaveLength(0);
  });

  it("deleting a sale into a RESERVE / CUSHION wallet takes the money back and recomputes that task", async () => {
    for (const [type, reserve, cushion] of [
      ["RESERVE", 1, 0],
      ["CUSHION", 0, 1],
    ] as const) {
      const fix = await createFixture();
      const spies = { reserve: [] as unknown[], cushion: [] as unknown[] };
      const app = await buildApp(fix, spies);
      const h = await seed(fix);
      await startEntry(fix, h);
      const w = crypto.randomUUID();
      await q(
        fix,
        `INSERT INTO budgeting.wallets (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order)
                    VALUES ($1, $2, 'W', $3, 'PLN', 100, now(), $4, 1)`,
        [w, fix.tenantId, type, fix.userId],
      );
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
      const [bal] = await q<{ b: string }>(
        fix,
        `SELECT current_balance::text AS b FROM budgeting.wallets WHERE id = $1`,
        [w],
      );
      expect(bal!.b).toBe("100.0000");
      expect([spies.reserve.length, spies.cushion.length]).toEqual([
        reserve,
        cushion,
      ]);
    }
  });

  // R6 (user): every booking takes an optional note (≤ 200), on all its legs.
  it("a note on add, buy, sell and transfer is kept on every leg", async () => {
    const fix = await createFixture();
    const app = await buildApp(fix);
    const created = await call(app, "POST", "", {
      name: "Pot",
      holdingType: "cash_fx",
      uiType: "cash",
      buyPriceCents: "100000",
      buyCurrency: "PLN",
      quantity: "1",
      currentPriceCents: "100000",
      currentPriceCurrency: "PLN",
      openedOn: "2026-09-01",
      note: "  Opening  ",
    });
    expect(created.status).toBe(201);
    const pot = ((await created.json()) as { id: string }).id;
    expect((await entriesOf(app, pot))[0]).toMatchObject({ note: "Opening" });

    expect(
      (
        await call(app, "POST", `/${pot}/buy`, {
          kind: "amount",
          amountCents: "5000",
          currency: "PLN",
          effectiveDate: "2026-09-02",
          note: "Top-up",
        })
      ).status,
    ).toBe(201);
    expect((await entriesOf(app, pot))[0]).toMatchObject({ note: "Top-up" });

    const other = await seed(fix, { name: "Other" });
    await startEntry(fix, other);
    expect(
      (
        await call(app, "POST", `/${pot}/transfer`, {
          effectiveDate: "2026-10-03",
          move: { valueCents: "1000" },
          to: { kind: "existing", holdingId: other },
          note: "Rebalance",
        })
      ).status,
    ).toBe(201);
    expect((await entriesOf(app, pot))[0]).toMatchObject({ note: "Rebalance" });
    expect((await entriesOf(app, other))[0]).toMatchObject({
      note: "Rebalance",
    });

    const out = await call(app, "POST", `/${pot}/sell`, {
      effectiveDate: "2026-10-04",
      left: { valueCents: "50000" },
      destination: { kind: "out" },
      receivedCents: "500",
      receivedCurrency: "PLN",
      note: "Paid the car loan",
    });
    expect(out.status).toBe(201);
    expect((await entriesOf(app, pot))[0]).toMatchObject({
      kind: "withdraw",
      note: "Paid the car loan",
    });
    // No note → null; too long → refused.
    const long = await call(app, "POST", `/${pot}/buy`, {
      kind: "amount",
      amountCents: "100",
      currency: "PLN",
      effectiveDate: "2026-10-05",
      note: "x".repeat(201),
    });
    expect(long.status).toBe(422);
  });

  // R6 (user): Edit a transaction — its note, and its date between neighbours.
  describe("PATCH /entries/:id", () => {
    it("changes the note and the date within its neighbours", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await seed(fix);
      await startEntry(fix, h); // 2026-09-01
      await buy(app, h, "2026-09-10");
      await buy(app, h, "2026-09-20");
      const mid = (await entriesOf(app, h))[1]!;
      expect(mid).toMatchObject({
        effectiveDate: "2026-09-10",
        dateMin: "2026-09-01",
        dateMax: "2026-09-20",
      });

      const res = await call(app, "PATCH", `/entries/${mid.id}`, {
        effectiveDate: "2026-09-15",
        note: " Bonus ",
      });
      expect(res.status).toBe(200);
      expect((await entriesOf(app, h))[1]).toMatchObject({
        id: mid.id,
        effectiveDate: "2026-09-15",
        note: "Bonus",
      });

      const out = await call(app, "PATCH", `/entries/${mid.id}`, {
        effectiveDate: "2026-09-25",
      });
      expect(out.status).toBe(422);
      expect(await out.json()).toMatchObject({
        error: "date_out_of_range",
        min: "2026-09-01",
        max: "2026-09-20",
      });

      // An empty note clears it.
      await call(app, "PATCH", `/entries/${mid.id}`, { note: "" });
      expect((await entriesOf(app, h))[1]).toMatchObject({ note: null });
    });

    it("moves both legs of a transfer, bounded by both assets", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const a = await seed(fix, { name: "A" });
      const b = await seed(fix, { name: "B" });
      await startEntry(fix, a);
      await startEntry(fix, b);
      await buy(app, b, "2026-09-05");
      await call(app, "POST", `/${a}/transfer`, {
        effectiveDate: "2026-09-10",
        move: { valueCents: "1000" },
        to: { kind: "existing", holdingId: b },
      });
      const leg = (await entriesOf(app, a))[0]!;
      // B's buy on 09-05 bounds the pair from below.
      const low = await call(app, "PATCH", `/entries/${leg.id}`, {
        effectiveDate: "2026-09-03",
      });
      expect(low.status).toBe(422);
      expect(
        (
          await call(app, "PATCH", `/entries/${leg.id}`, {
            effectiveDate: "2026-09-07",
            note: "Moved",
          })
        ).status,
      ).toBe(200);
      for (const id of [a, b])
        expect((await entriesOf(app, id))[0]).toMatchObject({
          effectiveDate: "2026-09-07",
          note: "Moved",
        });
    });

    it("a deposit's dates are locked; another tenant's entry is 404", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const dep = await seed(fix, {
        name: "Bank",
        holdingType: "deposit",
        uiType: "deposit",
        depositRateBps: 500,
        depositStartDate: "2026-09-01",
        depositCapFrequency: "monthly",
      });
      await startEntry(fix, dep);
      const start = (await entriesOf(app, dep)).find((x) => x.kind === "start");
      const res = await call(app, "PATCH", `/entries/${start!.id}`, {
        effectiveDate: "2026-08-20",
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: "date_locked" });
      // The note still edits.
      expect(
        (await call(app, "PATCH", `/entries/${start!.id}`, { note: "Opened" }))
          .status,
      ).toBe(200);

      const other = await createFixture();
      const otherApp = await buildApp(other);
      expect(
        (await call(otherApp, "PATCH", `/entries/${start!.id}`, { note: "x" }))
          .status,
      ).toBe(404);
    });
  });

  it("a malformed id is 404; another tenant's entry is 404 and nothing changes", async () => {
    const fix = await createFixture();
    const other = await createFixture();
    const app = await buildApp(fix);
    expect((await call(app, "DELETE", "/entries/nope")).status).toBe(404);
    expect((await call(app, "GET", "/nope/entries")).status).toBe(404);
    const theirs = await seed(other, { name: "Theirs" });
    await startEntry(other, theirs);
    const [id] = await q<{ id: string }>(
      other,
      `SELECT id::text FROM budgeting.investment_history WHERE holding_id = $1`,
      [theirs],
    );
    expect((await call(app, "DELETE", `/entries/${id!.id}`)).status).toBe(404);
    expect(
      await q(
        other,
        `SELECT 1 FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL`,
        [theirs],
      ),
    ).toHaveLength(1);
  });

  // 261108 (user): a transaction's amount and currency can be fixed, unless a
  // later entry already relied on it (a sale took its cost, money left).
  describe("PATCH /entries/:id — amount and currency", () => {
    const create = async (app: Hono, body: Record<string, unknown>) =>
      ((await (await call(app, "POST", "", body)).json()) as { id: string }).id;
    const cashBody = {
      name: "Cash",
      holdingType: "cash_fx",
      uiType: "cash",
      buyPriceCents: "100000",
      buyCurrency: "PLN",
      currentPriceCents: "100000",
      currentPriceCurrency: "PLN",
      openedOn: "2026-09-01",
    };
    const holding = async (fix: Fixture, id: string) =>
      (
        await q<{ buy: string; cur: string; bc: string; cc: string; qty: string }>(
          fix,
          `SELECT buy_price_cents::text AS buy, current_price_cents::bigint::text AS cur,
                  buy_currency AS bc, current_price_currency AS cc, quantity::int::text AS qty
             FROM budgeting.investments WHERE id = $1`,
          [id],
        )
      )[0]!;
    const edit = (app: Hono, id: unknown, body: Record<string, unknown>) =>
      call(app, "PATCH", `/entries/${id}`, body);

    it("changes an older add; the asset and the later entry's undo follow", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      await buy(app, h, "2026-09-10"); // +10.00
      await buy(app, h, "2026-09-20"); // +10.00
      const mid = (await entriesOf(app, h))[1]!;
      expect(mid.amountEditable).toBe(true);

      const res = await edit(app, mid.id, { amountCents: "5000", currency: "PLN" });
      expect(res.status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "106000", cur: "106000" });
      expect((await entriesOf(app, h))[1]).toMatchObject({
        id: mid.id,
        amountCents: "5000",
        amountCurrency: "PLN",
      });

      // Deleting the newest still lands on the right value.
      const newest = (await entriesOf(app, h))[0]!;
      expect((await call(app, "DELETE", `/entries/${newest.id}`)).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "105000", cur: "105000" });
    });

    it("refuses when a later sale relied on it, and nothing changes", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      await buy(app, h, "2026-09-10");
      await call(app, "POST", `/${h}/sell`, {
        effectiveDate: "2026-10-01",
        left: { valueCents: "50000" },
        destination: { kind: "out" },
        receivedCents: "51000",
        receivedCurrency: "PLN",
      });
      const add = (await entriesOf(app, h)).find((e) => e.effectiveDate === "2026-09-10")!;
      expect(add.amountEditable).toBe(false);
      const before = await holding(fix, h);
      const res = await edit(app, add.id, { amountCents: "500" });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ error: "later_entry_depends" });
      expect(await holding(fix, h)).toEqual(before);
      // 261109 (user): the sale itself can have what it received fixed.
      const sale = (await entriesOf(app, h))[0]!;
      expect(sale.amountEditable).toBe(true);
    });

    it("the only entry takes the new currency as said — no conversion", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix, undefined, () => "0.1");
      const h = await create(app, cashBody);
      const [only] = await entriesOf(app, h);
      const res = await edit(app, only!.id, { amountCents: "100000", currency: "UAH" });
      expect(res.status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({
        buy: "100000",
        cur: "100000",
        bc: "UAH",
        cc: "UAH",
      });
    });

    it("an old opening entry with no value of its own still carries the value along", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await seed(fix); // 10,000.00 PLN in, worth the same
      await startEntry(fix, h); // value_delta 0, as migrated entries are
      const [only] = await entriesOf(app, h);
      expect((await edit(app, only!.id, { amountCents: "1500000", currency: "UAH" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "1500000", cur: "1500000", bc: "UAH", cc: "UAH" });
    });

    it("an old opening entry with later entries moves the value and every total", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await seed(fix); // 10,000.00 PLN in, worth the same
      await startEntry(fix, h); // value_delta 0, as migrated entries are
      await buy(app, h, "2026-10-01"); // +10.00
      const opening = (await entriesOf(app, h)).at(-1)!;
      expect((await edit(app, opening.id, { amountCents: "1200000" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "1201000", cur: "1201000" });
      expect((await entriesOf(app, h)).map((e) => e.afterCents)).toEqual([
        "1201000",
        "1200000",
      ]);
    });

    it("with other entries, keeps the amount as said and books it at that day's rate", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix, undefined, () => "0.1");
      const h = await create(app, cashBody);
      await buy(app, h, "2026-09-10"); // +10.00 PLN
      const add = (await entriesOf(app, h))[0]!;
      const res = await edit(app, add.id, { amountCents: "20000", currency: "UAH" });
      expect(res.status).toBe(200);
      // 200 UAH × 0.1 = 20 PLN
      expect(await holding(fix, h)).toMatchObject({ buy: "102000", cur: "102000", bc: "PLN" });
      expect((await entriesOf(app, h))[0]).toMatchObject({ amountCents: "20000", amountCurrency: "UAH" });
    });

    it("an older buy of units re-prices the average cost", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, {
        name: "Coins",
        holdingType: "other",
        uiType: "collectibles",
        quantity: "2",
        buyPriceCents: "1000",
        buyCurrency: "PLN",
        currentPriceCents: "1000",
        currentPriceCurrency: "PLN",
        openedOn: "2026-09-01",
      });
      await call(app, "POST", `/${h}/buy`, {
        kind: "quantity",
        quantity: "2",
        priceCents: "1000",
        currency: "PLN",
        effectiveDate: "2026-09-10",
      });
      const first = (await entriesOf(app, h)).at(-1)!; // 2 × 10.00
      expect((await edit(app, first.id, { amountCents: "6000" })).status).toBe(200);
      // (60.00 + 20.00) / 4 = 20.00
      expect(await holding(fix, h)).toMatchObject({ buy: "2000", qty: "4" });
    });

    // 261109 (user): the running total of that row and every later one moves.
    it("a later value update keeps its value; the totals before it move", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      await buy(app, h, "2026-09-10"); // +10.00
      expect((await call(app, "PATCH", `/${h}`, { currentValueCents: "200000" })).status).toBe(200);
      const add = (await entriesOf(app, h)).find((e) => e.effectiveDate === "2026-09-10")!;
      expect((await edit(app, add.id, { amountCents: "5000" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "105000", cur: "200000" });
      expect((await entriesOf(app, h)).map((e) => e.afterCents)).toEqual([
        "200000",
        "105000",
        "100000",
      ]);
      // Undoing the update lands on the edited value.
      const newest = (await entriesOf(app, h))[0]!;
      expect((await call(app, "DELETE", `/entries/${newest.id}`)).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "105000" });
    });

    it("a broker deposit moves the account value; a later stated value stays", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, { ...cashBody, name: "IKE", holdingType: "other", uiType: "broker" });
      const deposit = (date: string, extra: Record<string, unknown> = {}) =>
        call(app, "POST", `/${h}/buy`, {
          kind: "broker",
          amountCents: "1000",
          currency: "PLN",
          effectiveDate: date,
          ...extra,
        });
      expect((await deposit("2026-09-10")).status).toBe(201); // value follows: 1,010.00
      expect((await deposit("2026-09-20", { valueAfterCents: "150000" })).status).toBe(201);
      const first = (await entriesOf(app, h)).find((e) => e.effectiveDate === "2026-09-10")!;
      expect((await edit(app, first.id, { amountCents: "5000" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "106000", cur: "150000" });
      expect((await entriesOf(app, h)).map((e) => e.afterCents)).toEqual([
        "150000",
        "105000",
        "100000",
      ]);
    });

    // 261109 (user): XTB — a deposit fixed from 2,000 to 500,000 USD still
    // showed the old total, and the later value update (shown in UAH) still
    // read "+1,373,715" from the old figure. The fixed deposit's value moves
    // by what it changed by, even where a value after it was stated; a later
    // update in another currency takes the shift at its own date's rate.
    it("a fixed deposit moves its total; a later update in another currency absorbs it", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix, undefined, (d) =>
        d.toISOString().slice(0, 10) >= "2026-10-01" ? "10" : "1",
      );
      const h = await create(app, { ...cashBody, name: "XTB", holdingType: "other", uiType: "broker" });
      expect(
        (
          await call(app, "POST", `/${h}/buy`, {
            kind: "broker",
            amountCents: "1000",
            currency: "PLN",
            effectiveDate: "2026-09-10",
            valueAfterCents: "150000",
          })
        ).status,
      ).toBe(201);
      expect(
        (await call(app, "PATCH", `/${h}`, { displayCurrency: "UAH", currentValueCents: "2000000" })).status,
      ).toBe(200);
      const before = await entriesOf(app, h);
      expect(before[0]).toMatchObject({ kind: "value_change", amountCents: "500000" }); // 1,500,000 → 2,000,000 UAH
      const dep = before.find((e) => e.effectiveDate === "2026-09-10")!;
      expect((await edit(app, dep.id, { amountCents: "5000" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ buy: "105000", cur: "2000000", cc: "UAH" });
      const after = await entriesOf(app, h);
      // +40.00 PLN × 10 = +400 UAH before the update, so it rose by 400 less.
      expect(after[0]).toMatchObject({ kind: "value_change", amountCents: "460000" });
      expect(after.map((e) => e.afterCents).slice(0, 2)).toEqual(["2000000", "1540000"]);
    });

    // 261109 (user): a value update's Edit offers its value and currency too.
    it("a value update's value can be fixed; the asset and totals follow", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      expect((await call(app, "PATCH", `/${h}`, { currentValueCents: "200000" })).status).toBe(200);
      const upd = (await entriesOf(app, h))[0]!;
      expect(upd).toMatchObject({ kind: "value_change", valueCents: "200000", amountEditable: true });
      expect((await edit(app, upd.id, { amountCents: "150000" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "150000" });
      expect((await entriesOf(app, h)).map((e) => e.afterCents)).toEqual(["150000", "100000"]);
      expect((await entriesOf(app, h))[0]).toMatchObject({ valueCents: "150000", amountCents: "50000" });
      // Undoing it still lands on the value before.
      expect((await call(app, "DELETE", `/entries/${upd.id}`)).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "100000" });
    });

    it("a value update said in another currency keeps it, valued at that day's rate", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix, undefined, () => "0.1");
      const h = await create(app, cashBody);
      expect((await call(app, "PATCH", `/${h}`, { currentValueCents: "200000" })).status).toBe(200);
      const upd = (await entriesOf(app, h))[0]!;
      expect((await edit(app, upd.id, { amountCents: "1200000", currency: "UAH" })).status).toBe(200);
      // 12,000 UAH × 0.1 = 1,200 PLN
      expect(await holding(fix, h)).toMatchObject({ cur: "120000", cc: "PLN" });
      expect((await entriesOf(app, h))[0]).toMatchObject({ valueCents: "1200000", amountCurrency: "UAH" });
    });

    // 261111 (user): "Price updated" entries are editable too — the unit
    // price is fixed; a later update keeps its price and absorbs the change.
    it("a price update's price can be fixed; a later update keeps its own", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, {
        name: "Coins",
        holdingType: "other",
        uiType: "collectibles",
        quantity: "2",
        buyPriceCents: "1000",
        buyCurrency: "PLN",
        currentPriceCents: "1000",
        currentPriceCurrency: "PLN",
        openedOn: "2026-09-01",
      });
      expect((await call(app, "PATCH", `/${h}`, { currentPriceCents: "1500" })).status).toBe(200);
      const upd = (await entriesOf(app, h))[0]!;
      expect(upd).toMatchObject({ kind: "price_change", valueCents: "1500", amountEditable: true });
      expect((await edit(app, upd.id, { amountCents: "1200" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "1200" });
      expect((await entriesOf(app, h))[0]).toMatchObject({ valueCents: "1200", amountCents: "400" });

      expect((await call(app, "PATCH", `/${h}`, { currentPriceCents: "2000" })).status).toBe(200);
      expect((await edit(app, upd.id, { amountCents: "1100" })).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "2000" });
      const [later, first] = await entriesOf(app, h);
      expect(first).toMatchObject({ valueCents: "1100", amountCents: "200" });
      expect(later).toMatchObject({ valueCents: "2000", amountCents: "1800" });
      // Undoing the later one lands on the fixed price.
      expect((await call(app, "DELETE", `/entries/${later!.id}`)).status).toBe(200);
      expect(await holding(fix, h)).toMatchObject({ cur: "1100" });
    });

    // 261109 (user): a sale's received amount and currency can be fixed too —
    // only what came out changes: the realized gain, nothing in the asset.
    it("a sale's received amount can be fixed; only the realized gain follows", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      await call(app, "POST", `/${h}/sell`, {
        effectiveDate: "2026-10-01",
        left: { valueCents: "50000" },
        destination: { kind: "out" },
        receivedCents: "51000",
        receivedCurrency: "PLN",
      });
      const sale = (await entriesOf(app, h))[0]!;
      expect(sale).toMatchObject({ kind: "withdraw", amountEditable: true });
      const before = await holding(fix, h);
      expect((await edit(app, sale.id, { amountCents: "60000" })).status).toBe(200);
      expect(await holding(fix, h)).toEqual(before);
      const now = (await entriesOf(app, h))[0]!;
      expect(now).toMatchObject({ amountCents: "-60000", amountCurrency: "PLN" });
      expect(BigInt(now.realizedBudgetCents as string) - BigInt(sale.realizedBudgetCents as string)).toBe(9000n);
    });

    // 261109 (user): "why can't I edit bought from / sold into another asset?"
    // A swap's amount is fixable from either side: the source keeps its
    // holding (only its realized gain moves); the destination's cost — and
    // value, where it follows the money — moves by the difference.
    const swap = async (app: Hono, a: string, b: string) =>
      call(app, "POST", `/${a}/sell`, {
        effectiveDate: "2026-10-01",
        left: { valueCents: "50000" },
        destination: { kind: "existing", holdingId: b },
        receivedCents: "50000",
        receivedCurrency: "PLN",
      });

    it("a swap's amount can be fixed; both sides follow", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const a = await create(app, cashBody);
      const b = await create(app, { ...cashBody, name: "Other" });
      expect((await swap(app, a, b)).status).toBe(201);
      const out = (await entriesOf(app, a))[0]!;
      const into = (await entriesOf(app, b))[0]!;
      expect(out).toMatchObject({ kind: "convert_out", amountEditable: true });
      expect(into).toMatchObject({ kind: "convert_in", amountEditable: true });
      const srcBefore = await holding(fix, a);
      expect((await edit(app, out.id, { amountCents: "60000" })).status).toBe(200);
      expect(await holding(fix, a)).toEqual(srcBefore);
      expect(await holding(fix, b)).toMatchObject({ buy: "160000", cur: "160000" });
      const outNow = (await entriesOf(app, a))[0]!;
      expect(outNow).toMatchObject({ amountCents: "-60000" });
      expect(BigInt(outNow.realizedBudgetCents as string) - BigInt(out.realizedBudgetCents as string)).toBe(10000n);
      expect((await entriesOf(app, b))[0]).toMatchObject({ amountCents: "60000", afterCents: "160000" });
    });

    it("a swap stays as booked once the destination later gave something out", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const a = await create(app, cashBody);
      const b = await create(app, { ...cashBody, name: "Other" });
      expect((await swap(app, a, b)).status).toBe(201);
      await call(app, "POST", `/${b}/sell`, {
        effectiveDate: "2026-10-05",
        left: { valueCents: "100000" },
        destination: { kind: "out" },
        receivedCents: "50000",
        receivedCurrency: "PLN",
      });
      const out = (await entriesOf(app, a))[0]!;
      expect(out).toMatchObject({ kind: "convert_out", amountEditable: false });
      expect((await entriesOf(app, b))[1]).toMatchObject({ kind: "convert_in", amountEditable: false });
      expect((await edit(app, out.id, { amountCents: "60000" })).status).toBe(422);
    });

    it("refuses a zero amount", async () => {
      const fix = await createFixture();
      const app = await buildApp(fix);
      const h = await create(app, cashBody);
      const [only] = await entriesOf(app, h);
      expect((await edit(app, only!.id, { amountCents: "0" })).status).toBe(422);
    });
  });
});
