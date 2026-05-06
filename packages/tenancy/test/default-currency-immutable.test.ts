/**
 * TENT-11, D-04: default_currency is immutable post-create.
 * Tests BOTH app-layer hook AND DB trigger.
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

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

test("app-layer hook rejects default_currency update (TENT-11, D-04)", async () => {
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
      email: `currency-${Date.now()}@test.com`,
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
      name: "Currency Test",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Try to update via app layer hook — should throw
  let thrown = false;
  try {
    const api = identity.auth as unknown as {
      api: {
        updateOrganization: (opts: {
          body: Record<string, unknown>;
        }) => Promise<void>;
      };
    };
    await api.api.updateOrganization({
      body: {
        organizationId: w.value.workspaceId,
        default_currency: "EUR",
        userId: owner.value.userId,
      },
    });
  } catch (e) {
    thrown = true;
    expect((e as Error).message).toMatch(/immutable/i);
  }
  expect(thrown).toBe(true);
});

test("DB trigger blocks direct SQL UPDATE of default_currency (TENT-11, D-04)", async () => {
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
      email: `currency2-${Date.now()}@test.com`,
      password: "changeme1234",
      name: "Owner2",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  if (!owner.isOk()) return;

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Currency Test 2",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) return;

  // Bypass app layer — raw SQL UPDATE should be blocked by DB trigger
  const r = await withInfraTx(async (tx) => {
    await tx.execute(
      sql`UPDATE tenancy.workspaces SET default_currency = 'EUR' WHERE id = ${w.value.workspaceId}`,
    );
  });
  expect(r.isErr()).toBe(true);
  if (r.isErr()) {
    expect(r.error.message).toMatch(/immutable/i);
  }
});
