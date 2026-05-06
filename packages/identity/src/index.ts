// identity: User, Credential, Session, Language domain
// PC-02, PC-15: apps/* see ONLY this surface
export * from './contracts/api';
export * from './contracts/events';
export * from './contracts/factory';
export type { UserRepo } from './ports/user-repo';
export type { CredentialRepo } from './ports/credential-repo';
// domain/* and adapters/* are NOT re-exported.
