import type { EmailSender } from "@budget/shared-kernel";
import type { BudgetRepo } from "../ports/budget-repo";
import type { MemberShareRepo } from "../ports/member-repo";
import type { OnboardingProgressRepo } from "../ports/onboarding-progress-repo";

export interface TenancyModule {
  organizationPlugin: unknown; // typed as ReturnType<typeof organization> at impl site
  /**
   * Drizzle-adapter schema map for Better Auth. Keys are the model names used
   * by the organization plugin (budgets / budget_members / budget_invitations).
   * The identity module merges this into Better Auth's drizzleAdapter schema.
   */
  betterAuthSchema: Record<string, unknown>;
  budgetRepo: BudgetRepo;
  memberShareRepo: MemberShareRepo;
  /** @deprecated use budgetRepo */
  workspaceRepo: BudgetRepo;
  /** ONBD-07: USER-SCOPED wizard progress repo */
  onboardingProgressRepo: OnboardingProgressRepo;
}

export function createTenancyModule(deps: {
  emailSender: EmailSender;
  appUrl: string;
}): TenancyModule {
  // Implementation imports adapters/persistence/* internally — apps NEVER reach those paths.
  // Loaded lazily to keep contracts/ free of adapter imports at type-check time.

  const { createOrganizationPlugin } =
    require("../adapters/persistence/better-auth-org") as typeof import("../adapters/persistence/better-auth-org");

  const { DrizzleBudgetRepo, DrizzleMemberShareRepo } =
    require("../adapters/persistence/workspace-repo") as typeof import("../adapters/persistence/workspace-repo");

  const { DrizzleOnboardingProgressRepo } =
    require("../adapters/persistence/onboarding-progress-repo") as typeof import("../adapters/persistence/onboarding-progress-repo");

  const tenancySchema =
    require("../adapters/persistence/schema") as typeof import("../adapters/persistence/schema");

  const budgetRepo = new DrizzleBudgetRepo();

  return {
    organizationPlugin: createOrganizationPlugin(deps),
    betterAuthSchema: {
      // Better Auth org plugin contract: model names must match `modelName` values in better-auth-org.ts
      budgets: tenancySchema.budgets,
      budget_members: tenancySchema.budgetMembers,
      budget_invitations: tenancySchema.budgetInvitations,
    },
    budgetRepo,
    memberShareRepo: new DrizzleMemberShareRepo(),
    // Backward-compat alias for Plan 01-03 migration period
    workspaceRepo: budgetRepo,
    // ONBD-07: USER-SCOPED wizard progress (one row per user, not per budget)
    onboardingProgressRepo: new DrizzleOnboardingProgressRepo(),
  };
}
