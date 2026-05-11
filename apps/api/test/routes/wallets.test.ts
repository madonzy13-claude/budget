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

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required for integration tests");

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
  const { adjustWalletBalance } =
    await import("@budget/budgeting/src/application/adjust-wallet-balance");
  const { listWallets } =
    await import("@budget/budgeting/src/application/list-wallets");
  const { findWalletById } =
    await import("@budget/budgeting/src/application/find-wallet-by-id");

  const repo = new DrizzleWalletRepo();
  const deps = {
    budgeting: {
      createWallet: createWallet({ repo }),
      archiveWallet: archiveWallet({ repo }),
      adjustWalletBalance: adjustWalletBalance({ repo }),
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
});
