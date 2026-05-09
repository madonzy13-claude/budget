/**
 * accounts.test.ts — Integration tests for /accounts routes
 * Uses real Postgres. Currency-allowlist tests depend on post-migration.sql seed
 * (8 fiat + 6 crypto codes from plan 02-02), NOT on bootstrapSupportedCurrencies.
 *
 * TDD: written RED before implementation.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";

// This test file depends on supported_currencies from post-migration.sql seed
// (plan 02-02: USD,EUR,PLN,UAH,GBP,CHF,JPY,NOK + BTC,ETH,USDT,USDC,BNB,SOL)
// Do NOT rely on runtime bootstrapSupportedCurrencies.

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required for integration tests");

let testUserId: string;
let testTenantId: string;

async function createTestUser(): Promise<{ userId: string; tenantId: string }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: DB_URL });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `acct-test-${userId}@example.com`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Test User', true, now(), now())`,
      [userId, email],
    );
    await client.query(`SELECT set_config('app.current_user_id', '${userId}', true)`);
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Test WS', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-acct-${tenantId.slice(0, 8)}`, userId],
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
  const { createAccountsRoute } = await import("../../src/routes/accounts");
  const { DrizzleAccountRepo } = await import(
    "@budget/budgeting/src/adapters/persistence/account-repo"
  );
  const { createAccount } = await import(
    "@budget/budgeting/src/application/create-account"
  );
  const { archiveAccount } = await import(
    "@budget/budgeting/src/application/archive-account"
  );
  const { adjustAccountBalance } = await import(
    "@budget/budgeting/src/application/adjust-account-balance"
  );
  const { listAccounts } = await import(
    "@budget/budgeting/src/application/list-accounts"
  );
  const { findAccountById } = await import(
    "@budget/budgeting/src/application/find-account-by-id"
  );

  const repo = new DrizzleAccountRepo();
  const deps = {
    budgeting: {
      createAccount: createAccount({ repo }),
      archiveAccount: archiveAccount({ repo }),
      adjustAccountBalance: adjustAccountBalance({ repo }),
      listAccounts: listAccounts({ repo }),
      findAccountById: findAccountById({ repo }),
    },
  } as any;

  const app = new Hono();
  app.use(async (c, next) => {
    c.set("session", { user: { id: userId } });
    c.set("tenantId", tenantId);
    c.set("tenantIds", [tenantId]);
    c.set("userId", userId);
    await next();
  });
  app.route("/accounts", createAccountsRoute(deps));
  return app;
}

describe("POST /accounts", () => {
  beforeAll(async () => {
    const t = await createTestUser();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  it("creates account with valid body → 201, balance='0'", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "Cash Wallet",
        kind: "CASH",
        scope: "PERSONAL",
        currency: "USD",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Cash Wallet");
    expect(body.currentBalance).toBe("0");
    expect(body.archivedAt).toBeNull();
  });

  it("returns 422 with invalid kind", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "Bad Account",
        kind: "INVALID",
        scope: "PERSONAL",
        currency: "USD",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 with currency='XYZ' (not in supported_currencies seed)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "Bad Currency",
        kind: "CASH",
        scope: "PERSONAL",
        currency: "XYZ",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 201 with currency='USD' (fiat in seed)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "USD Account",
        kind: "CHECKING",
        scope: "PERSONAL",
        currency: "USD",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 201 with currency='BTC' (crypto in seed)", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const res = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name: "BTC Wallet",
        kind: "INVESTMENT",
        scope: "PERSONAL",
        currency: "BTC",
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /accounts", () => {
  it("returns empty list for fresh tenant", async () => {
    const fresh = await createTestUser();
    const app = await buildApp(fresh.userId, fresh.tenantId);
    const res = await app.request("/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toHaveLength(0);
  });

  it("returns accounts after creates", async () => {
    const app = await buildApp(testUserId, testTenantId);
    // Create 2 more
    for (const name of ["Savings A", "Checking B"]) {
      await app.request("/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ name, kind: "SAVINGS", scope: "PERSONAL", currency: "EUR" }),
      });
    }
    const res = await app.request("/accounts");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("POST /accounts/:id/archive", () => {
  it("archives account and hides from active list", async () => {
    const app = await buildApp(testUserId, testTenantId);

    const createRes = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ name: "To Archive", kind: "SAVINGS", scope: "PERSONAL", currency: "EUR" }),
    });
    const created = await createRes.json();
    const accountId = created.id;

    const archiveRes = await app.request(`/accounts/${accountId}/archive`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(archiveRes.status).toBe(200);
    const archiveBody = await archiveRes.json();
    expect(archiveBody.archivedAt).not.toBeNull();

    // Verify hidden from default list
    const listRes = await app.request("/accounts");
    const listBody = await listRes.json();
    const ids = listBody.accounts.map((a: any) => a.id);
    expect(ids).not.toContain(accountId);
  });
});

describe("POST /accounts/:id/balance-adjustment", () => {
  it("returns 201 and newBalance with matching currency", async () => {
    const app = await buildApp(testUserId, testTenantId);

    const createRes = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ name: "Balance Test", kind: "CASH", scope: "PERSONAL", currency: "EUR" }),
    });
    const created = await createRes.json();

    const adjRes = await app.request(`/accounts/${created.id}/balance-adjustment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ amount: "100", currency: "EUR", reason: "Initial deposit" }),
    });
    expect(adjRes.status).toBe(201);
    const adjBody = await adjRes.json();
    expect(adjBody.newBalance).toBeDefined();
  });

  it("returns 422 with mismatched currency", async () => {
    const app = await buildApp(testUserId, testTenantId);

    const createRes = await app.request("/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ name: "Currency Mismatch", kind: "CASH", scope: "PERSONAL", currency: "EUR" }),
    });
    const created = await createRes.json();

    const adjRes = await app.request(`/accounts/${created.id}/balance-adjustment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ amount: "100", currency: "USD", reason: "Wrong currency" }),
    });
    expect(adjRes.status).toBe(422);
  });
});

describe("Idempotency replay", () => {
  it("POST /accounts returns valid id for new account", async () => {
    const app = await buildApp(testUserId, testTenantId);
    const key = crypto.randomUUID();
    const res = await app.request("/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({
        name: `Idempotent-${key}`,
        kind: "CASH",
        scope: "PERSONAL",
        currency: "EUR",
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
  });
});
