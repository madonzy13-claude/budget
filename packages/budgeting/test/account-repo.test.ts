/**
 * account-repo.test.ts — Integration tests for DrizzleAccountRepo
 * Uses real Postgres via DATABASE_URL_APP env.
 * TDD: written before implementation per CLAUDE.md mandate.
 */
import { describe, test, expect, beforeAll } from "bun:test";

const DB_URL = process.env.DATABASE_URL_APP;
if (!DB_URL) throw new Error("DATABASE_URL_APP required for integration tests");

// We need a real user to satisfy FK constraints.
// We create a user via direct SQL and use their ID as actor.
let testUserId: string;
let testTenantId: string;

// Helper: create a fresh tenant (user + workspace) for test isolation
async function createFreshTenant(): Promise<{
  userId: string;
  tenantId: string;
}> {
  const { Pool } = await import("pg");
  // Use app_role pool so RLS policies and triggers are applied correctly
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_APP });
  const userId = crypto.randomUUID();
  const tenantId = crypto.randomUUID();
  const email = `test-${userId}@example.com`;

  // Use a transaction to set context + insert atomically
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
    // Insert workspace
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO tenancy.workspaces (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Test WS', 'PRIVATE', 'EUR', $3, 1, now())`,
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

describe("DrizzleAccountRepo integration", () => {
  beforeAll(async () => {
    const t = await createFreshTenant();
    testUserId = t.userId;
    testTenantId = t.tenantId;
  });

  test("create + findById round-trip", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money } = await import("@budget/shared-kernel");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "Cash Wallet",
      "CASH",
      "PERSONAL",
      "EUR",
      Money.of("0", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );

    await repo.create(acc);
    const found = await repo.findById(testTenantId, acc.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Cash Wallet");
    expect(found!.kind).toBe("CASH");
    expect(found!.currency).toBe("EUR");
    expect(found!.archivedAt).toBeNull();
  });

  test("list excludes archived by default", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money } = await import("@budget/shared-kernel");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "Archived Account",
      "SAVINGS",
      "PERSONAL",
      "EUR",
      Money.of("0", "EUR" as any),
      new Date(), // already archived
      new Date(),
      testUserId,
    );
    await repo.create(acc);

    const list = await repo.list(testTenantId, false);
    const ids = list.map((a) => a.id);
    expect(ids).not.toContain(acc.id);
  });

  test("archive sets archivedAt", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money } = await import("@budget/shared-kernel");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "To Archive",
      "CHECKING",
      "PERSONAL",
      "EUR",
      Money.of("500", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(acc);

    await repo.archive(testTenantId, acc.id, testUserId);
    const found = await repo.findById(testTenantId, acc.id);
    expect(found!.archivedAt).toBeInstanceOf(Date);
  });

  test("recordAdjustment writes to balance_adjustments AND updates accounts.current_balance", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money } = await import("@budget/shared-kernel");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "Adjustment Test",
      "SAVINGS",
      "PERSONAL",
      "EUR",
      Money.of("100", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(acc);

    await repo.recordAdjustment(
      testTenantId,
      acc.id,
      { amount: "50", currency: "EUR" },
      "Manual correction",
      testUserId,
    );

    const found = await repo.findById(testTenantId, acc.id);
    // 100 + 50 = 150
    expect(parseFloat(found!.currentBalance.amount.toFixed(2))).toBe(150);

    // Check balance_adjustments row exists (need tenant context for RLS)
    // Use false (session-level) not true (transaction-local) since we're not in a tx
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: DB_URL });
    const client = await pool.connect();
    try {
      // Use session-level set_config (false = session scope)
      await client.query(
        `SELECT set_config('app.tenant_ids', '{${testTenantId}}', false)`,
      );
      const { rows } = await client.query(
        `SELECT * FROM budgeting.account_balance_adjustments WHERE account_id = $1`,
        [acc.id],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].reason).toBe("Manual correction");
    } finally {
      client.release();
      await pool.end();
    }
  });

  test("applyDelta inside withTenantTx updates current_balance atomically", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money, TenantId, UserId } = await import("@budget/shared-kernel");
    const { withTenantTx } = await import("@budget/platform");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "Delta Test",
      "CASH",
      "PERSONAL",
      "EUR",
      Money.of("200", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(acc);

    const result = await withTenantTx(
      TenantId(testTenantId),
      UserId(testUserId),
      async (tx) => {
        await repo.applyDelta(tx, acc.id, "75");
      },
    );
    expect(result.isOk()).toBe(true);

    const found = await repo.findById(testTenantId, acc.id);
    expect(parseFloat(found!.currentBalance.amount.toFixed(2))).toBe(275);
  });

  test("RLS denies cross-tenant SELECT", async () => {
    const { DrizzleAccountRepo } =
      await import("../src/adapters/persistence/account-repo");
    const repo = new DrizzleAccountRepo();
    const { Account } = await import("../src/domain/account");
    const { Money } = await import("@budget/shared-kernel");

    const acc = new Account(
      crypto.randomUUID(),
      testTenantId,
      "Private Account",
      "CASH",
      "PERSONAL",
      "EUR",
      Money.of("999", "EUR" as any),
      null,
      new Date(),
      testUserId,
    );
    await repo.create(acc);

    // Different tenant ID — should not find the account
    const otherTenantId = crypto.randomUUID();
    const found = await repo.findById(otherTenantId, acc.id);
    expect(found).toBeNull();
  });
});
