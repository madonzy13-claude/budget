// Stub — implemented fully in Task 3.
import type { EmailSender } from "@budget/shared-kernel";

export interface OrgDeps {
  emailSender: EmailSender;
  appUrl: string;
}

export function createOrganizationPlugin(_deps: OrgDeps): unknown {
  throw new Error("createOrganizationPlugin: not yet implemented");
}
