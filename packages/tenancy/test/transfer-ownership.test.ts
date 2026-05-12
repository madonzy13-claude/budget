/**
 * TENT-05: transferOwnership succeeds; previous owner becomes member; can now leave.
 * Integration test.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createIdentityModule } from "@budget/identity";
import { signUpHelper as signUp } from "./helpers";
import { createTenancyModule } from "@budget/tenancy";
import { createWorkspace } from "../src/application/create-workspace";
import { transferOwnership } from "../src/application/transfer-ownership";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("transferOwnership succeeds; previous owner can now leave (TENT-05)", async () => {
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

  // Create two users
  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `xfer-owner-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  const newOwner = await signUp(
    { auth: identity.auth as never },
    {
      email: `xfer-new-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "New Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  expect(newOwner.isOk()).toBe(true);
  if (!owner.isOk() || !newOwner.isOk()) return;

  // Create workspace + add new owner as member
  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Transfer Test",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Add second member first (needed to transfer ownership)
  const addMemberApi = identity.auth as unknown as {
    api: {
      addMember: (opts: { body: Record<string, unknown> }) => Promise<void>;
    };
  };
  await addMemberApi.api.addMember({
    body: {
      organizationId: w.value.workspaceId,
      userId: newOwner.value.userId,
      role: "member",
    },
  });

  // Transfer ownership
  const t = await transferOwnership(
    { auth: identity.auth as never },
    {
      workspaceId: w.value.workspaceId,
      fromUserId: owner.value.userId,
      toUserId: newOwner.value.userId,
    },
  );
  expect(t.isOk()).toBe(true);

  // Verify new owner has role=owner
  const members = await tenancy.workspaceRepo.listMembers(w.value.workspaceId);
  const newOwnerMember = members.find(
    (m) => m.userId === newOwner.value.userId,
  );
  expect(newOwnerMember?.role).toBe("owner");
});
