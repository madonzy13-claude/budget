/**
 * wallets.test.ts — Integration tests for /wallets routes (renamed from accounts)
 *
 * TDD: Written RED before route rename. Tests the renamed /wallets path,
 * wallet creation with walletType, and verifies old /accounts returns 404.
 *
 * Uses real Postgres. DATABASE_URL_APP required.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

let testUserId: string;
let testTenantId: string;

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DB_URL });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `wallet-test-${userId}@example.com`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Test User', true, now(), now())`,
      [userId, email],
    );
    // Insert into tenancy.budgets (renamed from workspaces in 01-01)
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Test Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `bgt-wallets-${tenantId.slice(0, 8)}`, userId],
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

async function buildApp(userId: string, tenantId: string) {
  const { createWalletsRoute } = await import("../../src/routes/wallets");
  const { DrizzleWalletRepo } =
    await import("@budget/budgeting/src/adapters/persistence/wallet-repo");
  const { createWallet } =
    await import("@budget/budgeting/src/application/create-wallet");
  const { archiveWallet } =
    await import("@budget/budgeting/src/application/archive-wallet");
  const { setWalletBalance } =
    await import("@budget/budgeting/src/application/set-wallet-balance");
  const { listWallets } =
    await import("@budget/budgeting/src/application/list-wallets");
  const { findWalletById } =
    await import("@budget/budgeting/src/application/find-wallet-by-id");

  const repo = new DrizzleWalletRepo();
  const deps = {
    budgeting: {
      createWallet: createWallet({ repo }),
      archiveWallet: archiveWallet({ repo }),
      setWalletBalance: setWalletBalance({ repo }),
      listWallets: listWallets({ repo }),
      findWalletById: findWalletById({ repo }),
    },
  } as any;

  const app = new Hono();
  app.use(async (c: any, next: any) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/wallets", createWalletsRoute(deps));
  return app;
}

describe("Wallets route (renamed from accounts)", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("POST /wallets creates a wallet with walletType=SPENDINGS and returns 201", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "My Spending Wallet",
        walletType: "SPENDINGS",
        currency: "EUR",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.name).toBe("My Spending Wallet");
    expect(body.walletType).toBe("SPENDINGS");
  });

  it("GET /wallets lists wallets", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/wallets");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.wallets)).toBe(true);
  });

  it("POST /accounts returns 404", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Old Account",
        walletType: "SPENDINGS",
        currency: "EUR",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /wallets rejects scope field (no longer accepted)", async () => {
    // scope was dropped in D-13 — the schema no longer includes it
    // The createWalletSchema only accepts name, walletType, currency
    // A request WITH scope in body should still return 201 (extra fields ignored by Zod strip)
    // but scope should NOT appear in the response
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "Scope-Less Wallet",
        walletType: "SPENDINGS",
        currency: "EUR",
        scope: "PERSONAL", // dropped field — should be ignored/stripped
      }),
    });
    // Should still create successfully (Zod strips unknown fields)
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    // scope must not appear in response
    expect(body.scope).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Phase 2 gap-closure: wallet balance fully decoupled from transactions.
  // Only PUT /wallets/:id/balance (set full value) mutates current_balance.
  // The old delta endpoint POST /wallets/:id/balance-adjustment is removed
  // because its backing table `account_balance_adjustments` was dropped by
  // migration 0013 (D-PH2-09 updated).
  // ---------------------------------------------------------------------------

  it("PUT /wallets/:id/balance overwrites current_balance to the absolute value (no delta math, no adjustment row)", async () => {
    const app = await buildApp(testUserId, testTenantId);

    const createRes = await app.request("/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "Balance Set Wallet",
        walletType: "SPENDINGS",
        currency: "EUR",
      }),
    });
    expect(createRes.status).toBe(201);
    const wallet = (await createRes.json()) as any;

    // Set balance to an absolute value
    const setRes = await app.request(`/wallets/${wallet.id}/balance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "1234.56", currency: "EUR" }),
    });
    expect(setRes.status).toBe(200);

    // Verify GET reflects the absolute value (not a delta sum)
    const getRes = await app.request(`/wallets/${wallet.id}`);
    expect(getRes.status).toBe(200);
    const fresh = (await getRes.json()) as any;
    const balAmount = fresh.currentBalance?.amount ?? fresh.balance?.amount;
    expect(balAmount).toBe("1234.56");

    // A second PUT overwrites (does NOT add to previous)
    const setRes2 = await app.request(`/wallets/${wallet.id}/balance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "50.00", currency: "EUR" }),
    });
    expect(setRes2.status).toBe(200);
    const getRes2 = await app.request(`/wallets/${wallet.id}`);
    const fresh2 = (await getRes2.json()) as any;
    const balAmount2 = fresh2.currentBalance?.amount ?? fresh2.balance?.amount;
    expect(balAmount2).toBe("50.00"); // overwritten, NOT 1284.56
  });

  it("PUT /wallets/:id/balance rejects mismatched currency (immutable per WALT-04)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "EUR Wallet",
        walletType: "SPENDINGS",
        currency: "EUR",
      }),
    });
    const wallet = (await createRes.json()) as any;

    const res = await app.request(`/wallets/${wallet.id}/balance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "100", currency: "USD" }),
    });
    expect(res.status).toBe(422);
  });

  it("POST /wallets/:id/balance-adjustment returns 404 (removed in v1.1 — clients must use PUT /balance)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const createRes = await app.request("/wallets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "W",
        walletType: "SPENDINGS",
        currency: "EUR",
      }),
    });
    const wallet = (await createRes.json()) as any;
    const res = await app.request(`/wallets/${wallet.id}/balance-adjustment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "10", currency: "EUR", reason: "x" }),
    });
    expect(res.status).toBe(404);
  });
});
