/**
 * workspace-repo-member-name.test.ts — a budget's name belongs to the reader
 * (260808).
 *
 * A shared budget is one row, but the two people in it do not have to call it
 * the same thing: one household's "Family Budget" is the other's "Dom". The
 * name each member sees now rides their MEMBERSHIP, and the budget's own name
 * is only what it falls back to — so renaming it is a private act that cannot
 * reach across to anyone else's screen (user, 260808).
 *
 * Integration test — real Postgres via testcontainer.
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

const sender = new StdoutEmailSender();

function modules() {
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
  return { identity };
}

async function newUser(tag: string) {
  const { identity } = modules();
  const u = await signUp(
    { auth: identity.auth as never },
    {
      email: `member-name-${tag}-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: tag,
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (!u.isOk()) throw new Error("signup failed");
  return { userId: u.value.userId, identity };
}

/** A shared budget with an owner and a second member. */
async function sharedBudget() {
  const owner = await newUser("owner");
  const other = await newUser("member");
  const w = await createWorkspace(
    { auth: owner.identity.auth as never },
    {
      name: "Family Budget",
      kind: "SHARED",
      default_currency: "USD",
      ownerUserId: owner.userId,
    },
  );
  if (!w.isOk()) throw new Error("createWorkspace failed");
  const budgetId = w.value.workspaceId;

  const add = await withTenantTx(
    TenantId(budgetId),
    UserId(owner.userId),
    async (tx) => {
      await tx.execute(sql`
        INSERT INTO tenancy.budget_members (id, budget_id, user_id, role, created_at)
        VALUES (gen_random_uuid(), ${budgetId}::uuid, ${other.userId}::uuid, 'member', now())
        ON CONFLICT DO NOTHING`);
    },
  );
  if (add.isErr()) throw add.error;
  return { budgetId, ownerUserId: owner.userId, otherUserId: other.userId };
}

const nameFor = async (userId: string, budgetId: string) =>
  (await new DrizzleBudgetRepo().listForUser(userId)).find(
    (b) => b.id === budgetId,
  )?.name;

test("falls back to the budget's own name until a member renames it", async () => {
  const { budgetId, ownerUserId, otherUserId } = await sharedBudget();
  expect(await nameFor(ownerUserId, budgetId)).toBe("Family Budget");
  expect(await nameFor(otherUserId, budgetId)).toBe("Family Budget");
});

test("a member's rename shows on their screen and NOWHERE else", async () => {
  const { budgetId, ownerUserId, otherUserId } = await sharedBudget();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberBudgetName(budgetId, otherUserId, "Dom");
  expect(await nameFor(otherUserId, budgetId)).toBe("Dom");
  expect(await nameFor(ownerUserId, budgetId)).toBe("Family Budget");
});

test("the OWNER renaming is just as private", async () => {
  // The owner is a member like any other here: the point is that no rename
  // reaches another member's screen, not that owners are special.
  const { budgetId, ownerUserId, otherUserId } = await sharedBudget();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberBudgetName(budgetId, ownerUserId, "Ours");
  expect(await nameFor(ownerUserId, budgetId)).toBe("Ours");
  expect(await nameFor(otherUserId, budgetId)).toBe("Family Budget");
});

test("clearing the override falls back again", async () => {
  const { budgetId, otherUserId } = await sharedBudget();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberBudgetName(budgetId, otherUserId, "Dom");
  await repo.setMemberBudgetName(budgetId, otherUserId, null);
  expect(await nameFor(otherUserId, budgetId)).toBe("Family Budget");
});

test("blank is not a name — it clears rather than showing an empty pill", async () => {
  const { budgetId, otherUserId } = await sharedBudget();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberBudgetName(budgetId, otherUserId, "   ");
  expect(await nameFor(otherUserId, budgetId)).toBe("Family Budget");
});

test("one member's rename cannot be written onto another's row", async () => {
  // The write binds the caller's own user id; passing someone else's id is a
  // different row, and RLS scopes it to this budget either way.
  const { budgetId, ownerUserId, otherUserId } = await sharedBudget();
  const repo = new DrizzleBudgetRepo();
  await repo.setMemberBudgetName(budgetId, otherUserId, "Dom");
  const rows = await withTenantTx(
    TenantId(budgetId),
    UserId(ownerUserId),
    async (tx) =>
      (
        await tx.execute<{ user_id: string; display_name: string | null }>(sql`
          SELECT user_id::text, display_name FROM tenancy.budget_members
           WHERE budget_id = ${budgetId}::uuid`)
      ).rows,
  );
  if (rows.isErr()) throw rows.error;
  const byUser = new Map(rows.value.map((r) => [r.user_id, r.display_name]));
  expect(byUser.get(otherUserId)).toBe("Dom");
  expect(byUser.get(ownerUserId)).toBe(null);
});
