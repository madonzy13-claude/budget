import type { EmailSender } from '@budget/shared-kernel';
import type { LibsodiumKeyStore } from '@budget/platform';
import type { UserRepo } from '../ports/user-repo';

export interface IdentityModule {
  auth: unknown;     // typed as ReturnType<typeof betterAuth> at impl site
  userRepo: UserRepo;
}

export interface CreateIdentityOptions {
  emailSender: EmailSender;
  keyStore: LibsodiumKeyStore;
  additionalPlugins?: unknown[];   // tenancy plugin slot (Plan 06 fills via createTenancyModule().organizationPlugin)
}

export function createIdentityModule(opts: CreateIdentityOptions): IdentityModule {
  // Lazy require to keep contracts/ free of adapter imports at type-check time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createAuth } = require('../adapters/persistence/better-auth') as typeof import('../adapters/persistence/better-auth');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DrizzleUserRepo } = require('../adapters/persistence/user-repo') as typeof import('../adapters/persistence/user-repo');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auth: createAuth(opts as any),
    userRepo: new DrizzleUserRepo(),
  };
}
