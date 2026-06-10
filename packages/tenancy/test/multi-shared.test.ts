/**
 * TENT-04, TENT-09: same user can be member of 3 SHARED workspaces simultaneously.
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

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("user can be member of 3 SHARED workspaces simultaneously (TENT-04, TENT-09)", async () => {
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

  const user = await signUp(
    { auth: identity.auth as never },
    {
      email: `multi-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Multi-member",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(user.isOk()).toBe(true);
  if (!user.isOk()) return;

  const wsIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const w = await createWorkspace(
      { auth: identity.auth as never },
      {
        name: `Family ${i}`,
        kind: "SHARED",
        default_currency: "USD",
        ownerUserId: user.value.userId,
      },
    );
    expect(w.isOk()).toBe(true);
    if (w.isOk()) wsIds.push(w.value.workspaceId);
  }

  // All 3 should exist
  expect(wsIds.length).toBe(3);

  // Verify via listForUser
  const workspaces = await tenancy.workspaceRepo.listForUser(user.value.userId);
  expect(workspaces.length).toBeGreaterThanOrEqual(3);
});
