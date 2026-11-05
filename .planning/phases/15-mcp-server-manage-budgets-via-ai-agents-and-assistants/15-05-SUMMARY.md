---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 05
status: complete
---

# 15-05 Summary: Better Auth = OAuth 2.1 AS for MCP

## Built

- `packages/identity/src/adapters/persistence/oauth-provider.ts` — `mcpOAuthPlugins({ baseUrl })` → `[jwt(), oauthProvider(...), ensureOfflineAccess]`; `MCP_SCOPES`. Exported (with `oauthBetterAuthSchema`) from `@budget/identity`.
- `apps/api/src/boot.ts` — plugins + schema wired next to the org plugin.
- `apps/api/test/mcp/helpers.ts` — `setupMcpTestEnv`, `testApp` (createApp(await boot()), once per file), `signUpTestUser`, `seedBudget`, `mintMcpToken` (real DCR → authorize → consent → PKCE token), `refreshMcpToken`, `jwtPayload`, `refreshRows`.

## Measured (not assumed) — D-06

- **offline_access mechanism:** hook kept. The provider issues a refresh token only if the client registered the `refresh_token` grant AND `offline_access` is in scope; DCR defaults to `grant_types: ["authorization_code"]`. `ensureOfflineAccess` adds `refresh_token` at `/oauth2/register` and `offline_access` at `/oauth2/authorize`. Proven for scope `read` and for no scope at all.
- **Refresh expiry: SLIDING** — `refreshTokenExpiresAtSeconds = iat + ttl` on every issuance; rotation gives a fresh 10y.
- **TTLs:** access 600s, refresh 10y (sliding). Old refresh token is refused after rotation (replay).
- offline_access refresh tokens survive web sign-out (plugin: back-channel logout keeps them) → connection lives until Disconnect.

## Deviations from plan

- **No custom `validateRedirectUri`.** Plugin registration rules + `clientRegistrationDefaultApplicationType: "infer"` already do it: https for web clients, loopback http / custom scheme for native (RFC 8252). Custom schemes are therefore allowed for native clients (Cursor-style `cursor://`). `http://evil.example` rejected.
- Added `clientRegistrationDefaultResources: [/mcp]` — without it authorize fails `invalid_target` (client not linked to resource).
- Rate limits via the plugin's own `rateLimit.register/token` (10/60s, 120/60s) instead of `customRules`.
- Ids text (15-04).

## Verification

- packages/identity/test/oauth-provider.test.ts 7/0 (testcontainer)
- apps/api/test/mcp/oauth-lifetime.test.ts 4/0 (dev DB, full app)
- identity + tenancy gate 105 pass / 0 fail
- tsc (api, identity) + eslint clean
