/**
 * Task 3: repo reads for member aggregation prefs.
 * Integration test — runs against testcontainer Postgres.
 *
 * Note: a freshly-created budget's owner share defaults to 0 (Task 5, which
 * sets it to 100 on create, is not done yet). We seed a budget+owner via the
 * normal create path, then raw-UPDATE the owner's row to a known state
 * (100 / included) so this test exercises the READ path (column mapping)
 * without depending on Task 5's create-time default.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql } from "drizzle-orm";
import { startTestcontainer } from "@budget/db/test/testcontainer";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
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

async function createTestBudgetWithOwner() {
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
      email: `agg-prefs-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  expect(u.isOk()).toBe(true);
  if (!u.isOk()) throw new Error("signup failed");

  const w = await createWorkspace(
    { auth: identity.auth as never },
    {
      name: "Agg Prefs Budget",
      kind: "PRIVATE",
      default_currency: "USD",
      ownerUserId: u.value.userId,
    },
  );
  expect(w.isOk()).toBe(true);
  if (!w.isOk()) throw new Error("createWorkspace failed");

  const budgetId = w.value.workspaceId;
  const ownerUserId = u.value.userId;

  // Establish a known state: known-good share so this test exercises the
  // READ path, not the (not-yet-implemented) create-time default.
  // budget_members has FORCE RLS — the tenant_update policy requires
  // app.tenant_ids to include budgetId, so the write must go through
  // withTenantTx (bare appDb() would silently affect 0 rows).
  const upd = await withTenantTx(
    TenantId(budgetId),
    UserId(ownerUserId),
    async (tx) => {
      await tx.execute(sql`
        UPDATE tenancy.budget_members
           SET ownership_share_pct = 100, include_in_aggregation = true
         WHERE budget_id = ${budgetId}::uuid AND user_id = ${ownerUserId}::uuid
      `);
    },
  );
  if (upd.isErr()) throw upd.error;

  return { budgetId, ownerUserId };
}

test("getAggPrefsForUser reads back known ownership_share_pct + include_in_aggregation", async () => {
  const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
  const repo = new DrizzleBudgetRepo();
  const prefs = await repo.getAggPrefsForUser(ownerUserId);
  expect(prefs.get(budgetId)).toEqual({
    ownership_share_pct: 100,
    include_in_aggregation: true,
  });
});

test("listMemberShares returns the owner at 100", async () => {
  const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
  const repo = new DrizzleBudgetRepo();
  const shares = await repo.listMemberShares(budgetId);
  expect(shares).toContainEqual({ userId: ownerUserId, pct: 100 });
});

// Task 12: the owner ownership-share editor reads current shares off
// listMembers (not listMemberShares) — MemberDTO must carry the column.
test("listMembers includes ownership_share_pct for the owner", async () => {
  const { budgetId, ownerUserId } = await createTestBudgetWithOwner();
  const repo = new DrizzleBudgetRepo();
  const members = await repo.listMembers(budgetId);
  const owner = members.find((m) => m.userId === ownerUserId);
  expect(owner?.ownership_share_pct).toBe(100);
});
