/**
 * cushion-summary.test.ts — Integration test for GET /budgets/:id/cushion-summary
 * (Phase 7 Plan 07-07, D-PH7-20).
 *
 * Boots the real getCushionSummary application service against Postgres,
 * mounts the budgets sub-router, and asserts:
 *   - 200 + DTO for authorized budget with cushion_enabled=true
 *   - 200 + zero-DTO when cushion_enabled=false (short-circuit)
 *   - 401 when no session
 *   - 404 when budgetId not in tenantIds (Pattern D defense-in-depth)
 *
 * Mirrors reserves.test.ts bootstrapping (real DB, set_config GUCs to bypass
 * RLS during seed).
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { Pool } from "pg";
import { ok, err } from "@budget/shared-kernel";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
resetPools();

interface Fixture {
  userId: string;
  budgetId: string;
  currency: string;
}

async function createFixture(opts: {
  currency?: string;
  cushionEnabled?: boolean;
  cushionTargetMonths?: number;
}): Promise<Fixture> {
  const currency = opts.currency ?? "EUR";
  const cushionEnabled = opts.cushionEnabled ?? true;
  const targetMonths = opts.cushionTargetMonths ?? 6;
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Cushion Sum Test', true, now(), now())`,
      [userId, `cushion-sum-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'Cushion Sum Budget', 'PRIVATE', $3, $4, 1, $5, $6, now())`,
      [
        budgetId,
        `ws-cs-${budgetId.slice(0, 8)}`,
        currency,
        userId,
        cushionEnabled,
        targetMonths,
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId, currency };
}

/**
 * Seed a category + active category_limits row with a cushion_amount.
 * Generates the SCD-2 active row (effective_from=2026-01-01, effective_to=NULL).
 */
async function seedCushionCategory(
  budgetId: string,
  userId: string,
  cushionAmountCents: bigint,
  currency = "EUR",
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const categoryId = crypto.randomUUID();
  const limitId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Cushion Cat', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency,
          cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
       VALUES ($1, $2, $3, 0, $6, $4::bigint, $6, '2026-01-01'::date, $5, now())`,
      [
        limitId,
        budgetId,
        categoryId,
        cushionAmountCents.toString(),
        userId,
        currency,
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return categoryId;
}

/**
 * Seed a CUSHION wallet with a given balance + currency.
 */
async function seedCushionWallet(
  budgetId: string,
  userId: string,
  balance: string,
  currency: string,
): Promise<string> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const walletId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Cushion Wallet', 'CUSHION', $3, $4::numeric, now(), $5)`,
      [walletId, budgetId, currency, balance, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return walletId;
}

/**
 * Build a Hono app with the real getCushionSummary service wired through the
 * fxProvider (Frankfurter cached). tenantIds is injected to satisfy Pattern D.
 */
async function buildApp(opts: { userId: string; allowedTenantIds: string[] }) {
  const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
  const { getCushionSummary } =
    await import("@budget/budgeting/src/application/get-cushion-summary");
  const { FrankfurterFxProvider } =
    await import("@budget/budgeting/src/adapters/fx/frankfurter");
  const { DrizzleFxRateCacheRepo } =
    await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
  const { workerPool } = await import("@budget/platform");

  const fxCache = new DrizzleFxRateCacheRepo(workerPool());
  const fxProvider = new FrankfurterFxProvider(fxCache);
  const getCushionSummaryUC = getCushionSummary({ fxProvider });

  const deps = {
    budgeting: {
      getCushionSummary: getCushionSummaryUC,
    },
    tenancy: {
      workspaceRepo: { listForUser: async () => [] },
      memberShareRepo: { update: async () => {} },
    },
    identity: {
      auth: { api: {} },
      userRepo: { setActiveWorkspaceIds: async () => {} },
    },
  } as any;

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("session", { user: { id: opts.userId } });
    c.set("tenantIds", opts.allowedTenantIds);
    await next();
  });
  app.route("/budgets", budgetsRoutesFactory(deps));
  return app;
}

describe("GET /budgets/:id/cushion-summary", () => {
  let fixEnabled: Fixture;
  let fixDisabled: Fixture;
  let fixOther: Fixture;

  beforeAll(async () => {
    fixEnabled = await createFixture({
      currency: "EUR",
      cushionEnabled: true,
      cushionTargetMonths: 6,
    });
    fixDisabled = await createFixture({
      currency: "EUR",
      cushionEnabled: false,
      cushionTargetMonths: 6,
    });
    fixOther = await createFixture({
      currency: "EUR",
      cushionEnabled: true,
      cushionTargetMonths: 6,
    });

    // Seed cushion math for fixEnabled: required = 100_00 cents × 6 = 600_00.
    // Actual = 250_00 cents (EUR wallet, no FX needed). Shortfall = 350_00.
    await seedCushionCategory(fixEnabled.budgetId, fixEnabled.userId, 10000n);
    await seedCushionWallet(
      fixEnabled.budgetId,
      fixEnabled.userId,
      "250.00",
      "EUR",
    );
  });

  it("returns 200 + DTO {enabled:true, target_months:6, computed shortfall} for authorized budget", async () => {
    const app = await buildApp({
      userId: fixEnabled.userId,
      allowedTenantIds: [fixEnabled.budgetId],
    });
    const res = await app.request(
      `/budgets/${fixEnabled.budgetId}/cushion-summary`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      required_cents: string;
      actual_cents: string;
      shortfall_cents: string;
      currency: string;
      enabled: boolean;
      target_months: number;
    };
    expect(body.enabled).toBe(true);
    expect(body.target_months).toBe(6);
    expect(body.currency).toBe("EUR");
    expect(body.required_cents).toBe("60000"); // 100.00 EUR × 6 = 600.00 = 60_000 cents
    expect(body.actual_cents).toBe("25000"); // 250.00 EUR
    expect(body.shortfall_cents).toBe("35000"); // 600.00 − 250.00 = 350.00
  });

  it("returns 200 + zero-DTO when cushion_enabled=false (short-circuit)", async () => {
    const app = await buildApp({
      userId: fixDisabled.userId,
      allowedTenantIds: [fixDisabled.budgetId],
    });
    const res = await app.request(
      `/budgets/${fixDisabled.budgetId}/cushion-summary`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      enabled: boolean;
      required_cents: string;
      actual_cents: string;
      shortfall_cents: string;
      target_months: number;
    };
    expect(body.enabled).toBe(false);
    expect(body.required_cents).toBe("0");
    expect(body.actual_cents).toBe("0");
    expect(body.shortfall_cents).toBe("0");
    expect(body.target_months).toBe(6);
  });

  it("returns 401 without session", async () => {
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const noAuthApp = new Hono();
    const deps = {
      budgeting: {
        // Should not be called — 401 fires first.
        getCushionSummary: async () => err(new Error("should not be called")),
      },
      tenancy: {
        workspaceRepo: { listForUser: async () => [] },
        memberShareRepo: { update: async () => {} },
      },
      identity: {
        auth: { api: {} },
        userRepo: { setActiveWorkspaceIds: async () => {} },
      },
    } as any;
    noAuthApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await noAuthApp.request(
      `/budgets/${fixEnabled.budgetId}/cushion-summary`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when budgetId is not in caller's tenantIds (cross-tenant)", async () => {
    // App scoped to fixOther's tenantIds — caller has no access to fixEnabled's budget.
    const { budgetsRoutesFactory } = await import("../../src/routes/budgets");
    const otherApp = new Hono();
    const deps = {
      budgeting: {
        getCushionSummary: async () =>
          ok({
            required_cents: "1",
            actual_cents: "0",
            shortfall_cents: "1",
            currency: "EUR",
            enabled: true,
            target_months: 6,
          }),
      },
      tenancy: {
        workspaceRepo: { listForUser: async () => [] },
        memberShareRepo: { update: async () => {} },
      },
      identity: {
        auth: { api: {} },
        userRepo: { setActiveWorkspaceIds: async () => {} },
      },
    } as any;
    otherApp.use("*", async (c, next) => {
      c.set("session", { user: { id: fixOther.userId } });
      c.set("tenantIds", [fixOther.budgetId]); // does NOT include fixEnabled.budgetId
      await next();
    });
    otherApp.route("/budgets", budgetsRoutesFactory(deps));
    const res = await otherApp.request(
      `/budgets/${fixEnabled.budgetId}/cushion-summary`,
    );
    expect(res.status).toBe(404);
  });
});
