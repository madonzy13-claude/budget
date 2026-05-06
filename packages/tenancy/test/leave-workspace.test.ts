/**
 * TENT-05, TENT-06: member can leave SHARED; sole owner CANNOT leave.
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
import { leaveWorkspace } from "../src/application/leave-workspace";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("sole owner CANNOT leave (TENT-05)", async () => {
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
      email: `leave-sole-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "SoleOwner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  if (!owner.isOk()) return;

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Solo WS",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Sole owner tries to leave
  const result = await leaveWorkspace(
    { auth: identity.auth as never, workspaceRepo: tenancy.workspaceRepo },
    { workspaceId: w.value.workspaceId, userId: owner.value.userId },
  );
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toMatch(/transfer ownership/i);
  }
});

test("member can leave SHARED workspace (TENT-06)", async () => {
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
      email: `leave-owner2-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner2",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  const member = await signUp(
    { auth: identity.auth as never },
    {
      email: `leave-member2-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Member2",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  expect(member.isOk()).toBe(true);
  if (!owner.isOk() || !member.isOk()) return;

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Leave Test WS",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Add member via direct API
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

  // Member leaves
  const result = await leaveWorkspace(
    { auth: identity.auth as never, workspaceRepo: tenancy.workspaceRepo },
    {
      workspaceId: w.value.workspaceId,
      userId: member.value.userId,
    },
  );
  expect(result.isOk()).toBe(true);
});
