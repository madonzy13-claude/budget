import { sql } from "drizzle-orm";
import {
  pgPolicy,
  uuid,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { identity, appRole, workerRole } from "@budget/platform";

/**
 * oauth-schema.ts — tables for @better-auth/oauth-provider + jwt (Phase 15 MCP).
 *
 * Column set mirrors the plugins' own `schema` field list; the identity schema
 * test fails if a plugin field has no column (Better Auth 1.7 refuses sign-up
 * on a gap). Ids are text like sessions/accounts: oauth_client_assertion.id is
 * the client's JWT `jti`, not a uuid. user_id is uuid like every identity table.
 *
 * RLS (migration 0106): token + consent tables are USER-SCOPED with a
 * better_auth GUC escape, because authorize/token run with no user GUC. Client,
 * resource, assertion and jwks tables hold no user data and have no RLS.
 */
const ts = (name: string) => timestamp(name, { withTimezone: true });

const userOrBetterAuth = (userId: unknown) =>
  sql`current_setting('app.better_auth', true) = 'on' OR ${userId} = nullif(current_setting('app.current_user_id', true), '')::uuid`;

export const jwks = identity.table("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});

export const oauthClient = identity.table("oauth_client", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  clientDiscoveryId: text("client_discovery_id"),
  disabled: boolean("disabled"),
  skipConsent: boolean("skip_consent"),
  enableEndSession: boolean("enable_end_session"),
  subjectType: text("subject_type"),
  scopes: text("scopes").array(),
  clientCredentialsScopes: text("client_credentials_scopes").array(),
  userId: uuid("user_id"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("software_id"),
  softwareVersion: text("software_version"),
  softwareStatement: text("software_statement"),
  redirectUris: text("redirect_uris").array().notNull(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  backchannelLogoutSessionRequired: boolean(
    "backchannel_logout_session_required",
  ),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  applicationType: text("application_type"),
  jwks: text("jwks"),
  jwksUri: text("jwks_uri"),
  grantTypes: text("grant_types").array(),
  responseTypes: text("response_types").array(),
  requirePKCE: boolean("require_pkce"),
  dpopBoundAccessTokens: boolean("dpop_bound_access_tokens"),
  referenceId: text("reference_id"),
  metadata: jsonb("metadata"),
});

export const oauthResource = identity.table("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required"),
  disabled: boolean("disabled"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  policyVersion: integer("policy_version"),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = identity.table("oauth_client_resource", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  resourceId: text("resource_id").notNull(),
  metadata: jsonb("metadata"),
  createdAt: ts("created_at"),
});

export const oauthClientAssertion = identity.table("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
});

export const oauthRefreshToken = identity.table(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id").notNull(),
    sessionId: text("session_id"),
    userId: uuid("user_id").notNull(),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at"),
    revoked: ts("revoked"),
    rotatedAt: ts("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: ts("rotation_replay_expires_at"),
    authTime: ts("auth_time"),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    pgPolicy("oauth_refresh_token_owner", {
      for: "all",
      to: [appRole, workerRole],
      using: userOrBetterAuth(t.userId),
      withCheck: userOrBetterAuth(t.userId),
    }),
  ],
);

export const oauthAccessToken = identity.table(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id").notNull(),
    sessionId: text("session_id"),
    userId: uuid("user_id"),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id"),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at"),
    revoked: ts("revoked"),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    pgPolicy("oauth_access_token_owner", {
      for: "all",
      to: [appRole, workerRole],
      using: userOrBetterAuth(t.userId),
      withCheck: userOrBetterAuth(t.userId),
    }),
  ],
);

export const oauthConsent = identity.table(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: uuid("user_id"),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    /** Ours, not the plugin's (0107): stamped by touchConsent on each /mcp call. */
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [
    pgPolicy("oauth_consent_owner", {
      for: "all",
      to: [appRole, workerRole],
      using: userOrBetterAuth(t.userId),
      withCheck: userOrBetterAuth(t.userId),
    }),
  ],
);

/** Keyed by Better Auth model name — spread into createAuth's drizzle schema. */
export const oauthBetterAuthSchema = {
  jwks,
  oauthClient,
  oauthResource,
  oauthClientResource,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  oauthClientAssertion,
};
