// Stub — fully implemented in Task 3
// This file MUST NOT be imported directly by domain/application/ports layers.
// Apps use createIdentityModule() from contracts/factory.ts (PC-02, PC-15).

import type { EmailSender } from '@budget/shared-kernel';
import type { LibsodiumKeyStore } from '@budget/platform';

export interface CreateAuthOptions {
  emailSender: EmailSender;
  keyStore: LibsodiumKeyStore;
  additionalPlugins?: unknown[];
}

export function createAuth(_opts: CreateAuthOptions): unknown {
  throw new Error('createAuth: not yet implemented (Task 3)');
}
