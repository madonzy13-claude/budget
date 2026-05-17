/**
 * category-reserve-adjustments-repo.test.ts — Integration tests for
 * CategoryReserveAdjustmentsRepo, ReservesSummaryRepo, and
 * CategoriesRepo.setReserveExcluded (Plan 05-02, TDD RED phase).
 *
 * Real Postgres required (DATABASE_URL_APP). No DB mocks per CLAUDE.md.
 * Fixture pattern mirrors reserve-balance-repo.test.ts (account-repo.test.ts:25-60).
 *
 * Schema note: audit rows live in shared_kernel.audit_history;
 * outbox rows in shared_kernel.outbox (not platform.*).
 * All direct-SQL verification queries set app.tenant_ids GUC so RLS passes.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for integration tests");
// Test runner is on host; replace Docker-network hostname with localhost
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

// Migrator URL for verifying tables app_role can't SELECT (outbox worker_role only)
// app_role has INSERT only on shared_kernel.outbox; use migrator (BYPASSRLS) for outbox checks
const DB_URL_MIGRATOR = (process.env.DATABASE_URL_MIGRATOR ?? "").replace(
  "@db:",
  "@localhost:",
);

const { resetPools } = await import("@budget/platform");
resetPools();

// ──────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ──────────────────────────────────────────────────────────────────────────────

interface Fixture {
  userId: string;
  budgetId: string;
  categoryId: string;
}

/**
 * Helper: run a verification query with tenant GUC set so RLS allows SELECT.
 * Uses migrator URL if available (BYPASSRLS); falls back to app_role with GUC.
 */
async function verifyQuery<T extends Record<string, unknown>>(
  budgetId: string,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  try {
    // Wrap in explicit transaction so set_config(local=true) persists for the SELECT
    await client.query("BEGIN");
    // Set GUC so RLS policies allow SELECT within this transaction
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    const rs = await client.query(query, params);
    await client.query("COMMIT");
    return rs.rows as T[];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createFixture(): Promise<Fixture> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Adj Test User', true, now(), now())`,
      [userId, `adj-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets (id, slug, name, kind, default_currency, owner_user_id, member_count, created_at)
       VALUES ($1, $2, 'Adj Budget', 'PRIVATE', 'EUR', $3, 1, now())`,
      [budgetId, `adj-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Test Category', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  return { userId, budgetId, categoryId };
}

async function seedWallet(
  budgetId: string,
  userId: string,
  walletType: "RESERVE" | "SPENDINGS",
  currentBalance: number,
  archived = false,
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
         (id, tenant_id, name, wallet_type, currency, current_balance, archived_at, created_at, actor_user_id)
       VALUES ($1, $2, 'Test Wallet', $3, 'EUR', $4, $5, now(), $6)`,
      [
        walletId,
        budgetId,
        walletType,
        currentBalance,
        archived ? new Date().toISOString() : null,
        userId,
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
  return walletId;
}

// ──────────────────────────────────────────────────────────────────────────────
// Import adapters under test
// ──────────────────────────────────────────────────────────────────────────────

const { DrizzleCategoryReserveAdjustmentsRepo } =
  await import("../../src/adapters/persistence/category-reserve-adjustments-repo");
const { DrizzleReservesSummaryRepo } =
  await import("../../src/adapters/persistence/reserves-summary-repo");
const { DrizzleCategoriesRepo } =
  await import("../../src/adapters/persistence/categories-repo");

// ──────────────────────────────────────────────────────────────────────────────
// CategoryReserveAdjustmentsRepo
// ──────────────────────────────────────────────────────────────────────────────

describe("CategoryReserveAdjustmentsRepo — create", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  test("creates one row visible via direct SQL", async () => {
    const repo = new DrizzleCategoryReserveAdjustmentsRepo();
    const result = await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 100000n,
      note: "test adjustment",
      actorUserId: fix.userId,
    });

    expect(result.id).toBeTruthy();
    expect(result.occurredAt).toBeInstanceOf(Date);

    // Direct SQL verify — set GUC so RLS allows SELECT
    const rows = await verifyQuery<{
      id: string;
      delta_cents: string;
      note: string;
    }>(
      fix.budgetId,
      `SELECT id, delta_cents::text, note, occurred_at
       FROM budgeting.category_reserve_adjustments
       WHERE id = $1`,
      [result.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("test adjustment");
    expect(BigInt(rows[0].delta_cents)).toBe(100000n);
  });

  test("occurredAt is close to now()", async () => {
    const repo = new DrizzleCategoryReserveAdjustmentsRepo();
    const before = Date.now();
    const result = await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 500n,
      actorUserId: fix.userId,
    });
    const after = Date.now();
    const ts = result.occurredAt.getTime();
    // within 10 seconds of request
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 10000);
  });

  test("audit row exists with entity_type=category_reserve_adjustment and action=create", async () => {
    const repo = new DrizzleCategoryReserveAdjustmentsRepo();
    const result = await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 200n,
      actorUserId: fix.userId,
    });

    // shared_kernel.audit_history — set tenant GUC so RLS allows SELECT
    const rows = await verifyQuery<{ entity_type: string; action: string }>(
      fix.budgetId,
      `SELECT entity_type, action FROM shared_kernel.audit_history
       WHERE entity_id = $1`,
      [result.id],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].entity_type).toBe("category_reserve_adjustment");
    expect(rows[0].action).toBe("create");
  });

  test("outbox row exists with event_type=budgeting.reserve.adjusted", async () => {
    const repo = new DrizzleCategoryReserveAdjustmentsRepo();
    const result = await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 300n,
      actorUserId: fix.userId,
    });

    // shared_kernel.outbox: app_role has INSERT only; SELECT requires migrator or worker_role.
    // Use migrator URL (BYPASSRLS) for this verification.
    const connStr = DB_URL_MIGRATOR || DB_URL;
    const pool = new Pool({ connectionString: connStr });
    const client = await pool.connect();
    try {
      const rs = await client.query(
        `SELECT event_type FROM shared_kernel.outbox WHERE aggregate_id = $1`,
        [result.id],
      );
      expect(rs.rows.length).toBeGreaterThanOrEqual(1);
      expect(rs.rows[0].event_type).toBe("budgeting.reserve.adjusted");
    } finally {
      client.release();
      await pool.end();
    }
  });
});

describe("CategoryReserveAdjustmentsRepo — listForCategory", () => {
  let fix: Fixture;
  let repo: InstanceType<typeof DrizzleCategoryReserveAdjustmentsRepo>;

  beforeAll(async () => {
    fix = await createFixture();
    repo = new DrizzleCategoryReserveAdjustmentsRepo();
    // Seed 3 rows
    await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 100n,
      actorUserId: fix.userId,
    });
    await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 200n,
      actorUserId: fix.userId,
    });
    await repo.create({
      tenantId: fix.budgetId,
      categoryId: fix.categoryId,
      deltaCents: 300n,
      actorUserId: fix.userId,
    });
  });

  test("returns rows in DESC occurredAt order", async () => {
    const rows = await repo.listForCategory(fix.budgetId, fix.categoryId, {
      limit: 10,
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].occurredAt.getTime()).toBeGreaterThanOrEqual(
        rows[i].occurredAt.getTime(),
      );
    }
  });

  test("cross-tenant read returns empty array", async () => {
    const rows = await repo.listForCategory(
      crypto.randomUUID(),
      fix.categoryId,
    );
    expect(rows).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// ReservesSummaryRepo
// ──────────────────────────────────────────────────────────────────────────────

describe("ReservesSummaryRepo — sumReserveWalletAmounts", () => {
  let fix: Fixture;

  beforeAll(async () => {
    fix = await createFixture();
  });

  test("returns 0n when no reserve wallets", async () => {
    const repo = new DrizzleReservesSummaryRepo();
    const total = await repo.sumReserveWalletAmounts(fix.budgetId);
    expect(total).toBe(0n);
  });

  test("sums RESERVE wallet current_balance in cents as bigint", async () => {
    const fix2 = await createFixture();
    // Seed: 150.00 EUR = 15000 cents (stored as numeric, SUM * 100 = cents)
    await seedWallet(fix2.budgetId, fix2.userId, "RESERVE", 150);
    await seedWallet(fix2.budgetId, fix2.userId, "RESERVE", 75.5);

    const repo = new DrizzleReservesSummaryRepo();
    const total = await repo.sumReserveWalletAmounts(fix2.budgetId);
    // 150 + 75.50 = 225.50 → 22550 cents
    expect(total).toBe(22550n);
  });

  test("excludes archived wallets", async () => {
    const fix3 = await createFixture();
    await seedWallet(fix3.budgetId, fix3.userId, "RESERVE", 100); // active
    await seedWallet(fix3.budgetId, fix3.userId, "RESERVE", 999, true); // archived — excluded

    const repo = new DrizzleReservesSummaryRepo();
    const total = await repo.sumReserveWalletAmounts(fix3.budgetId);
    expect(total).toBe(10000n); // only the 100 EUR active wallet
  });

  test("ignores SPENDINGS and CUSHION wallets", async () => {
    const fix4 = await createFixture();
    await seedWallet(fix4.budgetId, fix4.userId, "SPENDINGS", 500);
    await seedWallet(fix4.budgetId, fix4.userId, "RESERVE", 50);

    const repo = new DrizzleReservesSummaryRepo();
    const total = await repo.sumReserveWalletAmounts(fix4.budgetId);
    expect(total).toBe(5000n); // only the 50 EUR RESERVE wallet
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// CategoriesRepo.setReserveExcluded
// ──────────────────────────────────────────────────────────────────────────────

describe("CategoriesRepo — setReserveExcluded", () => {
  let fix: Fixture;
  let repo: InstanceType<typeof DrizzleCategoriesRepo>;

  beforeAll(async () => {
    fix = await createFixture();
    repo = new DrizzleCategoriesRepo();
  });

  test("sets reserve_excluded=true and writes audit row", async () => {
    await repo.setReserveExcluded(
      fix.budgetId,
      fix.categoryId,
      true,
      fix.userId,
    );

    // Verify column flipped — set GUC so RLS allows SELECT
    const catRows = await verifyQuery<{ reserve_excluded: boolean }>(
      fix.budgetId,
      `SELECT reserve_excluded FROM budgeting.categories WHERE id = $1`,
      [fix.categoryId],
    );
    expect(catRows).toHaveLength(1);
    expect(catRows[0].reserve_excluded).toBe(true);

    // Verify audit row in shared_kernel.audit_history
    const auditRows = await verifyQuery<{
      action: string;
      after_jsonb: unknown;
    }>(
      fix.budgetId,
      `SELECT action, after_jsonb FROM shared_kernel.audit_history
       WHERE entity_id = $1 AND entity_type = 'category'
       ORDER BY occurred_at DESC LIMIT 1`,
      [fix.categoryId],
    );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    expect(auditRows[0].action).toBe("update");
  });

  test("second call with false flips it back and writes another audit row", async () => {
    // First ensure it's true
    await repo.setReserveExcluded(
      fix.budgetId,
      fix.categoryId,
      true,
      fix.userId,
    );
    // Then flip back
    await repo.setReserveExcluded(
      fix.budgetId,
      fix.categoryId,
      false,
      fix.userId,
    );

    const catRows = await verifyQuery<{ reserve_excluded: boolean }>(
      fix.budgetId,
      `SELECT reserve_excluded FROM budgeting.categories WHERE id = $1`,
      [fix.categoryId],
    );
    expect(catRows).toHaveLength(1);
    expect(catRows[0].reserve_excluded).toBe(false);

    const auditRows = await verifyQuery<{ cnt: string }>(
      fix.budgetId,
      `SELECT count(*) AS cnt FROM shared_kernel.audit_history
       WHERE entity_id = $1 AND entity_type = 'category' AND action = 'update'`,
      [fix.categoryId],
    );
    expect(parseInt(auditRows[0].cnt)).toBeGreaterThanOrEqual(2);
  });
});
