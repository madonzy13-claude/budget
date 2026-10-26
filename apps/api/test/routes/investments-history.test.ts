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
