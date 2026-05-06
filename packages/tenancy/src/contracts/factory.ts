import type { EmailSender } from "@budget/shared-kernel";
import type { WorkspaceRepo } from "../ports/workspace-repo";
import type { MemberShareRepo } from "../ports/member-repo";

export interface TenancyModule {
  organizationPlugin: unknown; // typed as ReturnType<typeof organization> at impl site
  workspaceRepo: WorkspaceRepo;
  memberShareRepo: MemberShareRepo;
}

export function createTenancyModule(deps: {
  emailSender: EmailSender;
  appUrl: string;
}): TenancyModule {
  // Implementation imports adapters/persistence/* internally — apps NEVER reach those paths.
  // Loaded lazily to keep contracts/ free of adapter imports at type-check time.

  const { createOrganizationPlugin } =
    require("../adapters/persistence/better-auth-org") as typeof import("../adapters/persistence/better-auth-org");

  const { DrizzleWorkspaceRepo, DrizzleMemberShareRepo } =
    require("../adapters/persistence/workspace-repo") as typeof import("../adapters/persistence/workspace-repo");
  return {
    organizationPlugin: createOrganizationPlugin(deps),
    workspaceRepo: new DrizzleWorkspaceRepo(),
    memberShareRepo: new DrizzleMemberShareRepo(),
  };
}
