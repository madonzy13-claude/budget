/**
 * account-repo.test.ts — Integration tests for DrizzleWalletRepo (Plan 01-02 rename)
 * Uses real Postgres via DATABASE_URL_APP env.
 * TDD: written before implementation per CLAUDE.md mandate.
 */
import { describe, test, expect, beforeAll } from "bun:test";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
// Tests run on the host; replace Docker-network @db: with @localhost:
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

// We need a real user to satisfy FK constraints.
// We create a user via direct SQL and use their ID as actor.
let testUserId: string;
let testTenantId: string;

// Helper: create a fresh tenant (user + budget) for test isolation
async function createFreshTenant(): Promise<{
  userId: string;
  tenantId: string;
}> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `test-${userId}@example.com`;

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
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Test Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [tenantId, `ws-${tenantId.slice(0, 8)}`, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
  return { userId, tenantId };
}

describe("DrizzleWalletRepo integration", () => {
  beforeAll(async () => {
    const t = await createFreshTenant();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  test("create + findById round-trip", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "Cash Wallet",
      "SPENDINGS",
      "EUR",
      Money.of("0", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );

    await repo.create(wal);
    const found = await repo.findById(testTenantId, wal.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Cash Wallet");
    expect(found!.walletType).toBe("SPENDINGS");
    expect(found!.currency).toBe("EUR");
    expect(found!.archivedAt).toBeNull();
  });

  test("list excludes archived by default", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "Archived Wallet",
      "SPENDINGS",
      "EUR",
      Money.of("0", "EUR" as any),
      new Date(), // already archived
      new Date(),
      testUserId,
    );
    await repo.create(wal);

    const list = await repo.list(testTenantId, false);
    const ids = list.map((w) => w.id);
    expect(ids).not.toContain(wal.id);
  });

  test("archive sets archivedAt", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "To Archive",
      "SPENDINGS",
      "EUR",
      Money.of("500", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(wal);

    await repo.archive(testTenantId, wal.id, testUserId);
    const found = await repo.findById(testTenantId, wal.id);
    expect(found!.archivedAt).toBeInstanceOf(Date);
  });

  // -------------------------------------------------------------------------
  // Phase 2 gap-closure: wallet balance decoupled from transactions.
  // Only setBalance (full absolute value) mutates current_balance.
  // recordAdjustment + applyDelta are removed.
  // -------------------------------------------------------------------------

  test("setBalance overwrites current_balance to absolute value (does NOT add)", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "SetBalance Test",
      "SPENDINGS",
      "EUR",
      Money.of("100", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(wal);

    // First setBalance: 100 → 500
    await repo.setBalance(
      testTenantId,
      wal.id,
      { amount: "500", currency: "EUR" },
      testUserId,
    );
    const found1 = await repo.findById(testTenantId, wal.id);
    expect(parseFloat(found1!.currentBalance.amount.toFixed(2))).toBe(500);

    // Second setBalance: 500 → 42.50 (overwrite, NOT add)
    await repo.setBalance(
      testTenantId,
      wal.id,
      { amount: "42.50", currency: "EUR" },
      testUserId,
    );
    const found2 = await repo.findById(testTenantId, wal.id);
    expect(parseFloat(found2!.currentBalance.amount.toFixed(2))).toBe(42.5);
  });

  test("setBalance rejects mismatched currency (WALT-04 immutable)", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "Currency Guard",
      "SPENDINGS",
      "EUR",
      Money.of("100", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(wal);

    await expect(
      repo.setBalance(
        testTenantId,
        wal.id,
        { amount: "100", currency: "USD" },
        testUserId,
      ),
    ).rejects.toThrow();
  });

  test("RLS denies cross-tenant SELECT", async () => {
    const { DrizzleWalletRepo } =
      await import("../src/adapters/persistence/wallet-repo");
    const repo = new DrizzleWalletRepo();
    const { Wallet } = await import("../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");

    const wal = new Wallet(
      crypto.randomUUID(),
      testTenantId,
      "Private Wallet",
      "SPENDINGS",
      "EUR",
      Money.of("999", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(wal);

    // Different tenant ID — should not find the wallet
    const otherTenantId = crypto.randomUUID();
    const found = await repo.findById(otherTenantId, wal.id);
    expect(found).toBeNull();
  });
});
