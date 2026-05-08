import type { EmailSender } from "@budget/shared-kernel";
import type { LibsodiumKeyStore } from "@budget/platform";
import type { UserRepo } from "../ports/user-repo";

export interface IdentityModule {
  auth: unknown; // typed as ReturnType<typeof betterAuth> at impl site
  userRepo: UserRepo;
}

export interface CreateIdentityOptions {
  emailSender: EmailSender;
  keyStore: LibsodiumKeyStore;
  additionalPlugins?: unknown[]; // tenancy plugin slot (Plan 06 fills via createTenancyModule().organizationPlugin)
  additionalSchema?: Record<string, unknown>; // extra Drizzle tables for Better Auth (org plugin: workspaces, workspace_members, workspace_invitations)
}

export function createIdentityModule(
  opts: CreateIdentityOptions,
): IdentityModule {
  // Lazy require to keep contracts/ free of adapter imports at type-check time.

  const { createAuth } =
    require("../adapters/persistence/better-auth") as typeof import("../adapters/persistence/better-auth");

  const { DrizzleUserRepo } =
    require("../adapters/persistence/user-repo") as typeof import("../adapters/persistence/user-repo");
  return {
    auth: createAuth(opts as any),
    userRepo: new DrizzleUserRepo(),
  };
}
