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
import { Pool } from "pg";

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

// Stub key store (tests don't need real crypto keys, but Better Auth's
// post-create user hook calls keyStore.emailHash + keyStore.generateUserDek
// to populate identity.users.email_hash + shared_kernel.user_keys).
// emailHash MUST be deterministic-per-email so the users_email_hash_uq unique
// index is satisfied across multiple seeded users.
function deterministicHash(input: string): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < input.length; i++) {
    out[i % 32] ^= input.charCodeAt(i);
  }
  return out;
}
const noopKeyStore = {
  deriveKey: async (_userId: string) => new Uint8Array(32),
  storeKey: async () => {},
  deleteKey: async () => {},
  emailHash: async (email: string) => deterministicHash(email.toLowerCase()),
  generateUserDek: async (_userId: string) => ({
    cipherDek: new Uint8Array(64),
    nonce: new Uint8Array(24),
  }),
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

  const tenancyModule = createTenancyModule({
    emailSender: noopEmailSender as Parameters<
      typeof createTenancyModule
    >[0]["emailSender"],
    appUrl: "http://localhost:3000",
  });

  const identityModule = createIdentityModule({
    emailSender: noopEmailSender as Parameters<
      typeof createIdentityModule
    >[0]["emailSender"],
    keyStore: noopKeyStore as Parameters<
      typeof createIdentityModule
    >[0]["keyStore"],
    additionalPlugins: [tenancyModule.organizationPlugin],
    additionalSchema: tenancyModule.betterAuthSchema,
  });

  // auth is the Better Auth instance; createWorkspace calls auth.api.createOrganization
  const auth = identityModule.auth as Parameters<typeof signUp>[0]["auth"] &
    Parameters<typeof createWorkspace>[0]["auth"];

  // Sign up alice
  const aliceResult = await signUp(
    { auth },
    {
      email: "alice@example.test",
      password: "AliceP@ss1",
      name: "Alice Test",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (aliceResult.isErr()) {
    // May already exist from a prior test run in the same container — that's OK
    if (!aliceResult.error.message.includes("already")) {
      throw new Error(`signUp alice failed: ${aliceResult.error.message}`);
    }
  }

  // Sign up bob
  const bobResult = await signUp(
    { auth },
    {
      email: "bob@example.test",
      password: "BobP@ssword1",
      name: "Bob Test",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (bobResult.isErr()) {
    if (!bobResult.error.message.includes("already")) {
      throw new Error(`signUp bob failed: ${bobResult.error.message}`);
    }
  }

  // Retrieve user IDs by raw SQL — Better Auth's stock API doesn't expose
  // getUserByEmail without the admin plugin. PC-28 raw-client carve-out applies.
  const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL_APP!,
  });
  const aliceRow = (
    await adminPool.query<{ id: string }>(
      "SELECT id FROM identity.users WHERE lower(email) = $1",
      ["alice@example.test"],
    )
  ).rows[0];
  const bobRow = (
    await adminPool.query<{ id: string }>(
      "SELECT id FROM identity.users WHERE lower(email) = $1",
      ["bob@example.test"],
    )
  ).rows[0];
  await adminPool.end();
  if (!aliceRow?.id) throw new Error("alice user not found after signUp");
  if (!bobRow?.id) throw new Error("bob user not found after signUp");

  const aliceId = UserId(aliceRow.id);
  const bobId = UserId(bobRow.id);

  // Create tenantA: PRIVATE workspace owned by alice
  const wsAResult = await createWorkspace(
    { auth },
    {
      name: "Tenant-A WS",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: aliceId,
    },
  );
  if (wsAResult.isErr()) {
    throw new Error(
      `createWorkspace tenantA failed: ${wsAResult.error.message}`,
    );
  }

  // Create tenantB: SHARED workspace owned by alice (bob will be added as member)
  const wsBResult = await createWorkspace(
    { auth },
    {
      name: "Tenant-B WS",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: aliceId,
    },
  );
  if (wsBResult.isErr()) {
    throw new Error(
      `createWorkspace tenantB failed: ${wsBResult.error.message}`,
    );
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
