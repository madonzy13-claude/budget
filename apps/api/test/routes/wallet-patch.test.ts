/**
 * wallet-patch.test.ts — Integration tests for PATCH /wallets/:id (Phase 5 Plan 03).
 * TDD: written before route implementation.
 * Uses real Postgres. DATABASE_URL_APP required (no DB mocks, CLAUDE.md).
 * WALT-01..03, T-05-02, T-05-03, T-05-12, T-05-13.
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
}

async function createFixture(currency = "EUR"): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'WalletPatch Test', true, now(), now())`,
      [userId, `wallet-patch-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'WalletPatch Budget', 'PRIVATE', $3, $4, 1, now())`,
      [tenantId, `wp-${tenantId.slice(0, 8)}`, currency, userId],
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
  const { updateWallet } =
    await import("@budget/budgeting/src/application/update-wallet");
  const { withInfraTx } = await import("@budget/platform");
  const { sql } = await import("drizzle-orm");

  const repo = new DrizzleWalletRepo();

  const budgetCurrencyOf = async (tid: string): Promise<string> => {
    const r = await withInfraTx(async (tx: any) => {
      const rs = await tx.execute(
        sql`SELECT default_currency FROM tenancy.budgets WHERE id = ${tid}::uuid LIMIT 1`,
      );
      const rows = (rs as any).rows ?? rs;
      return rows[0]?.default_currency ?? "EUR";
    });
    return r.isOk() ? r.value : "EUR";
  };

  const deps = {
    budgeting: {
      createWallet: createWallet({ repo }),
      archiveWallet: archiveWallet({ repo }),
      setWalletBalance: setWalletBalance({ repo }),
      listWallets: listWallets({ repo }),
      findWalletById: findWalletById({ repo }),
      updateWallet: updateWallet({ repo, budgetCurrencyOf }),
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

async function createWalletHelper(
  app: Hono,
  name: string,
  walletType: string,
  currency: string,
) {
  const res = await app.request("/wallets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ name, walletType, currency }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as any;
}

describe("PATCH /wallets/:id", () => {
  let fix: Fixture;
  let app: Hono;

  beforeAll(async () => {
    fix = await createFixture("EUR"); // budget currency = EUR
    app = await buildApp(fix.userId, fix.tenantId);
  });

  it("200: PATCH name only → row name changes", async () => {
    const wallet = await createWalletHelper(
      app,
      "Original Name",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed Wallet" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.wallet.name).toBe("Renamed Wallet");
  });

  it("200: PATCH amount only → currentBalanceCents changes", async () => {
    const wallet = await createWalletHelper(
      app,
      "Amount Wallet",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: "500.00" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.wallet.currentBalanceCents).toBe("50000");
  });

  it("200: PATCH walletType to RESERVE on EUR budget-currency wallet → succeeds", async () => {
    const wallet = await createWalletHelper(
      app,
      "Spendings EUR",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletType: "RESERVE" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.wallet.walletType).toBe("RESERVE");
  });

  it("422 reserve_currency_mismatch: PATCH walletType=RESERVE on non-budget-currency wallet", async () => {
    const wallet = await createWalletHelper(
      app,
      "USD Wallet",
      "SPENDINGS",
      "USD",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletType: "RESERVE" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("reserve_currency_mismatch");
  });

  it("422 reserve_currency_mismatch: existing RESERVE wallet, PATCH currency to non-budget-currency", async () => {
    // First create as SPENDINGS EUR (budget currency), PATCH to RESERVE
    const wallet = await createWalletHelper(
      app,
      "EUR Reserve",
      "SPENDINGS",
      "EUR",
    );
    const patchRes = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletType: "RESERVE" }),
    });
    expect(patchRes.status).toBe(200);

    // Now PATCH currency to USD — RESERVE + USD != EUR budget currency
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("reserve_currency_mismatch");
  });

  it("422 reserve_currency_mismatch: compound update walletType=RESERVE + currency=USD on EUR budget", async () => {
    const wallet = await createWalletHelper(
      app,
      "EUR Compound",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletType: "RESERVE", currency: "USD" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toBe("reserve_currency_mismatch");
  });

  it("422 empty_body: PATCH {} → 422 with empty_body", async () => {
    const wallet = await createWalletHelper(
      app,
      "Empty Test",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toContain("empty_body");
  });

  it("422 mass-assignment: PATCH {name, tenantId} → 422 (strict mode rejects unknown keys)", async () => {
    const wallet = await createWalletHelper(
      app,
      "MassAssign Test",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X", tenantId: "attacker-id" }),
    });
    expect(res.status).toBe(422);
  });

  it("404 cross-tenant: walletId belongs to another tenant → 404", async () => {
    const other = await createFixture("EUR");
    const otherApp = await buildApp(other.userId, other.tenantId);
    const otherWallet = await createWalletHelper(
      otherApp,
      "Other Wallet",
      "SPENDINGS",
      "EUR",
    );

    // Use fix's app but pass other's walletId
    const res = await app.request(`/wallets/${otherWallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stolen" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("not_found");
  });

  it("200 currency-then-amount: PATCH {currency, amount} → both change", async () => {
    const wallet = await createWalletHelper(
      app,
      "EUR To USD",
      "SPENDINGS",
      "EUR",
    );
    const res = await app.request(`/wallets/${wallet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "USD", amount: "100.00" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.wallet.currency).toBe("USD");
    expect(body.wallet.currentBalanceCents).toBe("10000");
  });
});
