/**
 * PC-11 TOCTOU regression test: PRIVATE-cap trigger blocks concurrent 2nd member inserts.
 * Integration test.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore, withInfraTx, withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { sql } from "drizzle-orm";
import { createIdentityModule } from "@budget/identity";
import { signUpHelper as signUp } from "./helpers";
import { createTenancyModule } from "@budget/tenancy";
import { createWorkspace } from "../src/application/create-workspace";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("PC-11 PRIVATE-cap trigger blocks 2nd member — owner already occupies seat", async () => {
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

  // Verify 1 member exists (the owner)
  const membersCheck = await withInfraTx(async (tx) => {
    const r = await tx.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM tenancy.workspace_members WHERE workspace_id = ${w.value.workspaceId}`,
    );
    return parseInt(r.rows[0]?.count ?? "0", 10);
  });
  expect(membersCheck.isOk()).toBe(true);
  if (membersCheck.isOk()) {
    expect(membersCheck.value).toBe(1);
  }

  // Generate 2 distinct fake user UUIDs for concurrent insert attempts
  const user1 = "11111111-1111-1111-1111-111111111111";
  const user2 = "22222222-2222-2222-2222-222222222222";

  // Both attempts try to INSERT a 2nd member into the PRIVATE workspace.
  // Since the workspace already has 1 member (the owner), BOTH should fail with the trigger.
  const tasks = [user1, user2].map((uid) =>
    withTenantTx(TenantId(w.value.workspaceId), UserId(uid), async (tx) => {
      await tx.execute(
        sql`INSERT INTO tenancy.workspace_members (id, workspace_id, user_id, role, created_at)
            VALUES (gen_random_uuid(), ${w.value.workspaceId}, ${uid}::uuid, 'member', NOW())`,
      );
    }),
  );
  const results = await Promise.all(tasks);

  const successes = results.filter((r) => r.isOk()).length;
  const failures = results.filter((r) => r.isErr()).length;

  // Both should fail because the owner already occupies the single seat
  expect(successes).toBe(0);
  expect(failures).toBe(2);

  results.forEach((r) => {
    if (r.isErr()) {
      expect(r.error.message).toMatch(
        /PRIVATE workspaces accept only the owner/,
      );
    }
  });
});
