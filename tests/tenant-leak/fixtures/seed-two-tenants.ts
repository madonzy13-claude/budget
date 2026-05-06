/**
 * seed-two-tenants.ts
 *
 * PC-20: This fixture exercises the same code path the leak gate is protecting
 * (application service → tenant-aware writes via app_role with NOBYPASSRLS).
 * Seeding through migrator credentials would bypass the application boundary
 * and provide false confidence.
 *
 * Seeds two tenants via app_role + application services (signUp + createWorkspace).
 * Uses only the app_role connection (DATABASE_URL_APP) via application services.
 *
 * Returns { tenantA, tenantB, aliceId, bobId } for use in leak assertions.
 */
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { signUp } from "@budget/identity/src/application/sign-up";
import { createWorkspace } from "@budget/tenancy/src/application/create-workspace";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";

export interface SeedResult {
  tenantA: TenantId;
  tenantB: TenantId;
  aliceId: UserId;
  bobId: UserId;
}

// Stub email sender (tests don't send real email)
const noopEmailSender = {
  send: async () => {},
};

// Stub key store (tests don't need real crypto keys)
const noopKeyStore = {
  deriveKey: async (_userId: string) => new Uint8Array(32),
  storeKey: async () => {},
  deleteKey: async () => {},
};

let cached: SeedResult | undefined;

/**
 * PC-20: Seeds two tenants using the application service boundary (signUp + createWorkspace).
 * Idempotent within a test process — returns cached result on subsequent calls.
 *
 * Tenant topology:
 *   - tenantA: PRIVATE workspace owned by alice (alice@example.test)
 *   - tenantB: SHARED workspace owned by alice, bob as member (bob@example.test)
 */
export async function seedTwoTenants(): Promise<SeedResult> {
  if (cached) return cached;

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const identityModule = createIdentityModule({
    emailSender: noopEmailSender as Parameters<
      typeof createIdentityModule
    >[0]["emailSender"],
    keyStore: noopKeyStore as Parameters<
      typeof createIdentityModule
    >[0]["keyStore"],
  });

  const tenancyModule = createTenancyModule({
    emailSender: noopEmailSender as Parameters<
      typeof createTenancyModule
    >[0]["emailSender"],
    appUrl,
  });

  const auth = identityModule.auth as Parameters<typeof signUp>[0]["auth"] &
    Parameters<typeof createWorkspace>[0]["auth"];

  // Sign up alice
  const aliceResult = await signUp({ auth }, {
    email: "alice@example.test",
    password: "AliceP@ss1",
    name: "Alice Test",
    locale: "en",
    displayCurrency: "USD",
  });
  if (aliceResult.isErr()) {
    // May already exist from a prior test run in the same container — that's OK
    if (!aliceResult.error.message.includes("already")) {
      throw new Error(`signUp alice failed: ${aliceResult.error.message}`);
    }
  }

  // Sign up bob
  const bobResult = await signUp({ auth }, {
    email: "bob@example.test",
    password: "BobP@ss1",
    name: "Bob Test",
    locale: "en",
    displayCurrency: "USD",
  });
  if (bobResult.isErr()) {
    if (!bobResult.error.message.includes("already")) {
      throw new Error(`signUp bob failed: ${bobResult.error.message}`);
    }
  }

  // Retrieve user IDs via Better Auth admin API
  const aliceUser = await (auth as { api: { getUserByEmail: (opts: { query: { email: string } }) => Promise<{ id: string } | null> } }).api
    .getUserByEmail({ query: { email: "alice@example.test" } });
  const bobUser = await (auth as { api: { getUserByEmail: (opts: { query: { email: string } }) => Promise<{ id: string } | null> } }).api
    .getUserByEmail({ query: { email: "bob@example.test" } });

  if (!aliceUser?.id) throw new Error("alice user not found after signUp");
  if (!bobUser?.id) throw new Error("bob user not found after signUp");

  const aliceId = UserId(aliceUser.id);
  const bobId = UserId(bobUser.id);

  // Create tenantA: PRIVATE workspace owned by alice
  const wsAResult = await createWorkspace({ auth }, {
    name: "Tenant-A WS",
    kind: "PRIVATE",
    default_currency: "USD",
    ownerUserId: aliceId,
  });
  if (wsAResult.isErr()) {
    throw new Error(`createWorkspace tenantA failed: ${wsAResult.error.message}`);
  }

  // Create tenantB: SHARED workspace owned by alice (bob will be added as member)
  const wsBResult = await createWorkspace({ auth }, {
    name: "Tenant-B WS",
    kind: "SHARED",
    default_currency: "USD",
    ownerUserId: aliceId,
  });
  if (wsBResult.isErr()) {
    throw new Error(`createWorkspace tenantB failed: ${wsBResult.error.message}`);
  }

  const tenantA = TenantId(wsAResult.value.workspaceId);
  const tenantB = TenantId(wsBResult.value.workspaceId);

  // Write one audit_history row per tenant via withTenantTx (proves tenant-scoped writes)
  await withTenantTx(tenantA, aliceId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO shared_kernel.audit_history
        (tenant_id, actor_user_id, entity_type, entity_id, action, diff_jsonb)
      VALUES
        (${tenantA}, ${aliceId}, 'workspace', ${tenantA}, 'created', '{}'::jsonb)
    `);
  });

  await withTenantTx(tenantB, aliceId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO shared_kernel.audit_history
        (tenant_id, actor_user_id, entity_type, entity_id, action, diff_jsonb)
      VALUES
        (${tenantB}, ${aliceId}, 'workspace', ${tenantB}, 'created', '{}'::jsonb)
    `);
  });

  // Write one expense_ledger row per tenant (proves T-13 cross-tenant filter)
  await withTenantTx(tenantA, aliceId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (tenant_id, created_by_user_id, category_id, amount_cents, currency, happened_on, notes)
      VALUES
        (${tenantA}, ${aliceId}, 'cat-a1', 1000, 'USD', CURRENT_DATE, 'seed tenantA')
    `);
  });

  await withTenantTx(tenantB, aliceId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO budgeting.expense_ledger
        (tenant_id, created_by_user_id, category_id, amount_cents, currency, happened_on, notes)
      VALUES
        (${tenantB}, ${aliceId}, 'cat-b1', 2000, 'USD', CURRENT_DATE, 'seed tenantB')
    `);
  });

  cached = { tenantA, tenantB, aliceId, bobId };
  return cached;
}
