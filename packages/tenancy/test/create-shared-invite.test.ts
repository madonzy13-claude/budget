/**
 * TENT-02, TENT-09: createWorkspace SHARED + invite member → invitation email sent.
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

test("SHARED workspace invite sends email via EmailSender port (TENT-02, TENT-09)", async () => {
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

  // Create owner
  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `shared-owner-${Date.now()}@test.com`,
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
      name: "Family Budget",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  const inviteeEmail = `invitee-${Date.now()}@test.com`;
  const inv = await inviteMember(
    { auth: identity.auth as never },
    {
      workspaceId: w.value.workspaceId,
      inviterUserId: owner.value.userId,
      email: inviteeEmail,
      role: "member",
    },
  );
  expect(inv.isOk()).toBe(true);

  // Invitation email should have been sent via StdoutEmailSender
  const inviteEmail = sender.sent.find(
    (e) => e.template === "workspace-invite" && e.to === inviteeEmail,
  );
  expect(inviteEmail).toBeDefined();
  expect(inviteEmail?.vars.workspace).toBe("Family Budget");
});
