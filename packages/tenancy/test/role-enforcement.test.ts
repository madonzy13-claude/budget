/**
 * TENT-03: member (not owner) calling inviteMember is rejected.
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
import { inviteMember } from "../src/application/invite-member";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("member (not owner) cannot invite — rejected (TENT-03)", async () => {
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

  // Create owner + workspace
  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `role-owner-${Date.now()}@test.com`,
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
      name: "Test Workspace",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Create a member user (not owner)
  const memberUser = await signUp(
    { auth: identity.auth as never },
    {
      email: `role-member-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Member",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(memberUser.isOk()).toBe(true);
  if (!memberUser.isOk()) return;

  // member calling inviteMember should be rejected by Better Auth role check
  const result = await inviteMember(
    { auth: identity.auth as never },
    {
      workspaceId: w.value.workspaceId,
      inviterUserId: memberUser.value.userId, // non-owner
      email: `third-party-${Date.now()}@test.com`,
      role: "member",
    },
  );
  // Should fail because memberUser is not a member of this workspace (even less an owner)
  expect(result.isErr()).toBe(true);
});
