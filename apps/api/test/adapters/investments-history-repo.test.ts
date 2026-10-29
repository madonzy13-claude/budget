/**
 * investments-history-repo.test.ts — Phase 13.1 booking adapter, real Postgres.
 *
 * DrizzleHistoryRepo.commit() is the single atomic booking path: row locks and
 * stale / date re-checks under the lock (D-14, D-15), wallet credit / create /
 * reverse with audit + outbox (D-20..D-24), rename with the label index (D-07),
 * and the CR-01-safe holding update.
 */
import { describe, it, expect } from "bun:test";
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
       VALUES ($1, $2, 'Asset131 Test', true, now(), now())`,
      [userId, `asset131-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at, investments_enabled)
       VALUES ($1, $2, 'Asset131 Budget', 'PRIVATE', $3, $4, 1, now(), true)`,
      [tenantId, `asset131-${tenantId.slice(0, 8)}`, currency, userId],
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

const MIGRATOR = process.env.DATABASE_URL_MIGRATOR?.replace(
  "@db:",
  "@localhost:",
);

async function wallet(
  fix: Fixture,
  over: {
    currency?: string;
    balance?: string;
    archived?: boolean;
    type?: string;
  } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await q(
    fix,
    `INSERT INTO budgeting.wallets
       (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id, sort_order, archived_at)
     VALUES ($1, $2, 'Bank', $3, $4, $5::numeric, now(), $6, 1, CASE WHEN $7 THEN now() END)`,
    [
      id,
      fix.tenantId,
      over.type ?? "SPENDINGS",
      over.currency ?? "PLN",
      over.balance ?? "100.0000",
      fix.userId,
      over.archived ?? false,
    ],
  );
  return id;
}
const balance = async (fix: Fixture, id: string) =>
  (
    await q<{ b: string }>(
      fix,
      `SELECT current_balance::text AS b FROM budgeting.wallets WHERE id = $1`,
      [id],
    )
  )[0]?.b;
const entries = (fix: Fixture, holdingId: string) =>
  q<Record<string, unknown>>(
    fix,
    `SELECT kind, wallet_id::text AS wallet_id, wallet_delta_numeric::text AS wd, wallet_created
       FROM budgeting.investment_history WHERE holding_id = $1 AND deleted_at IS NULL ORDER BY created_at`,
    [holdingId],
  );
async function outbox(fix: Fixture, walletId: string) {
  const p = new Pool({ connectionString: MIGRATOR });
  try {
    return (
      await p.query(
        `SELECT event_type, payload_jsonb FROM shared_kernel.outbox
          WHERE tenant_id = $1 AND aggregate_id = $2 ORDER BY id`,
        [fix.tenantId, walletId],
      )
    ).rows as { event_type: string; payload_jsonb: Record<string, unknown> }[];
  } finally {
    await p.end();
  }
}
const sale = (holdingRef: string, date = "2026-10-01") =>
  entry({
    holdingRef,
    kind: "withdraw",
    effectiveDate: date,
    flowCents: -100n,
  });
const fails = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: Error) => e.message,
  );

describe("Investments history repo — asset bookings", () => {
  it("refuses a booking whose expected newest entry is stale, writing nothing", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      entries: [
        entry({ holdingRef: h, kind: "start", effectiveDate: "2026-09-01" }),
      ],
    });
    const msg = await fails(
      historyRepo.commit(fix.tenantId, fix.userId, {
        budgetId: fix.tenantId,
        patches: [],
        lockHoldingIds: [h],
        expectedNewestEntryId: [{ holdingId: h, entryId: crypto.randomUUID() }],
        entries: [sale(h)],
      }),
    );
    expect(msg).toBe("stale");
    expect((await entries(fix, h)).map((e) => e.kind)).toEqual(["start"]);
  });

  it("refuses an entry dated before the asset's newest entry", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      entries: [
        entry({ holdingRef: h, kind: "start", effectiveDate: "2026-09-10" }),
      ],
    });
    const msg = await fails(
      historyRepo.commit(fix.tenantId, fix.userId, {
        budgetId: fix.tenantId,
        patches: [],
        minEffectiveDate: [{ holdingId: h, date: "2026-09-09" }],
        entries: [sale(h, "2026-09-09")],
      }),
    );
    expect(msg).toBe("before_latest_entry");
  });

  it("credits an existing wallet by the exact amount and links it on the entry", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    const w = await wallet(fix, { type: "RESERVE" });
    const r = await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "12.3456",
        currency: "PLN",
      },
      entries: [{ ...sale(h), walletId: w, walletDeltaNumeric: "12.3456" }],
    });
    expect(r).toMatchObject({ walletId: w, walletType: "RESERVE" });
    expect(await balance(fix, w)).toBe("112.3456");
    expect(await entries(fix, h)).toEqual([
      { kind: "withdraw", wallet_id: w, wd: "12.3456", wallet_created: false },
    ]);
  });

  it("rolls the whole sale back when the wallet currency differs", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    const w = await wallet(fix, { currency: "EUR" });
    const msg = await fails(
      historyRepo.commit(fix.tenantId, fix.userId, {
        budgetId: fix.tenantId,
        patches: [],
        walletCredit: {
          target: { walletId: w },
          amountMajor: "5",
          currency: "PLN",
        },
        entries: [{ ...sale(h), walletId: w, walletDeltaNumeric: "5" }],
      }),
    );
    expect(msg).toBe("wallet_currency_mismatch");
    expect(await entries(fix, h)).toEqual([]);
    expect(await balance(fix, w)).toBe("100.0000");
  });

  it("refuses another tenant's wallet and an archived wallet", async () => {
    const fix = await createFixture();
    const other = await createFixture();
    const h = await seed(fix);
    const foreign = await wallet(other);
    const archived = await wallet(fix, { archived: true });
    for (const w of [foreign, archived]) {
      const msg = await fails(
        historyRepo.commit(fix.tenantId, fix.userId, {
          budgetId: fix.tenantId,
          patches: [],
          walletCredit: {
            target: { walletId: w },
            amountMajor: "5",
            currency: "PLN",
          },
          entries: [{ ...sale(h), walletId: w, walletDeltaNumeric: "5" }],
        }),
      );
      expect(msg).toBe("not_found");
    }
    expect(await entries(fix, h)).toEqual([]);
    expect(await balance(other, foreign)).toBe("100.0000");
  });

  it("creates a wallet that starts with the amount, with audit", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    const r = await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: {
          create: { name: "From BTC", walletType: "CUSHION", currency: "PLN" },
        },
        amountMajor: "250",
        currency: "PLN",
      },
      entries: [
        {
          ...sale(h),
          walletId: "$newWallet",
          walletDeltaNumeric: "250",
          walletCreated: true,
        },
      ],
    });
    expect(r.walletType).toBe("CUSHION");
    expect(await balance(fix, r.walletId!)).toBe("250.0000");
    expect(await entries(fix, h)).toEqual([
      {
        kind: "withdraw",
        wallet_id: r.walletId,
        wd: "250.0000",
        wallet_created: true,
      },
    ]);
    const audit = await q(
      fix,
      `SELECT action FROM shared_kernel.audit_history WHERE entity_id = $1`,
      [r.walletId],
    );
    expect(audit.map((a) => a.action)).toContain("create");
  });

  it("writes the same outbox events as a manual wallet write", async () => {
    const fix = await createFixture();
    const h = await seed(fix);
    const w = await wallet(fix);
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "10",
        currency: "PLN",
      },
      entries: [{ ...sale(h), walletId: w, walletDeltaNumeric: "10" }],
    });
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "10",
        currency: "PLN",
        reverse: true,
      },
      entries: [],
    });
    const ev = await outbox(fix, w);
    expect(ev.map((e) => e.event_type)).toEqual([
      "budgeting.wallet.balance_set",
      "budgeting.wallet.balance_set",
    ]);
    expect(ev[0]!.payload_jsonb).toMatchObject({
      currentBalance: "110.0000",
      currency: "PLN",
      actorUserId: fix.userId,
    });
    expect(ev[1]!.payload_jsonb).toMatchObject({ currentBalance: "100.0000" });
    const r = await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: {
          create: { name: "New", walletType: "OTHER", currency: "PLN" },
        },
        amountMajor: "1",
        currency: "PLN",
      },
      entries: [],
    });
    expect((await outbox(fix, r.walletId!)).map((e) => e.event_type)).toEqual([
      "budgeting.wallet.created",
    ]);
  });

  it("reverses by the stored delta even after a manual edit, and survives a deleted wallet", async () => {
    const fix = await createFixture();
    const w = await wallet(fix);
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "40",
        currency: "PLN",
      },
      entries: [],
    });
    await q(
      fix,
      `UPDATE budgeting.wallets SET current_balance = 500 WHERE id = $1`,
      [w],
    );
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "40",
        currency: "PLN",
        reverse: true,
      },
      entries: [],
    });
    expect(await balance(fix, w)).toBe("460.0000");
    await q(fix, `DELETE FROM budgeting.wallets WHERE id = $1`, [w]);
    const r = await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      walletCredit: {
        target: { walletId: w },
        amountMajor: "40",
        currency: "PLN",
        reverse: true,
      },
      entries: [],
    });
    expect(r.walletId).toBeNull();
  });

  // Round-5 scope change: names are not unique.
  it("renames onto a sibling's exact name", async () => {
    const fix = await createFixture();
    await seed(fix, { name: "BTC" });
    const h = await seed(fix, { name: "ETH" });
    await historyRepo.commit(fix.tenantId, fix.userId, {
      budgetId: fix.tenantId,
      patches: [],
      renameHolding: { id: h, name: "BTC" },
      entries: [],
    });
    expect(
      (
        await q<{ n: number }>(
          fix,
          `SELECT count(*)::int AS n FROM budgeting.investments WHERE name = 'BTC'`,
        )
      )[0]!.n,
    ).toBe(2);
  });

  it("an edit never touches quantity or cost (CR-01)", async () => {
    const fix = await createFixture();
    const h = await seed(fix, { quantity: "3", buyPriceCents: 500n });
    const after = await holdingRepo.update(fix.tenantId, fix.userId, h, {
      name: "Renamed",
      currentPriceCents: "700",
    });
    expect(after).toMatchObject({
      name: "Renamed",
      quantity: "3.00000000",
      buyPriceCents: 500n,
    });
  });

  it("lists hidden names", async () => {
    const fix = await createFixture();
    const h = await seed(fix, {
      name: "BTC",
      uiType: "crypto",
      holdingType: "crypto",
      quantity: "0.5",
    });
    await q(
      fix,
      `UPDATE budgeting.investments SET archived_at = now() WHERE id = $1`,
      [h],
    );
    const names = await holdingRepo.listNames(
      fix.tenantId,
      fix.tenantId,
      "crypto",
    );
    expect(names).toEqual([
      expect.objectContaining({ id: h, name: "BTC", archived: true }),
    ]);
  });

  it("newestFor picks the latest date, then the latest created entry", async () => {
    const fix = await createFixture();
    const a = await seed(fix, { name: "A" });
    const b = await seed(fix, { name: "B" });
    const mk = (ref: string, d: string) =>
      historyRepo.commit(fix.tenantId, fix.userId, {
        budgetId: fix.tenantId,
        patches: [],
        entries: [entry({ holdingRef: ref, kind: "add", effectiveDate: d })],
      });
    await mk(a, "2026-10-02");
    await mk(a, "2026-10-01");
    await mk(a, "2026-10-02");
    const last = (
      await historyRepo.listForHolding(fix.tenantId, fix.userId, a)
    ).at(-1)!;
    const m = await historyRepo.newestFor(fix.tenantId, fix.userId, [a, b]);
    expect(m.get(a)?.id).toBe(last.id);
    expect(m.get(b)).toBeNull();
  });
});
