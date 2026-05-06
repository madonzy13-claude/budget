/**
 * TENT-13, D-06: SHARED owner updates shares; sum=100 enforced; audit_history row written.
 * Integration test.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withInfraTx } from "@budget/platform";
import { sql } from "drizzle-orm";
import { createIdentityModule } from "@budget/identity";
import { signUpHelper as signUp } from "./helpers";
import { createTenancyModule } from "@budget/tenancy";
import { createWorkspace } from "../src/application/create-workspace";
import { updateShares } from "../src/application/update-shares";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("owner updates shares to sum=100 — audit_history row written (TENT-13, D-06)", async () => {
  const sender = new StdoutEmailSender();
  const tenancy = createTenancyModule({
    emailSender: sender,
    appUrl: "http://localhost:3000",
  });
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
    additionalPlugins: [tenancy.organizationPlugin],
  });

  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `shares-owner-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  const member = await signUp(
    { auth: identity.auth as never },
    {
      email: `shares-member-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Member",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  expect(member.isOk()).toBe(true);
  if (!owner.isOk() || !member.isOk()) return;

  // Create SHARED workspace
  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Share Test WS",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Add member
  const api = identity.auth as unknown as {
    api: {
      addMember: (opts: { body: Record<string, unknown> }) => Promise<void>;
    };
  };
  await api.api.addMember({
    body: {
      organizationId: w.value.workspaceId,
      userId: member.value.userId,
      role: "member",
    },
  });

  // Update shares to 60/40
  const update = await updateShares(
    {
      memberShareRepo: tenancy.memberShareRepo,
      workspaceRepo: tenancy.workspaceRepo,
    },
    {
      workspaceId: w.value.workspaceId,
      ownerUserId: owner.value.userId,
      shares: [
        { userId: owner.value.userId, percentage: "60" },
        { userId: member.value.userId, percentage: "40" },
      ],
    },
  );
  expect(update.isOk()).toBe(true);

  // Verify shares persisted
  const shares = await tenancy.memberShareRepo.list(w.value.workspaceId);
  expect(shares.length).toBe(2);
  const total = shares.reduce((sum, s) => sum + parseFloat(s.percentage), 0);
  expect(total).toBe(100);

  // Verify audit_history row written (using infrastructure tx)
  const auditResult = await withInfraTx(async (tx) => {
    const r = await tx.execute<{ entity_id: string }>(
      sql`SELECT entity_id FROM shared_kernel.audit_history
          WHERE entity_type = 'shared_workspace_member_shares'
          AND entity_id = ${w.value.workspaceId}
          ORDER BY id DESC LIMIT 1`,
    );
    return r.rows[0] ?? null;
  });
  expect(auditResult.isOk()).toBe(true);
  if (auditResult.isOk()) {
    expect(auditResult.value).not.toBeNull();
  }
});

test("shares summing to 99 throws (TENT-13)", async () => {
  const sender = new StdoutEmailSender();
  const tenancy = createTenancyModule({
    emailSender: sender,
    appUrl: "http://localhost:3000",
  });
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
    additionalPlugins: [tenancy.organizationPlugin],
  });

  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `shares-bad-${Date.now()}@test.com`,
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
      name: "Share Bad WS",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Try sum=99 — should fail at domain validation layer
  const result = await updateShares(
    {
      memberShareRepo: tenancy.memberShareRepo,
      workspaceRepo: tenancy.workspaceRepo,
    },
    {
      workspaceId: w.value.workspaceId,
      ownerUserId: owner.value.userId,
      shares: [
        { userId: owner.value.userId, percentage: "50" },
        { userId: "00000000-0000-0000-0000-000000000001", percentage: "49" },
      ],
    },
  );
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toMatch(/sum to 100/);
  }
});
