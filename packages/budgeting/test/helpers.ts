/**
 * Test helpers for @budget/budgeting integration tests.
 * Mirrors packages/tenancy/test/helpers.ts pattern.
 * dep-cruiser permits test-only cross-package imports.
 */
import { ok, err, type Result, FakeClock } from "@budget/shared-kernel";

// ---------------------------------------------------------------------------
// Tenant / user fixture helpers
// ---------------------------------------------------------------------------

type AnyAuth = {
  api: {
    signUpEmail: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ user: { id: string } }>;
    createOrganization?: (opts: {
      body: Record<string, unknown>;
      headers?: Record<string, string>;
    }) => Promise<{ id: string }>;
  };
};

export interface FreshTenantResult {
  userId: string;
  tenantId: string;
}

/**
 * Creates a fresh user + workspace (tenant) for isolation in integration tests.
 * Wraps Better Auth signUpEmail + createOrganization.
 * Returns Result to let callers handle failures explicitly.
 */
export async function freshTenant(
  deps: { auth: AnyAuth },
  overrides: Partial<{
    email: string;
    password: string;
    name: string;
    locale: string;
    displayCurrency: string;
    workspaceName: string;
  }> = {},
): Promise<Result<FreshTenantResult, Error>> {
  const email = overrides.email ?? `test-${Date.now()}@example.com`;
  const password = overrides.password ?? "Test1234!";
  const name = overrides.name ?? "Test User";
  const locale = overrides.locale ?? "en";
  const displayCurrency = overrides.displayCurrency ?? "USD";
  const workspaceName = overrides.workspaceName ?? `Workspace-${Date.now()}`;

  try {
    const signUpResult = await deps.auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        locale,
        display_currency: displayCurrency,
      },
    });
    const userId = signUpResult.user.id;

    let tenantId = "";
    if (deps.auth.api.createOrganization) {
      const org = await deps.auth.api.createOrganization({
        body: { name: workspaceName, slug: workspaceName.toLowerCase() },
        headers: { "x-user-id": userId },
      });
      tenantId = org.id;
    }

    return ok({ userId, tenantId });
  } catch (e) {
    return err(e as Error);
  }
}

// ---------------------------------------------------------------------------
// Transaction / RLS fixture helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a function in a tenant transaction context.
 * The actual withTenantTx implementation is in @budget/platform.
 * This wrapper sets the RLS context before calling the fn.
 * Real DB connection supplied via DATABASE_URL_APP env.
 *
 * tenantId and userId are plain strings here (cast to branded types internally).
 */
export async function withTenantTxFixture<T>(
  tenantId: string,
  userId: string,
  fn: (tx: unknown) => Promise<T>,
): Promise<Result<T, Error>> {
  // Dynamic import keeps this helper free of direct pool imports at module-load time
  const { withTenantTx } =
    (await import("@budget/platform")) as typeof import("@budget/platform");
  const { TenantId: mkTenantId, UserId: mkUserId } =
    await import("@budget/shared-kernel");
  // Cast plain strings to branded types — test-only, not production code
  const result = await withTenantTx(
    mkTenantId(tenantId),
    mkUserId(userId),
    fn as Parameters<typeof withTenantTx<T>>[2],
  );
  return result as Result<T, Error>;
}

// ---------------------------------------------------------------------------
// FX rate seed helper (works after plan 02-02 schema push)
// ---------------------------------------------------------------------------

export interface SeedFxRateInput {
  base: string;
  quote: string;
  date: string; // ISO 'YYYY-MM-DD'
  rate: string; // decimal string
}

/**
 * Inserts a synthetic FX rate row into budgeting.fx_rates for tests.
 * Requires DATABASE_URL_APP env + plan 02-02 migration applied.
 */
export async function seedFxRate(
  tenantId: string,
  input: SeedFxRateInput,
): Promise<Result<void, Error>> {
  const dbUrl = process.env.DATABASE_URL_APP;
  if (!dbUrl) return err(new Error("DATABASE_URL_APP not set"));
  try {
    // Raw insert — avoids Drizzle schema coupling before plan 02-02 push
    const { sql } = await import("drizzle-orm");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: dbUrl });
    const db = drizzle(pool);
    await db.execute(
      sql`INSERT INTO budgeting.fx_rates (tenant_id, base_currency, quote_currency, rate_date, rate, source)
          VALUES (${tenantId}::uuid, ${input.base}, ${input.quote}, ${input.date}::date, ${input.rate}::numeric, 'test')
          ON CONFLICT DO NOTHING`,
    );
    await pool.end();
    return ok(undefined);
  } catch (e) {
    return err(e as Error);
  }
}

// ---------------------------------------------------------------------------
// Time freeze helper
// ---------------------------------------------------------------------------

/**
 * Returns a FakeClock frozen at the given ISO timestamp.
 * Pass to domain services in tests to control "now".
 */
export function freezeTime(iso: string): FakeClock {
  return new FakeClock(new Date(iso));
}
