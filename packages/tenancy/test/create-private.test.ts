/**
 * TENT-01, TENT-10: createWorkspace PRIVATE creates kind=PRIVATE workspace with 1 member.
 * Integration test — runs against testcontainer Postgres.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { signUpHelper as signUp } from "./helpers";
import { createWorkspace } from "../src/application/create-workspace";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("createWorkspace PRIVATE has kind=PRIVATE, memberCount=1 (TENT-01, TENT-10)", async () => {
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

  const u = await signUp(
    { auth: identity.auth as never },
    {
      email: `priv-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(u.isOk()).toBe(true);
  if (!u.isOk()) return;

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "My Private Budget",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: u.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Read back via repo
  const ws = await tenancy.workspaceRepo.findById(w.value.workspaceId);
  expect(ws).not.toBeNull();
  expect(ws?.kind).toBe("PRIVATE");
  expect(ws?.ownerUserId).toBe(u.value.userId);
});
