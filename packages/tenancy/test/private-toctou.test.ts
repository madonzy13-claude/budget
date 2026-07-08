/**
 * Kind-removal regression (was PC-11 TOCTOU): the PRIVATE-cap trigger that
 * blocked a 2nd member is GONE. A formerly-PRIVATE workspace (single owner
 * seat) now accepts additional members. This is the DB-level counterpart to
 * the route-level invite test (apps/api/test/routes/budget-invitations.test.ts).
 *
 * RED on pre-removal schema (both inserts rejected by the trigger →
 * successes=0); GREEN once the trigger is dropped (both inserts succeed).
 * Integration test.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { createIdentityModule } from "@budget/identity";
import { signUpHelper as signUp } from "./helpers";
import { createTenancyModule } from "@budget/tenancy";
import { createWorkspace } from "../src/application/create-workspace";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("kind-removal: formerly-PRIVATE workspace accepts additional members (no PRIVATE-cap trigger)", async () => {
  const sender = new StdoutEmailSender();
  const tenancy = createTenancyModule({
    emailSender: sender,
    appUrl: "http://localhost:3000",
  });
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
    additionalPlugins: [tenancy.organizationPlugin],
    additionalSchema: tenancy.betterAuthSchema,
  });

  // Create owner and PRIVATE workspace (owner occupies the single seat)
  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `toctou-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  if (!owner.isOk()) return;

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Private TOCTOU Test",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Verify 1 member exists (the owner). Read inside the budget's tenant context
  // so RLS (budget_id = ANY(app.tenant_ids)) exposes the membership rows.
  const membersCheck = await withTenantTx(
    TenantId(w.value.workspaceId),
    UserId(owner.value.userId),
    async (tx) => {
      const r = await tx.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM tenancy.budget_members WHERE budget_id = ${w.value.workspaceId}`,
      );
      return parseInt(r.rows[0]?.count ?? "0", 10);
    },
  );
  expect(membersCheck.isOk()).toBe(true);
  if (membersCheck.isOk()) {
    expect(membersCheck.value).toBe(1);
  }

  // Two REAL additional users (FK to identity.users must be satisfied — the
  // pre-removal trigger raised BEFORE the FK check, which is why the old test
  // could use fake UUIDs; with the trigger gone the FK is now reached).
  const member1 = await signUp(
    { auth: identity.auth as never },
    {
      email: `toctou-m1-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Member One",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  const member2 = await signUp(
    { auth: identity.auth as never },
    {
      email: `toctou-m2-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Member Two",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(member1.isOk()).toBe(true);
  expect(member2.isOk()).toBe(true);
  if (!member1.isOk() || !member2.isOk()) return;

  // Both add a member into the formerly-PRIVATE workspace. With the PRIVATE-cap
  // trigger removed, BOTH inserts succeed — the single-seat rule is gone.
  const tasks = [member1.value.userId, member2.value.userId].map((uid) =>
    withTenantTx(TenantId(w.value.workspaceId), UserId(uid), async (tx) => {
      await tx.execute(
        sql`INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
            VALUES (gen_random_uuid(), ${w.value.workspaceId}, ${uid}::uuid, 'member', NOW())`,
      );
    }),
  );
  const results = await Promise.all(tasks);

  const successes = results.filter((r) => r.isOk()).length;
  const failures = results.filter((r) => r.isErr()).length;

  // No PRIVATE-cap trigger → both members are admitted.
  expect(successes).toBe(2);
  expect(failures).toBe(0);

  // Final membership: owner + the two new members = 3.
  const finalCount = await withTenantTx(
    TenantId(w.value.workspaceId),
    UserId(owner.value.userId),
    async (tx) => {
      const r = await tx.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM tenancy.budget_members WHERE budget_id = ${w.value.workspaceId}`,
      );
      return parseInt(r.rows[0]?.count ?? "0", 10);
    },
  );
  expect(finalCount.isOk()).toBe(true);
  if (finalCount.isOk()) {
    expect(finalCount.value).toBe(3);
  }
});
