// identity: User, Credential, Session, Language domain
// PC-02, PC-15: apps/* see ONLY this surface
export * from './contracts/api';
export * from './contracts/events';
export * from './contracts/factory';
export type { UserRepo } from './ports/user-repo';
export type { CredentialRepo } from './ports/credential-repo';
// domain/* and adapters/* are NOT re-exported.
// Phase 15 MCP: OAuth authorization-server plugins + their Drizzle tables, wired in apps/api boot.
export {
  mcpOAuthPlugins,
  MCP_SCOPES,
  verifyMcpAccessToken,
} from './adapters/persistence/oauth-provider';
export { oauthBetterAuthSchema } from './adapters/persistence/oauth-schema';
export {
  listConnections,
  disconnect,
  touchConsent,
  getClientPublicInfo,
  type Connection,
} from './adapters/persistence/oauth-connections-repo';
