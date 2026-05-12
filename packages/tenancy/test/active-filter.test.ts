/**
 * TENT-12, D-07: setActiveWorkspaces persists; listActiveWorkspaces returns intersection.
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
import { setActiveWorkspaces } from "../src/application/set-active-workspaces";
import { listActiveWorkspaces } from "../src/application/list-active-workspaces";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("setActiveWorkspaces persists; listActiveWorkspaces returns intersection (TENT-12, D-07)", async () => {
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
      email: `active-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "User",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(user.isOk()).toBe(true);
  if (!user.isOk()) return;

  // Create 2 workspaces
  const w1 = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "WS 1",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: user.value.userId,
    },
  );
  const w2 = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "WS 2",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: user.value.userId,
    },
  );
  expect(w1.isOk()).toBe(true);
  expect(w2.isOk()).toBe(true);
  if (!w1.isOk() || !w2.isOk()) return;

  // Set w1 as active; include a fake ID that user is not a member of (should be filtered)
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const set = await setActiveWorkspaces(
    { budgetRepo: tenancy.budgetRepo },
    {
      userId: user.value.userId,
      workspaceIds: [w1.value.workspaceId, fakeId],
    },
  );
  expect(set.isOk()).toBe(true);

  // Fetch back — should only return w1 (fakeId filtered out)
  const active = await listActiveWorkspaces(
    { budgetRepo: tenancy.budgetRepo },
    { userId: user.value.userId },
  );
  expect(active.isOk()).toBe(true);
  if (active.isOk()) {
    expect(active.value.length).toBe(1);
    expect(active.value[0]?.id).toBe(w1.value.workspaceId);
  }
});
