/**
 * Task 4: repo WRITE methods for member aggregation (setMemberShares,
 * setMemberAggregation). Integration test — runs against testcontainer
 * Postgres.
 *
 * No `createSharedBudgetWithTwoMembers` helper exists yet — seed via the
 * same path Task 3's test used (signUpHelper + createWorkspace) for the
 * owner, then add a second member via the repo's own `joinAsMember` (the
 * existing, RLS-safe write path used by share-link accept) rather than a
 * raw INSERT.
 */
import { test, expect, beforeAll } from "bun:test";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { signUpHelper as signUp } from "./helpers";
import { createWorkspace } from "../src/application/create-workspace";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";

beforeAll(async () => {
  await startTestcontainer();
}, 120_000);

async function createSharedBudgetWithTwoMembers() {
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

  const owner = await signUp(
    { auth: identity.auth as never },
    {
      email: `agg-writes-owner-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(owner.isOk()).toBe(true);
  if (!owner.isOk()) throw new Error("owner signup failed");

  const member = await signUp(
    { auth: identity.auth as never },
    {
      email: `agg-writes-member-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: "Member",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(member.isOk()).toBe(true);
  if (!member.isOk()) throw new Error("member signup failed");

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Agg Writes Budget",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) throw new Error("createWorkspace failed");

  const budgetId = w.value.workspaceId;
  const ownerUserId = owner.value.userId;
  const memberUserId = member.value.userId;

  const repo = new DrizzleBudgetRepo();
  // joinAsMember is the existing RLS-safe write path (share-link accept
  // uses it) — establishes known state explicitly rather than relying on
  // create-time defaults, so this test is order-independent.
  await repo.joinAsMember(budgetId, memberUserId, "member");

  return { budgetId, ownerUserId, memberUserId };
}

test("setMemberShares persists a 60/40 split", async () => {
  const { budgetId, ownerUserId, memberUserId } =
    await createSharedBudgetWithTwoMembers();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberShares(budgetId, [
    { userId: ownerUserId, pct: 60 },
    { userId: memberUserId, pct: 40 },
  ]);
  const shares = await repo.listMemberShares(budgetId);
  expect(shares).toContainEqual({ userId: ownerUserId, pct: 60 });
  expect(shares).toContainEqual({ userId: memberUserId, pct: 40 });
});

test("setMemberAggregation flips only the caller's row", async () => {
  const { budgetId, ownerUserId, memberUserId } =
    await createSharedBudgetWithTwoMembers();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberAggregation(budgetId, memberUserId, false);
  const prefs = await repo.getAggPrefsForUser(memberUserId);
  expect(prefs.get(budgetId)?.include_in_aggregation).toBe(false);
  const ownerPrefs = await repo.getAggPrefsForUser(ownerUserId);
  expect(ownerPrefs.get(budgetId)?.include_in_aggregation).toBe(true);
});
