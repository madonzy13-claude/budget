/**
 * Test helpers for tenancy integration tests.
 * Avoids importing application layer from other packages (dep-cruiser + TS resolution).
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { StdoutEmailSender } from "@budget/shared-kernel";
import { LibsodiumKeyStore } from "@budget/platform";
import { createIdentityModule } from "@budget/identity";
import { createTenancyModule } from "@budget/tenancy";
import { createBudget } from "../src/application/create-budget";
import { DrizzleBudgetRepo } from "../src/adapters/persistence/workspace-repo";

type AnyAuth = {
  api: {
    signUpEmail: (opts: {
      body: Record<string, unknown>;
    }) => Promise<{ user: { id: string } }>;
  };
};

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  locale: string;
  displayCurrency: string;
}

/**
 * Helper matching the signature of identity's signUp application service.
 * Accepts { auth } deps object to match existing call-sites.
 */
export async function signUpHelper(
  deps: { auth: AnyAuth },
  input: SignUpInput,
): Promise<Result<{ userId: string }, Error>> {
  try {
    const r = await deps.auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.name,
        locale: input.locale,
        display_currency: input.displayCurrency,
      },
    });
    return ok({ userId: r.user.id });
  } catch (e) {
    return err(e as Error);
  }
}

/**
 * Task 5 (ownership-share churn): creates a fresh budget with one signed-up
 * owner via the real create-budget path (Better Auth createOrganization
 * under the hood) — exercises the same owner-membership insert the
 * `afterAddMember` hook patches to 100% ownership share.
 */
export async function createTestBudgetWithOwner(): Promise<{
  budgetId: string;
  ownerUserId: string;
}> {
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
  const owner = await signUpHelper(
    { auth: identity.auth as never },
    {
      email: `share-churn-owner-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: "Owner",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (!owner.isOk()) throw new Error("owner signup failed");

  const budget = await createBudget(
    { auth: identity.auth as never },
    {
      name: "Share Churn Budget",
      default_currency: "USD",
      ownerUserId: owner.value.userId,
    },
  );
  if (!budget.isOk()) throw new Error("createBudget failed");

  return { budgetId: budget.value.budgetId, ownerUserId: owner.value.userId };
}

/**
 * Adds a second member to `budgetId` via the same RLS-safe write path the
 * share-link accept flow uses (`joinAsMember`). The accepted member's row
 * gets `ownership_share_pct` from the column DEFAULT (0) — untouched by
 * this helper or by production code (Task 5 scope: default handles it).
 */
export async function addMemberViaAccept(budgetId: string): Promise<string> {
  const sender = new StdoutEmailSender();
  const identity = createIdentityModule({
    emailSender: sender,
    keyStore: new LibsodiumKeyStore(),
  });
  const member = await signUpHelper(
    { auth: identity.auth as never },
    {
      email: `share-churn-member-${Date.now()}-${Math.random()}@test.com`,
      password: "changeme1234",
      name: "Member",
      locale: "en",
      displayCurrency: "USD",
    },
  );
  if (!member.isOk()) throw new Error("member signup failed");

  const repo = new DrizzleBudgetRepo();
  await repo.joinAsMember(budgetId, member.value.userId, "member");
  return member.value.userId;
}

/** Removes `userId` from `budgetId` via the repo's own membership-delete path. */
export async function removeMember(
  budgetId: string,
  userId: string,
): Promise<void> {
  const repo = new DrizzleBudgetRepo();
  await repo.leaveAsMember(budgetId, userId);
}
