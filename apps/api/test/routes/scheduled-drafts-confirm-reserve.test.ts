/**
 * Confirming a scheduled payment through the ROUTE refreshes RESERVE_TOPUP.
 *
 * The use-case test pins that `confirmDraft` asks for the refresh; this pins
 * that the route is actually wired to a confirm that can — which is precisely
 * what was missing. `confirm-scheduled-draft` HAS the refresh built in, but it
 * is wired to no route at all; the route calls `confirm-draft`, which did not.
 * A test that stubs the use case cannot see that, and the existing confirm
 * route test builds `confirmDraft({ repo })` with no task deps at all.
 *
 * Reported live (260921): the Overview said withdraw 3,535.10 zł while the
 * reserves pill still said 63.10 zł. The hourly sweep is the backstop and does
 * cover this task — the confirm landed at 06:02:40, two and a half minutes
 * after the 06:00 sweep, so the pill was showing the previous hour's answer.
 *
 * Real Postgres: the RESERVE_TOPUP row is upserted by a partial unique index
 * (ON CONFLICT DO UPDATE), and it is the in-place refresh of an ALREADY-PENDING
 * row that this is about — a fake repo would prove nothing about it.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  tenantId: string;
  ruleId: string;
}

async function withTenant<T>(
  tenantId: string,
  userId: string,
  fn: (c: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Transaction-local GUCs: without them RLS matches no rows and the writes
    // below "succeed" having changed nothing.
    await client.query(`SELECT set_config('app.tenant_ids', $1, true)`, [
      `{${tenantId}}`,
    ]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      userId,
    ]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createFixture(): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const ruleId = crypto.randomUUID();

  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Reserve Confirm Test', true, now(), now())`,
      [userId, `resconf-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          reserves_enabled, created_at)
       VALUES ($1, $2, 'Reserve Confirm Budget', 'PRIVATE', 'USD', $3, 1, true, now())`,
      [tenantId, `ws-resconf-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  await withTenant(tenantId, userId, async (c) => {
    // A RESERVE wallet with money in it: the surplus the task reports is
    // Σ RESERVE wallets − ΣR, so without one there is nothing to withdraw.
    await c.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, currency, current_balance, wallet_type, created_at, actor_user_id)
       VALUES (gen_random_uuid(), $1, 'Reserve', 'USD', 500, 'RESERVE', now(), $2)`,
      [tenantId, userId],
    );
    await c.query(
      `INSERT INTO budgeting.scheduled_payments
         (id, tenant_id, category_id, amount, currency, cadence, cadence_anchor,
          note, active, next_due_date, created_at, actor_user_id)
       VALUES ($1, $2, NULL, 50, 'USD', 'MONTHLY', 15, 'Car Insurance', true,
               CURRENT_DATE, now(), $3)`,
      [ruleId, tenantId, userId],
    );
  });

  return { userId, tenantId, ruleId };
}

let draftDayOffset = 0;

/** An unconfirmed occurrence. Each gets its own date: the ledger holds one
 *  occurrence per (scheduled payment, date), so reusing today collides. */
async function seedDraft(fix: Fixture): Promise<string> {
  const draftId = crypto.randomUUID();
  const offset = draftDayOffset++;
  await withTenant(fix.tenantId, fix.userId, async (c) => {
    await c.query(
      `INSERT INTO budgeting.expense_ledger
         (id, tenant_id, budget_id, transaction_date, amount_original_cents,
          currency_original, amount_converted_cents, fx_rate, fx_as_of, kind,
          scheduled_payment_id, confirmed_at, dismissed_at, created_at, updated_at)
       VALUES ($1, $2, $2, (CURRENT_DATE + ($4 || ' days')::interval)::date,
               5000, 'USD', 5000, '1', CURRENT_DATE,
               'SPENDING', $3, NULL, NULL, now(), now())`,
      [draftId, fix.tenantId, fix.ruleId, String(offset)],
    );
  });
  return draftId;
}

/**
 * The pending RESERVE_TOPUP payload, or null when there is no open task.
 *
 * Through the tenant GUCs like every other read here: `budgeting.tasks` is
 * under RLS, so a plain connection returns NO rows and every assertion below
 * would read as "no task" whatever the code did.
 */
async function pendingReserveTask(
  fix: Fixture,
): Promise<{ shortfall: string; direction: string } | null> {
  return withTenant(fix.tenantId, fix.userId, async (c) => {
    const r = await c.query(
      `SELECT payload_json->>'shortfall_cents' AS shortfall,
              payload_json->>'direction'       AS direction
         FROM budgeting.tasks
        WHERE tenant_id = $1::uuid
          AND kind = 'RESERVE_TOPUP' AND status = 'PENDING'`,
      [fix.tenantId],
    );
    return r.rows[0] ?? null;
  });
}

/** Wired the way boot.ts wires it — the composed module recompute included. */
async function buildApp(fix: Fixture) {
  const { createScheduledPaymentsRoute } =
    await import("../../src/routes/scheduled-payments");
  const { DrizzleExpenseLedgerDraftPortRepo } =
    await import("@budget/budgeting/src/adapters/persistence/expense-ledger-draft-port-repo");
  const { confirmDraft } =
    await import("@budget/budgeting/src/application/confirm-draft");
  const { createBudgetingModule } =
    await import("@budget/budgeting/src/contracts/factory");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");

  const moduleDeps = createBudgetingModule({
    fxCache: new DrizzleFxRateCacheRepo(),
  } as never);

  const deps = {
    budgeting: {
      confirmDraft: confirmDraft({
        repo: new DrizzleExpenseLedgerDraftPortRepo(),
        recomputeReserveTopup: moduleDeps.recomputeReserveTopup,
      }),
    },
  } as unknown as import("../../src/boot").BootedDeps;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: fix.userId } });
    c.set("tenantIds", [fix.tenantId]);
    c.set("userId", fix.userId);
    await next();
  });
  app.route(
    "/budgets/:budgetId/scheduled-payments",
    createScheduledPaymentsRoute(deps),
  );
  return app;
}

describe("POST .../drafts/:draftId/confirm — the reserve task keeps up", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  it("emits the live surplus as a WITHDRAW when a confirm lands", async () => {
    const draftId = await seedDraft(fix);
    const app = await buildApp(fix);

    expect(await pendingReserveTask(fix)).toBeNull();

    const res = await app.request(
      `/budgets/${fix.tenantId}/scheduled-payments/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(204);

    // 500.00 in the reserve wallet against no category reserve at all: the
    // whole wallet is surplus, so the member is told to take it back.
    const task = await pendingReserveTask(fix);
    expect(task).not.toBeNull();
    expect(task!.direction).toBe("WITHDRAW");
    expect(task!.shortfall).toBe("50000");
  });

  it("refreshes an already-pending task in place rather than leaving it stale", async () => {
    // The reported bug exactly: a task was already open, so the emit hit its
    // partial unique index. DO NOTHING there would keep the old amount — which
    // is what the member saw for the two and a half minutes since the sweep.
    const before = await pendingReserveTask(fix);
    expect(before).not.toBeNull();

    await withTenant(fix.tenantId, fix.userId, async (c) => {
      await c.query(
        `UPDATE budgeting.tasks
            SET payload_json = jsonb_set(payload_json, '{shortfall_cents}', '"6310"')
          WHERE tenant_id = $1::uuid AND kind = 'RESERVE_TOPUP' AND status = 'PENDING'`,
        [fix.tenantId],
      );
    });
    expect((await pendingReserveTask(fix))!.shortfall).toBe("6310");

    const draftId = await seedDraft(fix);
    const app = await buildApp(fix);
    const res = await app.request(
      `/budgets/${fix.tenantId}/scheduled-payments/drafts/${draftId}/confirm`,
      { method: "POST" },
    );
    expect(res.status).toBe(204);

    // Back to the engine's answer, not the number the row was carrying.
    expect((await pendingReserveTask(fix))!.shortfall).toBe("50000");
  });

  it("leaves the task alone when the confirm is rejected", async () => {
    const draftId = await seedDraft(fix);
    const app = await buildApp(fix);
    const url = `/budgets/${fix.tenantId}/scheduled-payments/drafts/${draftId}/confirm`;

    expect((await app.request(url, { method: "POST" })).status).toBe(204);
    await withTenant(fix.tenantId, fix.userId, async (c) => {
      await c.query(
        `UPDATE budgeting.tasks
            SET payload_json = jsonb_set(payload_json, '{shortfall_cents}', '"111"')
          WHERE tenant_id = $1::uuid AND kind = 'RESERVE_TOPUP' AND status = 'PENDING'`,
        [fix.tenantId],
      );
    });

    // Second confirm of the same occurrence: nothing moved, so nothing should
    // be recomputed.
    expect((await app.request(url, { method: "POST" })).status).toBe(409);
    expect((await pendingReserveTask(fix))!.shortfall).toBe("111");
  });
});
