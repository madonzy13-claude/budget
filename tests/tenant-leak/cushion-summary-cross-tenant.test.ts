/**
 * cushion-summary-cross-tenant.test.ts — Tenant-leak gate test for
 * `GET /budgets/:id/cushion-summary` (Phase 7, Plan 07-07).
 *
 * Multi-layered protection mirrored from tasks-cross-tenant.test.ts:
 *
 * Layer 1 — Route handler:
 *   The route reads c.get("tenantIds") and returns 404 when the requested
 *   budgetId is NOT in that verified set. Tested at the HTTP boundary in
 *   apps/api/test/routes/cushion-summary.test.ts.
 *
 * Layer 2 — RLS / adapter (this file):
 *   getCushionSummary opens withTenantTx with a SINGLE tenant id. SELECTing
 *   budgetA's category_limits / wallets while tenantId=B is in the GUC must
 *   return 0 rows — the cushion summary then degenerates to a zero-shortfall
 *   payload, never leaking budgetA's amounts.
 *
 * Gate accounting (`make ci-gate` → tests/tenant-leak/*.test.ts):
 *   - force-rls-on-all-tables
 *   - in-process-bus-tenant-scope
 *   - job-without-tenant-errors
 *   - no-guc-zero-rows
 *   - pg-roles-no-bypassrls
 *   - home-summary-cross-tenant
 *   - tasks-cross-tenant
 *   - cushion-summary-cross-tenant (THIS FILE)
 * Total: 8 files.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { Pool } from "pg";

const DB_URL_RAW = process.env.DATABASE_URL_APP;
if (!DB_URL_RAW)
  throw new Error("DATABASE_URL_APP required for tenant-leak gate tests");
process.env.DATABASE_URL_APP = DB_URL_RAW.replace("@db:", "@localhost:");
const DB_URL = process.env.DATABASE_URL_APP;

const { resetPools } = await import("@budget/platform");
const { getCushionSummary } =
  await import("@budget/budgeting/src/application/get-cushion-summary");
const { FrankfurterFxProvider } =
  await import("@budget/budgeting/src/adapters/fx/frankfurter");
const { DrizzleFxRateCacheRepo } =
  await import("@budget/budgeting/src/adapters/persistence/fx-rate-cache-repo");
const { workerPool } = await import("@budget/platform");
resetPools();

interface SeededBudget {
  userId: string;
  budgetId: string;
}

async function seedBudgetWithCushion(): Promise<SeededBudget> {
  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  const userId = crypto.randomUUID();
  const budgetId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const limitId = crypto.randomUUID();
  const walletId = crypto.randomUUID();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO identity.users (id, email, name, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Cushion Leak', true, now(), now())`,
      [userId, `cushion-leak-${userId.slice(0, 8)}@example.com`],
    );
    await client.query(
      `INSERT INTO tenancy.budgets
         (id, slug, name, kind, default_currency, owner_user_id, member_count,
          cushion_enabled, cushion_target_months, created_at)
       VALUES ($1, $2, 'Cushion Leak Budget', 'PRIVATE', 'EUR', $3, 1, true, 6, now())`,
      [budgetId, `ws-cleak-${budgetId.slice(0, 8)}`, userId],
    );
    await client.query(
      `INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
       VALUES ($1, $2, $3, 'owner', now())`,
      [crypto.randomUUID(), budgetId, userId],
    );
    await client.query(
      `SELECT set_config('app.tenant_ids', '{"${budgetId}"}', true)`,
    );
    await client.query(
      `SELECT set_config('app.current_user_id', '${userId}', true)`,
    );
    await client.query(
      `INSERT INTO budgeting.categories (id, tenant_id, name, created_at, actor_user_id)
       VALUES ($1, $2, 'Cushion Leak Cat', now(), $3)`,
      [categoryId, budgetId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.category_limits
         (id, tenant_id, category_id, normal_amount, normal_currency, cushion_amount, cushion_currency, effective_from, actor_user_id, created_at)
       VALUES ($1, $2, $3, 0, 'EUR', 50000::bigint, 'EUR', '2026-01-01'::date, $4, now())`,
      [limitId, budgetId, categoryId, userId],
    );
    await client.query(
      `INSERT INTO budgeting.wallets
         (id, tenant_id, name, wallet_type, currency, current_balance, created_at, actor_user_id)
       VALUES ($1, $2, 'Cushion Wallet', 'CUSHION', 'EUR', 100.00::numeric, now(), $3)`,
      [walletId, budgetId, userId],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
  return { userId, budgetId };
}

describe("GET /budgets/:id/cushion-summary tenant isolation", () => {
  let budgetA: SeededBudget;
  let budgetB: SeededBudget;
  let service: ReturnType<typeof getCushionSummary>;

  beforeAll(async () => {
    budgetA = await seedBudgetWithCushion();
    budgetB = await seedBudgetWithCushion();
    const fxCache = new DrizzleFxRateCacheRepo(workerPool());
    const fxProvider = new FrankfurterFxProvider(fxCache);
    service = getCushionSummary({ fxProvider });
  });

  it("Layer 2 (RLS): calling getCushionSummary with tenantId=B but budgetId=A returns zero-shortfall (no budgetA data leaked)", async () => {
    // Defence-in-depth scenario: developer accidentally calls the service with
    // mismatched tenantId / budgetId. withTenantTx pins app.tenant_ids = [B],
    // so SELECT on tenancy.budgets WHERE id=A returns 0 rows under RLS, and
    // the application service throws "Budget not found".
    const r = await service({
      tenantId: budgetB.budgetId,
      budgetId: budgetA.budgetId,
    });
    // RLS hides budgetA → service errs with "Budget not found".
    // No budgetA data (required/actual/shortfall amounts) leaks into the response.
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.message).toMatch(/not found/i);
    }
  });

  it("Layer 2 sanity: same call with tenantId === budgetId returns budgetA's real DTO", async () => {
    const r = await service({
      tenantId: budgetA.budgetId,
      budgetId: budgetA.budgetId,
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.enabled).toBe(true);
      // cushion_amount = 50000 cents (500.00 EUR) × 6 months = 300000 cents required.
      expect(r.value.required_cents).toBe("300000");
      // CUSHION wallet 100.00 EUR = 10000 cents actual.
      expect(r.value.actual_cents).toBe("10000");
      // Shortfall = 300000 − 10000 = 290000 cents.
      expect(r.value.shortfall_cents).toBe("290000");
      expect(r.value.currency).toBe("EUR");
      expect(r.value.target_months).toBe(6);
    }
  });

  it("Layer 2 sanity (inverse): budgetB scope returns budgetB's DTO, NOT budgetA's amounts", async () => {
    // The two budgets are independent — same seed pattern, distinct rows.
    // budgetB's DTO must reflect budgetB's seeded amounts, never budgetA's.
    const rB = await service({
      tenantId: budgetB.budgetId,
      budgetId: budgetB.budgetId,
    });
    const rA = await service({
      tenantId: budgetA.budgetId,
      budgetId: budgetA.budgetId,
    });
    expect(rB.isOk()).toBe(true);
    expect(rA.isOk()).toBe(true);
    if (rB.isOk() && rA.isOk()) {
      // Same numeric values (same seed shape) but distinct tenant contexts.
      // What we ACTUALLY assert: budgetB.required_cents was computed from
      // budgetB's category_limits, not budgetA's. Since seeds are identical
      // by construction, equality of numbers is expected — the leak would be
      // a DIFFERENCE (e.g., budgetB scope summing both tenants' wallets).
      expect(rB.value.required_cents).toBe(rA.value.required_cents);
      expect(rB.value.actual_cents).toBe(rA.value.actual_cents);
      // If RLS were broken, the cross-budget SUM would be 2× the per-budget
      // value. We assert that did NOT happen — the result is the per-budget
      // amount, proving tenant_id WHERE clauses (or RLS) filtered correctly.
      expect(rB.value.actual_cents).toBe("10000"); // 100.00 EUR, NOT 200.00
    }
  });
});
