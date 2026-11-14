---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 07
status: complete
---

# 15-07 Summary: /mcp endpoint, discovery, list_budgets, registry guard

## Built

- `apps/api/src/mcp/well-known.ts` — `/.well-known/oauth-protected-resource{,/mcp}` (plugin `getProtectedResourceMetadata`) and `/.well-known/oauth-authorization-server{,/auth}` (plugin `oauthProviderAuthServerMetadata`). Mounted after `/auth`, before `authMiddleware`.
- `packages/identity` `verifyMcpAccessToken(auth, token, baseUrl)` — `verifyJwsAccessToken` with an **in-process** `jwksFetch` through `auth.handler(/auth/jwks)`, cached on the auth object; audience `${BASE}/mcp`, issuer `${BASE}/auth`. Lives in identity because only identity depends on better-auth.
- `apps/api/src/mcp/handler.ts` — `app.all("/mcp")`, bearer → verify → `userRepo.findById(sub)` → `createMcpHandler(..., { responseMode: "json" }).fetch(req, { authInfo })`. Any failure → 401 + `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"`.
- `server.ts` (`buildMcpServer(ctx)`, untrusted-text instructions), `tools/define.ts` (`McpCtx`, `readTool`, `toolOk`, `toolError`, `untrusted`, `fromDispatch`), `tools/read.ts` (`list_budgets` → GET /budgets/active).
- Test helpers: `testDeps()`, `createSdkClient(app, token)` (real `@modelcontextprotocol/client` Streamable HTTP transport with `fetch` → `app.fetch`).

## A5 resolved

authInfo reaches tools through the **server factory**: `createMcpHandler((ctx) => …)` gets `ctx.authInfo` per request; `buildMcpServer` closes over it (`who = { userId, email, locale } from authInfo.extra, clientId = authInfo.clientId`). Tools never read it from the SDK's per-call context.

## Verification

- well-known 4/0, auth 6/0 (no token / garbage / wrong-aud and expired AS-signed JWTs → 401; readOnlyHint; D-01 later budget visible; cross-user isolation; 61st read → `rate_limited` + `retry_after_seconds`, other client unaffected), registry 3/0, full test/mcp suite green.
- Probe: temporarily registering `send_email` turned all 3 registry tests red (not committed).
- No public URL / hardcoded host in handler.ts.
