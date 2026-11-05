# Phase 15: MCP server — manage budgets via AI agents and assistants - Research

**Researched:** 2026-11-05
**Domain:** Remote MCP server (Streamable HTTP) + OAuth 2.1 authorization server on Hono/Bun, over existing hexagonal use cases
**Confidence:** MEDIUM-HIGH (package APIs read from the published tarballs; three behaviours need a Wave-0 spike, see Open Questions)

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Grant covers **all budgets the user is a member of**, including budgets the user joins/creates later (no per-budget checkboxes, no snapshot at consent time).
- **D-02:** Two scopes only: `read` (default) and `write` (opt-in, covers every write tool incl. import and budget create).
- **D-03:** Agent permissions = the user's own role in each budget, never more. MCP tools call the same use cases with the same authorisation checks as the web routes.
- **D-04:** Budget created via `budget_create` is automatically usable by that connection (falls out of D-01).
- **D-05:** Any MCP client may connect via **Dynamic Client Registration** (standard MCP auth spec). No allowlist, no personal API tokens in this phase.
- **D-06:** Connection lives **until the user disconnects** — short access token + rotating refresh token, no idle expiry (consistent with 365-day session stance).
- **D-07:** Writes apply **immediately**. Rows created/changed by an agent are **indistinguishable in the UI** from the user's own — no "added by Claude"/"via <client>" mark anywhere. (Client-side confirmation is the MCP client's job; tool annotations `readOnlyHint`/`destructiveHint` still set.)
- **D-08:** A hidden server-side record of every MCP write (connection/client id, tool call, affected entity ids, before/after) is kept — needed for agent undo and audit. Not rendered in the app.
- **D-09:** Delete = **exactly what the app does today**: spendings/incomes soft-delete (`transactionRepo.softDelete`); investment entries follow the newest-first deletion rule from Phase 13.1. No reversal entries, no new delete semantics.
- **D-10:** `sync_wallet_balance` sets the balance like the app's wallet edit (`set-wallet-balance` use case) and returns old → new + difference to the agent.
- **D-11:** **No Undo button in the app.** The agent gets an undo tool that reverts its own previous write(s) using the D-08 record (incl. `import_undo(batchId)`).
- **D-12:** Agent may change old months (past entries, past limits) — same rules as the app.
- **D-13:** Max **500 rows per write call**; bigger imports are split into several calls by the agent.
- **D-14:** Importable data: spendings + incomes, monthly category limits, investment history, wallet balance history, scheduled payments.
- **D-15:** Flow: agent sends normalised rows to a server check (`import_preview`) → if problems (duplicates, unknown categories, FX gaps) the agent asks the user about **all of them at once**, then commits **everything in one go**. Nothing is saved until problems are resolved. A clean preview commits without asking the user.
- **D-16:** Duplicates (same day + amount + category as an existing entry) are reported as a list; user answers once ("skip all / add all / pick these").
- **D-17:** Unknown categories: agent proposes a mapping to existing categories (or "create new"), user confirms. Never silent auto-create, never a catch-all bucket.
- **D-18:** Foreign-currency rows keep their original currency and convert at that date's rate — the Phase 14 typed-amount behaviour.
- **D-19:** Connecting an assistant is **private** to the user — other budget members are not told, no member-list marker.
- **D-20:** Agent reads everything the user sees in shared budgets, incl. other members' entries and notes. User-authored text is returned as clearly labelled data fields (lethal-trifecta mitigation from ROADMAP stays).
- **D-21:** Settings → Connected apps: per user; shows client name, connected date, last used, **Disconnect**. No activity history, no permission switch (reconnect to change scope).
- **D-22:** Both aggregates (spending_summary etc.) and individual entries via `search_transactions` over **full history**, paged (200/page).
- **D-23:** Tasks queue and all Overview numbers (reserve fit, forecast/projection, net worth/wealth) are readable — same numbers the app shows.
- **D-24:** Per connection: **60 reads/min, 20 writes/min**.
- **D-25:** Per connection: **5 000 written entries/day**.

### Claude's Discretion

- Undo tool shape (single `undo_last` vs `undo(callId)`), how far back the agent can undo, and how it behaves when the user has since hand-edited an affected row (must never clobber user edits).
- `import_preview` TTL / storage, duplicate-match tolerance details.
- Rate-limiter storage (current `apps/api/src/middleware/rate-limit.ts` is an in-memory Map — fine for one API instance; decide if it must survive restarts).
- Exact OAuth implementation (see open research item).
- Prompts content (monthly review / import spreadsheet / reconcile wallets) — user did not discuss; follow ROADMAP wording.

### Deferred Ideas (OUT OF SCOPE)

- Personal API tokens for CLIs/scripts that can't do OAuth — not chosen for v1.
- Per-budget consent / per-domain write scopes — rejected for v1 in favour of simplicity; revisit if users ask.
- Activity history + undo in Connected apps — rejected (user prefers asking the agent).

**ROADMAP overrides (CONTEXT wins):** per-budget consent → all budgets (D-01); `void_transaction` reversal entry → reuse existing delete (D-09); "via <client>" badge + UI undo → hidden audit, agent undo tool (D-07/D-11); preview shown to user → server check, ask only on problems (D-15).
</user_constraints>

<phase_requirements>

## Phase Requirements

No REQ-IDs assigned (Requirements: TBD). Must-haves derived from CONTEXT. Suggested IDs for the planner (`MCP-xx`):

| ID                    | Description                                                                                                                    | Research Support                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| MCP-01                | OAuth 2.1 AS: DCR, PKCE S256, refresh rotation, discovery metadata, all-budgets consent, `read`/`write` scopes (D-01,02,05,06) | `@better-auth/oauth-provider@1.7.15` + `jwt` plugin; Standard Stack, Pattern 1 |
| MCP-02                | `/mcp` Streamable HTTP endpoint, bearer verification, scope gating, tracing (D-03)                                             | `@modelcontextprotocol/server` v2 `createMcpHandler`; Pattern 2                |
| MCP-03                | Connected apps page + consent screen + Disconnect (D-21)                                                                       | `/oauth2/get-consents`, `/oauth2/delete-consent`; Pattern 6                    |
| MCP-04                | Read tools incl. full-history paged search (D-22,23)                                                                           | Tool map; gaps flagged                                                         |
| MCP-05                | Write tools via existing use cases with identical side effects (D-07,09,10,12,13)                                              | Route-dispatch adapter, Pattern 3                                              |
| MCP-06                | Hidden write log + agent undo, never clobbering user edits (D-08,11)                                                           | Pattern 4                                                                      |
| MCP-07                | Import preview/commit/undo, no partial saves (D-14..18)                                                                        | Pattern 5                                                                      |
| MCP-08                | Rate limits 60R/20W per min, 5000 entries/day per connection (D-24,25)                                                         | Pattern 7                                                                      |
| MCP-09                | Prompts (monthly review, import spreadsheet, reconcile wallets)                                                                | `registerPrompt`                                                               |
| MCP-10                | Real-client E2E + consent/Connected-apps Playwright                                                                            | Validation Architecture                                                        |
| MCP-11                | GDPR: new tables in delete cascade; OAuth rows purged on account delete                                                        | Pitfall 8                                                                      |
| </phase_requirements> |

## Summary

**The OAuth capability exists, as a separate package.** Better Auth 1.7.x dropped the old `mcp()`/`oidc-provider` plugins from the core bundle. The replacement is `@better-auth/oauth-provider`, and a **1.7.15 build exists on npm**, matching the exact pin. Its peers are `better-auth ^1.7.15`, `better-call 1.4.4` and `@better-auth/core ^1.7.15`. Latest is 1.7.17, which needs `better-auth ^1.7.17`, so **install `@better-auth/oauth-provider@1.7.15` exact and do not touch the better-auth pin**. I read the tarball source. It provides:

- RFC 7591 DCR at `POST /oauth2/register`, with an open (unauthenticated) mode.
- PKCE, and RFC 8707 `resource` / audience-bound JWT access tokens via the `jwt` plugin.
- Refresh tokens with rotation and replay detection.
- Consent, revoke and introspect endpoints.
- Metadata helpers for `/.well-known/oauth-authorization-server`.
- A resource-server client, `oauthProviderResourceClient`, with `verifyAccessTokenRequest` and `getProtectedResourceMetadata` (RFC 9728).
- A DB-backed model: `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`, `oauthResource`, `oauthClientResource`, `oauthClientAssertion`, plus `jwks` from the jwt plugin. All of them need Drizzle schema and a migration because of the 1.7.x schema-mismatch gate.

**The MCP SDK moved to v2 and it is stable.** `@modelcontextprotocol/server` 2.4.0 and `@modelcontextprotocol/hono` 2.0.2 are on npm (`latest`). `@modelcontextprotocol/sdk` 1.32.2 still carries the `latest` tag, but the v2 README calls v2 "the stable release line" (spec 2026-07-28). v2 is the better fit for this project. `createMcpHandler(factory).fetch(request, { authInfo })` is web-standard, so it works on Bun and Hono as is. By default it serves modern traffic and falls back to **stateless 2025-era serving**, which is what Claude.ai, ChatGPT and Cursor speak today. A fresh `McpServer` is built per request, so there are no sessions and no sticky state. The SDK does no token verification and takes `authInfo` pass-through only. `registerTool` takes `annotations` and a per-tool `scopeChallenge`, and `registerPrompt` exists.

**Zero duplicated logic: dispatch MCP tools through the existing Hono routes in-process.** Route handlers carry real behaviour: `syncReserveTopup`, `recomputeIncomeUnderPlannedRunner`, serializers, error mapping, and the tenant guard that checks membership from `X-Budget-ID`. Re-wrapping use cases directly would duplicate those side effects, which is the biggest regression risk. Tools should call `app.fetch(new Request(...))` with `X-Budget-ID` and `Idempotency-Key`. An unforgeable `WeakMap<Request, userId>` lets `authMiddleware` set the session for those internal requests. External requests can never be in that map.

**Gaps (no existing use case or route):**

- `search_transactions` over full history. `search-transactions.ts` exists but has no route, and it is built on the legacy v1.0 `corrects_id` model.
- `spending_summary` by arbitrary range. The existing route is month-only.
- Write-log table and undo.
- Import preview and commit.
- Atomic import. Every use case opens its own `withTenantTx`, so a single wrapping transaction is not possible.
- Restore of a soft-deleted transaction. `deleted_at` is column-grantable to `app_role`, so a `restore` repo method is feasible.

**Primary recommendation:** add `@better-auth/oauth-provider@1.7.15` (exact) plus the `jwt` plugin to the existing Better Auth instance, with `/mcp` as an `apps/api/src/mcp/` adapter on `@modelcontextprotocol/server@2.4.0` and `createMcpHandler`. Dispatch each tool through an in-process internal request to the existing routes. Put the new write-log and import-preview tables in `shared_kernel` with the audit-style tenant RLS. Run a Wave-0 spike on three unknowns before planning detail: refresh-token issuance without `offline_access`, refresh expiry sliding, and DCR clients from Claude.ai and ChatGPT.

## Architectural Responsibility Map

| Capability                                                | Primary Tier                                     | Secondary Tier                                                        | Rationale                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth AS (register/authorize/token/revoke/jwks, metadata) | API / Backend (Better Auth, `/auth/*`)           | —                                                                     | Already hosts Better Auth; self-hosted, no per-MAU cost                                                                                 |
| Public discovery paths (`/.well-known/*`, `/mcp`)         | Frontend Server (Next rewrite)                   | API                                                                   | `BETTER_AUTH_URL` = web URL, so the issuer is `https://<web>/auth`. The tunnel fronts Next, which must rewrite the new paths to the API |
| Login + consent UI                                        | Browser / Client (Next page)                     | API                                                                   | `loginPage` / `consentPage` options redirect to web pages. Consent is posted to `/auth/oauth2/consent`                                  |
| Connected apps list/disconnect                            | Browser (settings page)                          | API (`/oauth2/get-consents`, `/oauth2/delete-consent` + token revoke) | Per-user, session-authenticated                                                                                                         |
| Bearer verification + scope gate on `/mcp`                | API / Backend                                    | —                                                                     | `verifyAccessTokenRequest` before `handler.fetch`                                                                                       |
| Tool execution (read/write)                               | API / Backend (internal route dispatch)          | Database (RLS)                                                        | Reuses routes, so authz, tenant guard, side effects and idempotency stay single-sourced                                                 |
| Write log, undo, import preview storage                   | Database / Storage (`shared_kernel`, tenant RLS) | API                                                                   | Needs durable before/after and a batch id                                                                                               |
| Rate limits                                               | API (in-memory 60R/20W)                          | Database (daily entry sum from the write log)                         | Per-minute counters may reset on restart. The daily cap must survive, and the log gives that for free                                   |
| Prompts                                                   | API (MCP `registerPrompt`)                       | —                                                                     | Static text                                                                                                                             |

## Standard Stack

### Core

| Library                        | Version                                  | Purpose                                                                                      | Why Standard                                                                                                                                                        |
| ------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@better-auth/oauth-provider`  | **1.7.15** (exact; npm latest is 1.7.17) | OAuth 2.1 AS: DCR, PKCE, refresh rotation, consent, introspection, metadata, resource client | Only maintained Better Auth OAuth-AS. 1.7.15 peers `better-auth ^1.7.15` and `better-call 1.4.4`, so it matches the pin [VERIFIED: `npm view` + tarball inspection] |
| `better-auth/plugins` `jwt`    | in 1.7.15                                | JWKS and signed JWT access tokens (`aud`-bound). Required unless `disableJwtPlugin`          | oauth-provider default path [VERIFIED: tarball `index.d.mts` + source]                                                                                              |
| `@modelcontextprotocol/server` | **2.4.0** (latest)                       | `McpServer`, `createMcpHandler`, `registerTool/Prompt`, annotations, `scopeChallenge`        | Official, spec 2026-07-28, web-standard fetch, stateless legacy fallback [VERIFIED: tarball + README]                                                               |
| `@modelcontextprotocol/hono`   | 2.0.2                                    | Optional Hono helpers (`createMcpHonoApp`, host validation)                                  | Thin. Only needed if we want `parsedBody` or Host validation. **Skip unless needed**, since `handler.fetch(c.req.raw, { authInfo })` is enough [VERIFIED: README]   |

### Supporting

| Library                           | Version                  | Purpose                                                                        | When to Use                                                                   |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `@modelcontextprotocol/client`    | 2.4.0                    | SDK client in `bun:test` for real-protocol E2E (list tools, call, annotations) | devDependency of `apps/api` tests [VERIFIED: npm view]                        |
| `@modelcontextprotocol/inspector` | 2.14.0                   | Manual and CLI smoke (`--cli`) against `/mcp`                                  | Optional dev tool, run through `bunx`, never in lockfile [VERIFIED: npm view] |
| `zod`                             | 4.6.x (already)          | Tool input/output schemas (`z.object`)                                         | Already pinned by `overrides`                                                 |
| `big.js`                          | already in shared-kernel | Decimal-string to minor-unit conversion at the MCP boundary                    | Existing. Never use floats                                                    |

### Alternatives Considered

| Instead of                                    | Could Use                             | Tradeoff                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2 `@modelcontextprotocol/server`             | `@modelcontextprotocol/sdk` 1.32.2    | v1 is still tagged `latest` and has `WebStandardStreamableHTTPServerTransport`, but it is the legacy line. v2 is "the stable release line" and has `createMcpHandler`. Use v2 [CITED: package README]                                                                                     |
| Route-dispatch adapter                        | Calling use cases directly from tools | Direct calls need every route's side effects, serializer and error mapping re-implemented. Dispatch trades about 1 ms JSON round-trip for zero drift                                                                                                                                      |
| `@better-auth/cimd` (Client ID Metadata Docs) | DCR only (locked D-05)                | The 2026-07-28 spec calls DCR deprecated and prefers CIMD [CITED: modelcontextprotocol.io registration page via search]. `@better-auth/cimd` 1.7.17 needs `oauth-provider ^1.7.17`, so it would force a bump of the pinned stack. **Out of scope. Record as a risk**, see Open Question 3 |
| In-memory limiter                             | DB-backed limiter                     | Reuse `checkAndRecord` for per-minute caps. Use the DB for the daily cap only                                                                                                                                                                                                             |

**Installation** (in `apps/api`; keep exact for oauth-provider, and add to root `overrides` alongside better-auth so one version resolves across workspaces):

```bash
bun add --exact @better-auth/oauth-provider@1.7.15 @modelcontextprotocol/server@2.4.0
bun add -d @modelcontextprotocol/client@2.4.0
# identity package also needs the plugin (it owns createAuth):
cd packages/identity && bun add --exact @better-auth/oauth-provider@1.7.15
```

Then rebuild images. Docker uses `bun.lock` with `--frozen-lockfile` since 260804, so regenerate the lock and verify with a clean `--frozen-lockfile`. Do not hand-edit it. Also run `bun audit --audit-level=high`.

**Version verification:** run 2026-11-05. `@better-auth/oauth-provider` has 1.7.15, 1.7.16 and 1.7.17 on npm (latest 1.7.17, modified 2026-11-04). `@modelcontextprotocol/server` is 2.4.0, `client` 2.4.0, `hono` 2.0.2, and `sdk` is 1.32.2 [VERIFIED: npm registry]. No `postinstall` scripts on any of them.

## Package Legitimacy Audit

slopcheck could not be installed here (`pip` refused: no virtualenv). **Per protocol every package is tagged `[ASSUMED]` for provenance and the planner must gate each install behind a `checkpoint:human-verify`.** Supporting evidence is below; it is stronger than registry existence alone.

| Package                        | Registry | Age             | Source Repo                                                                                                                                                                                | slopcheck | Disposition                                                    |
| ------------------------------ | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------- |
| `@better-auth/oauth-provider`  | npm      | created 2025-12 | github.com/better-auth/better-auth (official monorepo; maintainers bekacru + better-gustavo; documented by name in Better Auth's own option JSDoc and in the `@better-auth/cimd` peerDeps) | n/a       | `[ASSUMED]`, human-verify gate. Evidence strongly favors legit |
| `@modelcontextprotocol/server` | npm      | 2026-04         | github.com/modelcontextprotocol/typescript-sdk (maintainers include `@anthropic.com`, `@modelcontextprotocol.io`)                                                                          | n/a       | `[ASSUMED]`, human-verify gate                                 |
| `@modelcontextprotocol/client` | npm      | 2026-04         | same monorepo                                                                                                                                                                              | n/a       | `[ASSUMED]`, human-verify gate                                 |
| `@modelcontextprotocol/hono`   | npm      | 2026-04         | same monorepo                                                                                                                                                                              | n/a       | `[ASSUMED]`, optional                                          |

**Removed:** none. **Suspicious:** none observed (no postinstall scripts; official maintainers).

## Architecture Patterns

### System Architecture Diagram

```
 MCP client (Claude.ai / ChatGPT / Desktop / Cursor)
   │ 1. GET /mcp (no token)  ─────────────►  Cloudflared ─► Next (web) ─rewrite─► API
   │ ◄─ 401 + WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"
   │ 2. GET /.well-known/oauth-protected-resource      (API: oauthProviderResourceClient.getProtectedResourceMetadata)
   │ 3. GET /.well-known/oauth-authorization-server[/auth]  (API: oauthProviderAuthServerMetadata(auth))
   │ 4. POST /auth/oauth2/register  (DCR, open)
   │ 5. browser → /auth/oauth2/authorize?resource=…&code_challenge=…&scope=read[ write]
   │        └─ no session → loginPage (web /sign-in) → back → consentPage (web /oauth/consent)
   │              └─ user Allow → POST /auth/oauth2/consent → redirect_uri?code=…
   │ 6. POST /auth/oauth2/token  → JWT access (aud = https://<host>/mcp, short TTL) + rotating refresh
   │ 7. POST /mcp  Authorization: Bearer <jwt>
   ▼
 API  tracingMiddleware → errorMiddleware → /mcp handler
        ├ verifyAccessTokenRequest (jwks local, aud=resource, requiredScopes) → {sub=userId, azp=clientId, scope}
        ├ rate limit (per client+user: 60R / 20W per min; daily entries from write log)
        └ createMcpHandler(factory).fetch(req,{authInfo})  → McpServer per request
              tool call ─► scope gate (write?) ─► internalDispatch(app, userId, method, path, body, Idempotency-Key)
                                   │   WeakMap<Request,userId> → authMiddleware sets session
                                   ▼
                   existing stack: tenantGuard(X-Budget-ID membership) → idempotency → routes
                                   → use case → withTenantTx (RLS) → syncReserveTopup etc.
              write tool ─► mcp_write_log row (client, call, entity, before/after, batch)
              import_preview ─► validate + dedupe + FX/category check → mcp_import_previews(id, payload hash, ttl)
              import_commit ─► sequential dispatch under batchId; any failure ⇒ auto-undo of the batch
```

### Recommended Project Structure

```
apps/api/src/mcp/
├── handler.ts            # createMcpHandler factory + bearer verify + authInfo + 401 challenge
├── server.ts             # buildMcpServer(ctx): registers tools/prompts (one per file below)
├── dispatch.ts           # internalDispatch(app, userId, ...) + WeakMap registry
├── limits.ts             # per-conn 60R/20W (checkAndRecord) + daily entries (write-log SUM)
├── money.ts              # decimal string + currency <-> minor units (big.js; 2-dp fiat)
├── tools/{read,write,import,undo}.ts
├── prompts.ts
├── write-log-repo.ts     # adapter calls only in packages (see below)
└── well-known.ts         # /.well-known/* routes (protected-resource + AS metadata)
packages/platform/src/mcp/   # schema.ts (write_log, import_previews), repo.ts → Drizzle ONLY here
packages/identity/…/better-auth.ts   # + jwt() + oauthProvider({...}); schema for 8 tables
drizzle/0106_mcp_oauth.sql    # + journal entry (hand-authored SQL MUST be in _journal.json)
apps/web/src/app/[locale]/oauth/consent/   # consent page
apps/web/src/app/[locale]/(app)/settings/connected-apps/   # list + Disconnect
```

Keep MCP in `apps/api/src/mcp/` and the Drizzle bits in `packages/platform`. That means **no new workspace package**, so none of the "COPY in every Dockerfile" wiring applies. Routes under `apps/api/src/routes/` each need a matching test file (`route-coverage-audit.test.ts`), so the MCP adapter lives in `src/mcp/`, not `src/routes/`.

### Pattern 1: Authorization server (Better Auth plugins)

**What:** add `jwt()` and `oauthProvider()` to `additionalPlugins` in `boot.ts`, and the new tables to `additionalSchema`. Both are passed to `createAuth`, which builds the Drizzle adapter `schema` map.
**Options verified in 1.7.15 d.mts:** `loginPage` (required), `consentPage`, `scopes`, `allowDynamicClientRegistration`, `allowUnauthenticatedClientRegistration`, `clientRegistrationDefaultScopes`, `clientRegistrationAllowedScopes`, `clientRegistrationRequirePKCE`, `validateRedirectUri`, `resources`, `accessTokenExpiresIn` (default 3600), `refreshTokenExpiresIn` (default 2 592 000 s), `refreshTokenReuseInterval` (default 0), `rateLimit`, `customAccessTokenClaims`, `disableJwtPlugin`, `cachedTrustedClients`.

```typescript
// Source: @better-auth/oauth-provider@1.7.15 dist/*.d.mts (option names verified); values are the recommendation
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

additionalPlugins: [
  tenancy.organizationPlugin,
  jwt(),
  oauthProvider({
    loginPage: "/sign-in",
    consentPage: "/oauth/consent",
    scopes: ["read", "write", "offline_access"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true, // MCP clients register anonymously (D-05)
    clientRegistrationDefaultScopes: ["read"],
    clientRegistrationAllowedScopes: ["write", "offline_access"],
    resources: [`${env.BETTER_AUTH_URL}/mcp`], // audience; clients send RFC 8707 `resource`
    accessTokenExpiresIn: 600, // short (D-06)
    refreshTokenExpiresIn: 60 * 60 * 24 * 365 * 5, // see Pitfall 3: verify sliding vs absolute
    // consent is per (client,user): all budgets (D-01) — no consentReferenceId
  }),
];
```

Better Auth lives under `basePath: "/auth"`, so the **issuer is `https://<web>/auth`**. RFC 8414 puts that metadata at `/.well-known/oauth-authorization-server/auth`. The plugin exports `oauthProviderAuthServerMetadata(auth)` and `oauthProviderOpenIdConfigMetadata(auth)` as plain `(Request)=>Response` handlers for this basePath case. Mount them on the API at the well-known paths, and rewrite those paths in Next. The protected-resource doc (RFC 9728) comes from `oauthProviderResourceClient(auth).getProtectedResourceMetadata({resource, authorization_servers:[issuer], scopes_supported:["read","write"]})`, served at `/.well-known/oauth-protected-resource` (and the `/mcp` suffixed path).

### Pattern 2: `/mcp` endpoint

```typescript
// Source: @modelcontextprotocol/server@2.4.0 createMcpHandler d.mts + hono README
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
const mcp = createMcpHandler((ctx) => buildMcpServer(ctx, deps), {
  /* legacy: 'stateless' default */
});

app.all("/mcp", async (c) => {
  const claims = await verifyBearer(c.req.raw); // oauthProviderResourceClient.verifyAccessTokenRequest
  if (!claims) return challenge401(c); // WWW-Authenticate: Bearer resource_metadata="…"
  // rate-limit here (per client+user)
  return mcp.fetch(c.req.raw, {
    authInfo: {
      token,
      clientId: claims.azp,
      scopes: claims.scope.split(" "),
      extra: { userId: claims.sub },
    },
  });
});
```

- Put the route **after** `tracingMiddleware` and `errorMiddleware` but **before** `authMiddleware`/`tenantGuard` (it does its own bearer auth, so cookies are irrelevant). Do not mount it under `requireAuth`.
- Tools read `authInfo` from their handler context (field name per v2 `ToolCallback` ctx, to be confirmed in code). Build the McpServer per request from the factory, with no module state.
- Use JSON responses (no streaming needed). Responses go through Next's rewrite, and an SSE hop there is a risk. The default `auto` upgrades to SSE only when a handler emits related messages first, which our tools never do.
- Scope enforcement: write tools check `authInfo.scopes.includes("write")` and use `scopeChallenge` so the client can re-authorize for step-up. Reads never need more than `read`.

### Pattern 3: Route-dispatch tool adapter (zero duplicated domain logic)

```typescript
// dispatch.ts — the WeakMap is why external callers cannot spoof the user
const internal = new WeakMap<Request, { userId: string; clientId: string }>();
export function dispatch(app: Hono, who, method, path, body?, idemKey?) {
  const req = new Request(`http://internal${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-budget-id": budgetId,
      ...(idemKey && { "idempotency-key": idemKey }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  internal.set(req, who);
  return app.fetch(req);
}
// authMiddleware: const w = internal.get(c.req.raw); if (w) { c.set("session", {user:{id:w.userId,...}}); return next(); }
```

`authMiddleware` currently calls `auth.api.getSession` from cookies. Add one branch for internal requests (the user's `locale` for i18n can come from `identity.userRepo.findById`). Verify Hono keeps `c.req.raw` identity through `app.fetch(req)`; a one-line unit test pins this.

**Tool map** (existing route/use case, or GAP):

| MCP tool                                 | Wraps                                                                                        | Notes                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_budgets`                           | `GET /budgets/active` (`workspaceRepo.listForUser`)                                          | dynamic membership, D-01                                                                                                                                                                                                                                                                                                     |
| `get_budget_overview`                    | `GET /budgets/:id/overview/{cards,planned,wealth,projection,overspent-reserves,reserve-fit}` | D-23                                                                                                                                                                                                                                                                                                                         |
| `list_categories`                        | `GET /budgets/:id/categories`                                                                |                                                                                                                                                                                                                                                                                                                              |
| `search_transactions`                    | **GAP**                                                                                      | `transactions GET` is month-only. `search-transactions.ts` has no route and uses the legacy `corrects_id` "latest-only" model. Write a new read query over `expense_ledger` with `deleted_at IS NULL`, cursor `(transaction_date,id)`, 200/page, and reuse its cursor shape. Return user text as labelled data fields (D-20) |
| `spending_summary(range,groupBy)`        | **GAP (partial)**                                                                            | `GET …/spendings-summary?month=` is month-only. Either loop months in the tool (up to N months) or add a range use case. Prefer the loop (reuse) and cap the range                                                                                                                                                           |
| `get_reserves`                           | `GET /budgets/:id/reserves`, `…/overview/reserve-fit`                                        |                                                                                                                                                                                                                                                                                                                              |
| `get_projection`                         | `GET …/overview/projection`                                                                  |                                                                                                                                                                                                                                                                                                                              |
| `list_tasks`                             | `GET /budgets/:id/tasks?status=pending`                                                      |                                                                                                                                                                                                                                                                                                                              |
| `list_wallets`                           | `GET /budgets/:id/wallets` (also root `/wallets`)                                            |                                                                                                                                                                                                                                                                                                                              |
| `list_investments`                       | `GET …/investments`, `…/type-summary`, `…/:id/entries`                                       |                                                                                                                                                                                                                                                                                                                              |
| `list_scheduled_payments`                | `GET …/scheduled-payments`                                                                   | words: "unconfirmed scheduled payment", never "draft"                                                                                                                                                                                                                                                                        |
| `get_fx_rate`                            | `GET /fx/rate`                                                                               |                                                                                                                                                                                                                                                                                                                              |
| `add_transactions(batch,idempotencyKey)` | `POST …/transactions` (spend), `POST …/incomes`                                              | per-row key = `${batchKey}:${i}`; the Idempotency middleware is header-driven                                                                                                                                                                                                                                                |
| `edit_transaction`                       | `PATCH …/transactions/:txId`                                                                 | capture before via GET                                                                                                                                                                                                                                                                                                       |
| `delete_transaction` (not "void")        | `DELETE …/transactions/:txId` → `softDelete`                                                 | D-09                                                                                                                                                                                                                                                                                                                         |
| `sync_wallet_balance`                    | `PUT /wallets/:id/balance` (`setWalletBalance`)                                              | route returns old→new? confirm, else GET before                                                                                                                                                                                                                                                                              |
| `record_investment_transaction`          | `POST …/investments/:id/{buy,sell,transfer}`, `POST …/investments`                           | newest-first delete via `DELETE …/investments/entries/:entryId`                                                                                                                                                                                                                                                              |
| `update_holding_value`                   | `PATCH …/investments/:id` (`editAsset`) / manual price path                                  | confirm the exact field for manual-priced assets                                                                                                                                                                                                                                                                             |
| `confirm_scheduled_payment`              | `POST …/scheduled-payments/drafts/:id/confirm`                                               |                                                                                                                                                                                                                                                                                                                              |
| `complete_task`                          | `POST …/tasks/:taskId/resolve`                                                               |                                                                                                                                                                                                                                                                                                                              |
| `set_category_limit`                     | `POST /budgets/:id/categories/:id/limits`                                                    |                                                                                                                                                                                                                                                                                                                              |
| category create / rename / archive       | `POST /categories`, `PATCH /:id`, `POST /:id/archive`                                        | no currency change, no hard delete (excluded)                                                                                                                                                                                                                                                                                |
| scheduled payments CRUD                  | `POST/PATCH/DELETE …/scheduled-payments`                                                     |                                                                                                                                                                                                                                                                                                                              |
| `budget_create`                          | `POST /budgets`                                                                              | D-04. Budget currency is chosen at creation; changing it is excluded                                                                                                                                                                                                                                                         |
| `import_*`, `undo`                       | **GAP**                                                                                      | Pattern 4 and Pattern 5                                                                                                                                                                                                                                                                                                      |

Route money is **integer minor units** (`amount_original_cents`). The MCP boundary takes `{ amount: "12.34", currency }` strings and converts with `big.js`. All eight supported fiat codes are 2-decimal; reject unsupported currencies and over-precision. A `no-float-money` ESLint rule exists (`local/no-float-money`), so keep it passing.

### Pattern 4: Write log + agent undo (D-08, D-11)

`shared_kernel.audit_history` is **not** reusable: it has only `actorUserId`, an `INSERT`-only enum action, and no UPDATE grant (so no `reverted_at`). Add `shared_kernel.mcp_write_log`:
`id, tenant_id, user_id, client_id, call_id, batch_id NULL, tool, entity_type, entity_id, op (create|update|delete), before_jsonb, after_jsonb, entry_count, created_at, reverted_at NULL`.
Use the same tenant-isolation policy as `audit_history`, and grant `SELECT, INSERT` plus `UPDATE (reverted_at)` to `app_role`. **Put the GRANTs in `post-migration.sql`**, because post-migration REVOKEs wipe column grants. This daily-sum source also powers D-25.

Undo shape (recommended): `undo(call_id | batch_id)` plus `list_recent_writes(limit)`, so the agent can see what it may undo. Inverses:

- **create** → `softDelete` (spendings and incomes) or the investment newest-first delete.
- **delete** → a new `restore(txId)` repo method that sets `deleted_at = NULL` (column-grantable). Investment-entry deletes also move wallets, so restore there is **not** trivial; mark investment-entry delete as non-undoable and say so in the tool description.
- **update** → PATCH back to `before`.

Never clobber hand edits: before applying an inverse, fetch the current row and compare `updated_at` (or a hash of the mutable columns) with the `after_jsonb` recorded at write time. If it differs, skip that entity and report `skipped_changed_since`. Undo itself writes a log row but is not undoable. Undo window: recommend 7 days, as a constant.

### Pattern 5: Import (preview, commit, undo)

No server-side format parsers. The agent sends strict JSON, at most 500 rows per call (D-13).

- `import_preview(budget_id, kind, rows[])` validates every row with the same Zod schemas as the routes. It checks:
  - category ids/names exist (unknowns reported as `{name, suggestions}`);
  - FX availability per `(currency, date)` through the existing FX provider/cache (gaps reported);
  - duplicates by `(date, amount, category)` against live `expense_ledger`.

  It stores `{previewId, tenant, user, client, payload_hash, normalised rows, issues}` with a **1 h TTL** in `shared_kernel.mcp_import_previews` (RLS, user-scoped). It returns `issues` and `clean: boolean`.

- `import_commit(previewId, resolutions)` applies the resolutions (skip dupes, category map, create-new categories) and re-validates. It then dispatches the rows sequentially under one `batch_id`, logging each created entity.
- **Atomicity (D-15 "no partial saves"):** use cases each open their own `withTenantTx`, so there is no single transaction. Pre-validate everything in preview and commit. If any row still fails, **auto-run `undo(batch_id)`** and return an error. This is compensating atomicity, and it is honest in the tool text.
- Reserve/cushion/task recomputes: the routes already call `syncReserveTopup` per write. For 500 rows, rely on the existing per-row behaviour first. Measure it, and batch the recompute only if it is slow, because the `reserveReadCache` is invalidated by writes (see the middleware).

### Pattern 6: Consent + Connected apps

- Consent page (`/oauth/consent`, next-intl, EN/PL/UK): it receives `client_id`, `scope`, etc. as query params and shows the client name, an explicit "all your budgets" statement, and read vs write. It posts `{accept, scope}` to `/auth/oauth2/consent`. Use the `oauthProviderClient` plugin of `authClient` if it is exposed (`@better-auth/oauth-provider/client`), otherwise raw `fetch`. **Never say "draft"** in any copy.
- Connected apps = `GET /auth/oauth2/get-consents` (joined to `oauthClient.name`). Disconnect = `POST /auth/oauth2/delete-consent` **plus revoking that client's access and refresh tokens for the user** (confirm in the Wave-0 spike that deleting consent invalidates refresh; if not, delete `oauthRefreshToken` and `oauthAccessToken` rows for `(clientId, userId)` in the same operation). "Last used" = latest `oauthAccessToken.createdAt` (a token is minted at most every `accessTokenExpiresIn`) or `max(mcp_write_log.created_at)`. Choose the former and document that it is approximate.
- The web layer must keep `/.well-known/*`, `/mcp`, and `/auth/*` off next-intl middleware. `proxy.ts` currently matches everything except `api|_next|files with an extension`; `/mcp` and `/.well-known/…` (starting with a dot) are NOT excluded. Add them to the negative matcher and add Next `rewrites` to the API.

### Pattern 7: Rate limiting (D-24/25)

`checkAndRecord(key, windowSec, max)` is a fixed-window in-memory counter. Use `mcp:${clientId}:${userId}:r` (60/60) and `:w` (20/60). Write calls count as 1 per call. This is fine for one API instance and is allowed to reset on restart (record that decision). The daily cap counts **entries**, not calls: `SUM(entry_count) FROM mcp_write_log WHERE client_id=? AND user_id=? AND created_at > now()-interval '24 hours'`, checked against 5000 **before** executing, and the batch size counts toward it. Return an MCP tool error (`isError`) with `retry_after`, plus HTTP 429 at the transport level for the per-minute limits. Better Auth's own `rateLimit` option covers `/oauth2/register` and `/token` abuse, and unauthenticated DCR is the open door that needs it.

### Anti-Patterns to Avoid

- **Re-implementing routes' side effects in tools.** Dispatch instead.
- **A header like `x-mcp-user` for internal auth.** Spoofable. Use the WeakMap.
- **Per-budget consent or scope.** D-01/D-02 are locked.
- **Reversal entries or a visible "via client" badge.** Overridden by D-07/D-09.
- **A sessionful MCP server.** The factory is per request, so there is nothing to lose on API restart and no sticky routing.
- **Auto-instrumentation assumptions under Bun.** `/mcp` rides `tracingMiddleware` and the existing `instrumentPool`.
- **Exfiltration tools** (email, push, share link, webhook, generic query). They stay excluded.

## Don't Hand-Roll

| Problem                                                                                     | Don't Build                   | Use Instead                                                  | Why                                                                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| OAuth AS (DCR, PKCE, refresh rotation, replay detection, consent, revoke, introspect, JWKS) | Custom token endpoints        | `@better-auth/oauth-provider` + `jwt`                        | Spec edge cases (rotation races, audience binding, redirect validation) are already handled and tested |
| JWT access-token verification                                                               | Manual `jose` + claims checks | `oauthProviderResourceClient.verifyAccessTokenRequest`       | Audience, issuer, scope and DPoP binding handled                                                       |
| Protected-resource metadata                                                                 | Hand-written JSON             | `getProtectedResourceMetadata`                               | RFC 9728 shape                                                                                         |
| MCP protocol, JSON-RPC, tool schemas                                                        | Custom JSON-RPC over Hono     | `createMcpHandler`                                           | Protocol versions, error ladder, legacy fallback                                                       |
| Idempotent batch writes                                                                     | New dedupe table              | Existing `Idempotency-Key` middleware + derived per-row keys | Already tenant+user scoped, with body-hash mismatch detection                                          |
| Money parse/format                                                                          | `parseFloat`                  | `big.js` via a boundary helper                               | Float money is banned                                                                                  |
| Tenant authorization                                                                        | Re-check membership in tools  | `tenantGuard` via `X-Budget-ID` on dispatch                  | Already proven by the ci-gate tenant-leak tests                                                        |

**Key insight:** the risk in this phase is not protocol plumbing (both packages handle it). It is _drift_ between the MCP path and the web path, plus the lifecycle of OAuth data under RLS and GDPR. Choose designs that make drift structurally impossible.

## Runtime State Inventory

Not a rename or refactor phase, so omitted. One cross-cutting state concern is captured as Pitfall 8 (account-deletion cascade).

## Common Pitfalls

### Pitfall 1: Better Auth 1.7.x Drizzle schema-mismatch gate

**What goes wrong:** plugins declare fields and 1.7.x refuses sign-up if the Drizzle adapter schema lacks any of them (the 0103 incident: `Missing columns session.activeOrganizationId…`).
**Why:** `createAuth` builds an explicit `schema: {user, session, account, verification, ...additionalSchema}` map.
**How to avoid:** generate the reference with `bunx @better-auth/cli generate` (a scratchpad copy, never committed as-is), then hand-write the 8 Drizzle tables in the `identity` schema:

- `oauth_client`, `oauth_access_token`, `oauth_refresh_token`, `oauth_consent`, `oauth_resource`, `oauth_client_resource`, `oauth_client_assertion`, and `jwks`.
- Match the field lists read from the tarball. Match `casing: "snake_case"` and uuid columns, since `generateId` is `crypto.randomUUID()` and `user_id` must be `uuid`.
- Register `0106_*.sql` in `drizzle/meta/_journal.json`.
- RLS and grants: Better Auth uses `betterAuthPool()` with `app.better_auth='on'`. Mirror the `sessions`/`accounts` pattern in `post-migration.sql`, because a bare `app_role` without the marker is blocked by FORCE RLS. Missing this gives silent no-ops, as in the earlier session-revoke bug.
  **Warning signs:** `Drizzle schema mismatch` at first request; an authorize or token call that returns success while no row exists.
  **Gate:** `bun test packages/identity packages/tenancy` must stay 99/0, plus a new `oauth-provider` DCR→token round-trip test.

### Pitfall 2: No refresh token without `offline_access`

Source shows refresh tokens are issued only when the (existing or requested) scopes include `offline_access`. MCP clients may or may not request it. Without it D-06 silently becomes "1 hour, then re-consent". **Avoid:** list `offline_access` in `scopes_supported` (protected-resource metadata and AS config), make it a default client scope, and, if clients still omit it, inject it for DCR-registered clients (a `before` hook on `/oauth2/authorize`, or `clientRegistrationDefaultScopes`). **Spike with a real Claude.ai connection** and the SDK client.

### Pitfall 3: Refresh expiry may be absolute, not sliding

On rotation the source computes the new refresh `exp` as `payload.exp ?? iat + refreshTokenExpiresIn`, which reads as inheriting the old token's expiry, so a connection would die at the original TTL. D-06 wants no idle expiry. **Avoid:** set `refreshTokenExpiresIn` very large (years) and **test empirically** that a refreshed token's `expiresAt` is or is not extended. If it is absolute, accept a multi-year cap and record it. Do not hand-roll a rotation.

### Pitfall 4: Metadata path insertion and the public host

Issuer is `https://<web>/auth` (path component), so clients look for `/.well-known/oauth-authorization-server/auth` and `/.well-known/oauth-protected-resource[/mcp]` **at the web host root**. Without Next rewrites the tunnel returns a Next 404 and every client says "failed to connect" with no detail. **Avoid:** rewrites for `/mcp` and `/.well-known/:path*` → API, keep both off next-intl `proxy.ts`, and an E2E that GETs each metadata URL through the public host. Compose-smoke should check the public-host path.

### Pitfall 5: Service worker / Next streaming

The Serwist SW only handles browser navigations on the web origin, so server-to-server MCP is unaffected. Next rewrites buffer and may time out long SSE streams. Keep tool calls short and JSON-only, and set an explicit upper bound on import commit duration by chunking (500 rows is the cap).

### Pitfall 6: Hono identity and idempotency semantics for dispatch

The Idempotency middleware replays cached `(status, body)` and returns 422 on same key with a different body. Per-row keys must be deterministic from `(callKey, index)`, and the batch tool must hash its input so a retried call with the same key and same rows is a no-op, not a duplicate-row writer. Also: the middleware keys on `session` + `tenantIds`, so the internal request must pass `tenantGuard` normally (do not bypass it).

### Pitfall 7: Docker images do not hot-reload; Next bump gate

API, worker and web run from prebuilt images: rebuild `api` and `web` after every change, and verify the served bundle. Do not bump `next` or `better-auth`. `@better-auth/oauth-provider` must be exactly 1.7.15 (peers `better-auth ^1.7.15`), added to root `overrides` so dependabot cannot silently "bump" it.

### Pitfall 8: GDPR cascade and RLS for the new tables

`purgeUserData` enumerates `TENANT_TABLES` by hand ("enumerated from the live DB, NOT guessed"). A new tenant-scoped table that is not listed leaves orphaned PII. **Avoid:** add `shared_kernel.mcp_write_log` and `shared_kernel.mcp_import_previews` to the account-deletion cascade (or, like `audit_history`, rely on there being no DELETE grant and the DEK crypto-shred, and say so explicitly). Add the user's OAuth consents, tokens and clients to the user-level step. Extend `account-deletion-cascade.test.ts`. The write log's `before/after` contains amounts and notes, which is PII: encrypt or exclude `note` text, matching how the audit table treats it ("sensitive content is DEK-encrypted").

### Pitfall 9: Untrusted text and the "lethal trifecta"

Notes, category names and member-authored text are attacker-controllable through shared budgets and imports. Return every user-authored string inside a labelled field (e.g. `{"note": {"untrusted_user_text": "…"}}`) and add a fixed server instruction to tool descriptions. Expose **no outbound channel**: no email, push, share-link, webhook, URL fetch, or generic query tool. A test asserts the registered tool-name allowlist so nobody adds one by accident.

### Pitfall 10: `readOnlyHint` correctness

Annotations are advisory but clients (Claude.ai) use them for auto-approval. Mark reads `readOnlyHint: true`; mark delete, undo, import-commit, and `sync_wallet_balance` `destructiveHint: true` (it overwrites a stored value). A test iterates the registry and asserts every non-allowlisted-read tool lacks `readOnlyHint`.

### Pitfall 11: Test pollution and flakes

A `startTracing()` global provider means MCP tests must `trace.disable()` first. The "make test" infra has about 292 pre-existing failures, so run the correct runners and use the targeted commands below. Tests use `app_role`, not superuser.

## Code Examples

### Verify bearer, then hand to the SDK

```typescript
// Source: @better-auth/oauth-provider resource-client d.mts; @modelcontextprotocol/server createMcpHandler d.mts
const rs = oauthProviderResourceClient(); // no auth arg: pass issuer + jwksUrl explicitly
const payload = await rs.getActions().verifyAccessTokenRequest(c.req.raw, {
  verifyOptions: {
    issuer: `${env.BETTER_AUTH_URL}/auth`,
    audience: `${env.BETTER_AUTH_URL}/mcp`,
  },
  jwksUrl: "http://localhost:4000/auth/jwks", // internal loopback, not the public URL
  requiredScopes: ["read"],
});
```

(`getActions()` is used on the plugin object; the project may call `auth.api` helpers instead. Confirm the exact call shape against `dist/client-resource.mjs` during the first task.)

### Tool with annotations and a write-scope gate

```typescript
// Source: @modelcontextprotocol/server registerTool signature (annotations, scopeChallenge)
server.registerTool(
  "add_transactions",
  {
    description:
      "Add spendings/incomes. Amounts are decimal strings. Returns created ids.",
    inputSchema: z.object({
      budget_id: z.uuid(),
      idempotency_key: z.string().min(8),
      rows: z.array(txRow).max(500),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args, ctx) => {
    /* scope gate -> limits -> dispatch -> write_log */
  },
);
```

## State of the Art

| Old Approach                                              | Current Approach                                                                                    | When Changed               | Impact                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| Better Auth `mcp()` / `oidc-provider` plugin in core      | Separate `@better-auth/oauth-provider` (+ `jwt`)                                                    | 1.7.x                      | The CONTEXT "open research item" is resolved: use the package    |
| `@modelcontextprotocol/sdk` v1 + manual transport/session | `@modelcontextprotocol/server` v2 `createMcpHandler`, per-request server, stateless legacy fallback | v2 stable, spec 2026-07-28 | No sessions; Bun/Hono via `handler.fetch`                        |
| DCR as the MCP client-registration mechanism              | Client ID Metadata Documents preferred; DCR deprecated but still supported                          | spec 2025-11 to 2026-07-28 | D-05 (DCR) still works. Keep an eye on CIMD, see Open Question 3 |

**Deprecated/outdated:** `next-pwa`, Lucia, etc. per CLAUDE.md. The `mcp()` Better Auth plugin is gone from the bundle.

## Assumptions Log

| #   | Claim                                                                                                        | Section                  | Risk if Wrong                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Claude.ai and ChatGPT can complete the flow with DCR-only (no CIMD) against this AS                          | Summary / Alternatives   | If either requires CIMD, the connection fails and we need `@better-auth/cimd`, which forces a better-auth and oauth-provider bump to 1.7.17 (held-back gate) |
| A2  | MCP clients will request `offline_access` or accept it being defaulted                                       | Pitfall 2                | No refresh token, so a 10-minute connection and D-06 violated                                                                                                |
| A3  | Refresh `exp` is inherited on rotation (absolute)                                                            | Pitfall 3                | If sliding, a smaller cap is fine; if absolute, pick a very large TTL                                                                                        |
| A4  | `deleteConsent` revokes outstanding refresh tokens                                                           | Pattern 6                | Disconnect leaves a live token, which is a security bug, so the spike must verify and the code must delete tokens explicitly if not                          |
| A5  | v2 tool callback context exposes `authInfo` as `ctx.http?.authInfo` (exact field unverified)                 | Pattern 2                | Small refactor; pin with a first test                                                                                                                        |
| A6  | Packages are legitimate (slopcheck unavailable)                                                              | Package Legitimacy Audit | Gate behind human-verify                                                                                                                                     |
| A7  | Restoring a soft-deleted transaction by `deleted_at = NULL` is safe w.r.t. reserve replay and summary caches | Pattern 4                | Wrong reserves after undo; must call `syncReserveTopup` and invalidate `reserveReadCache`                                                                    |
| A8  | `PUT /wallets/:id/balance` response contains old to new values                                               | Tool map                 | If not, tool does a GET first                                                                                                                                |
| A9  | Routes do not enforce a per-role check beyond membership (so D-03 is satisfied by reuse)                     | Tool map                 | Tools must replicate role checks if routes differ by role                                                                                                    |

## Open Questions

1. **Does Claude.ai/ChatGPT DCR + `offline_access` + refresh work end to end against this AS?**
   - Known: the AS supports DCR/PKCE/rotation. Unknown: what scopes the clients request, and whether they send RFC 8707 `resource`.
   - Recommendation: **Wave 0 spike (first plan)** with the SDK client plus one real Claude.ai connection through the tunnel. Do not finalise token-TTL config until it passes.
2. **Atomic import.** Compensating undo (chosen) vs. a bulk path that opens one `withTenantTx` for many rows. The latter means new bulk use cases, which breaks "zero duplicated logic". Recommendation: compensating undo, with the failure path tested.
3. **CIMD.** The spec direction is CIMD-first. If A1 fails, the cheapest fix is `@better-auth/cimd` plus a deliberate bump to 1.7.17 under the CLAUDE.md gate (`bun test packages/identity packages/tenancy`, then `make build-web`). Out of scope unless the spike fails.
4. **Daily 5 000 cap definition.** "Written entries" counts rows created or changed per client per user over a rolling 24 h. Confirm, and decide whether undo counts. Recommendation: undo does not count.
5. **Investment-entry undo.** Sell/transfer move wallets and linked entries (Phase 13.1). Recommendation: mark investment mutations non-undoable in v1 except create-asset, and say so in the tool descriptions. Confirm with the user.
6. **Last-used source** for Connected apps (token mint time vs. write log). Recommendation: token mint time.

## Environment Availability

| Dependency                  | Required By                                  | Available                                      | Version | Fallback                            |
| --------------------------- | -------------------------------------------- | ---------------------------------------------- | ------- | ----------------------------------- |
| Bun                         | runtime/tests                                | yes                                            | 1.3.12  | —                                   |
| Node                        | tooling (npm view, inspector)                | yes                                            | 22.22.2 | —                                   |
| Docker                      | image rebuild, compose-smoke, testcontainers | yes                                            | 29.8.0  | —                                   |
| Postgres (real, via Docker) | integration tests, RLS                       | yes (project requires Docker on)               | —       | — (no DB mocking)                   |
| npm registry                | install                                      | yes                                            | —       | —                                   |
| Public tunnel (cloudflared) | real-client E2E (Claude.ai)                  | project-managed; **never restart cloudflared** | —       | SDK client + MCP Inspector locally  |
| slopcheck                   | package audit                                | **no** (pip needs a venv)                      | —       | human-verify checkpoint per package |

**Missing with no fallback:** none. **Missing with fallback:** slopcheck.

## Validation Architecture

### Test Framework

| Property     | Value                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend      | `bun:test` (apps/api integration against real Postgres, packages unit)                                                                        |
| Frontend     | Vitest 4 + happy-dom (+ RTL) in `apps/web/test`                                                                                               |
| E2E          | Playwright + Gherkin `.feature` + Page Objects + fresh user (`tests/e2e/features`, config `apps/web/playwright.config.ts`); no raw `.spec.ts` |
| MCP protocol | `@modelcontextprotocol/client` inside `bun:test`                                                                                              |
| Config       | `bunfig.toml` (80% domain coverage; do not lower), `apps/web/vitest.config.ts`                                                                |
| Quick run    | `cd apps/api && bun test test/mcp` (needs infisical/DATABASE_URL_APP, see memory notes)                                                       |
| Web quick    | `cd apps/web && bunx vitest run test/<file>`                                                                                                  |
| Full         | `make test`, `make test-e2e`, `make ci-gate`, `cd apps/web && bun run test`                                                                   |

### Phase Requirements → Test Map

| Req          | Behavior                                                                                                                                                                  | Test Type         | Automated Command                                                                       | File Exists? |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------- | ------------ |
| MCP-01       | DCR→authorize→consent→token round-trip, PKCE required, refresh rotates, replay rejected                                                                                   | integration       | `bun test packages/identity/test/oauth-provider.test.ts`                                | Wave 0       |
| MCP-01       | `bun test packages/identity packages/tenancy` stays green (99/0)                                                                                                          | regression gate   | `bun test packages/identity packages/tenancy`                                           | exists       |
| MCP-01       | refresh issued without `offline_access`; refresh expiry behaviour (spike)                                                                                                 | integration       | `bun test apps/api/test/mcp/oauth-lifetime.test.ts`                                     | Wave 0       |
| MCP-02       | no token → 401 + `WWW-Authenticate resource_metadata`; wrong aud → 401; read token on write tool → scope error                                                            | integration       | `bun test apps/api/test/mcp/auth.test.ts`                                               | Wave 0       |
| MCP-02       | metadata at `/.well-known/oauth-protected-resource`, `…/oauth-authorization-server/auth`                                                                                  | integration       | `bun test apps/api/test/mcp/well-known.test.ts`                                         | Wave 0       |
| MCP-04       | every read tool returns the same numbers as its route; search is paged (200) over full history; user text is labelled                                                     | integration       | `bun test apps/api/test/mcp/read-tools.test.ts`                                         | Wave 0       |
| MCP-05       | each write tool produces the same DB state and side effects (reserve task, income-under-planned) as the route; idempotent replay is a no-op                               | integration       | `bun test apps/api/test/mcp/write-tools.test.ts`                                        | Wave 0       |
| MCP-05       | tenant isolation: token of user A cannot touch user B's budget; a budget joined after consent is reachable (D-01); a removed member is not                                | ci-gate extension | `make ci-gate`                                                                          | extend       |
| MCP-06       | undo reverts create/update/delete; skips rows hand-edited since; undo of undo rejected                                                                                    | integration       | `bun test apps/api/test/mcp/undo.test.ts`                                               | Wave 0       |
| MCP-07       | preview reports dupes/unknown cats/FX gaps; commit all-or-nothing (inject failure at row N ⇒ zero rows left); `import_undo`                                               | integration       | `bun test apps/api/test/mcp/import.test.ts`                                             | Wave 0       |
| MCP-08       | 61st read/min and 21st write/min denied; 5001st entry/day denied; limits keyed per connection                                                                             | unit+integration  | `bun test apps/api/test/mcp/limits.test.ts`                                             | Wave 0       |
| MCP-09       | tool-name allowlist: no outbound channel tools; annotations correct (`readOnlyHint` only on reads)                                                                        | unit              | `bun test apps/api/test/mcp/registry.test.ts`                                           | Wave 0       |
| MCP-03       | consent page and Connected apps: render, allow, disconnect ⇒ token stops working                                                                                          | component + E2E   | `cd apps/web && bunx vitest run test/connected-apps.test.tsx`; `make test-e2e` (`@mcp`) | Wave 0       |
| MCP-10       | SDK client lists tools and calls `list_budgets`, `add_transactions`, `undo` end to end through the real stack; Playwright drives consent in 3 locales on a phone viewport | e2e               | `make test-e2e` (`@mcp`)                                                                | Wave 0       |
| MCP-11       | account deletion purges write-log/previews/OAuth rows                                                                                                                     | integration       | `bun test packages/identity/test/account-deletion-cascade.test.ts`                      | extend       |
| (structural) | internal-dispatch identity: `c.req.raw` is the same object; a forged `x-mcp-*` header never authenticates                                                                 | unit              | `bun test apps/api/test/mcp/dispatch.test.ts`                                           | Wave 0       |

### Sampling Rate

- **Per task commit:** the targeted `bun test apps/api/test/mcp/<file>` (red then green), plus `bun test packages/identity packages/tenancy` when auth config changes.
- **Per wave merge:** `make test`, `cd apps/web && bun run test`, `make ci-gate`.
- **Phase gate:** full suite plus `make test-e2e` (stack rebuilt: `make dev-build`, verify the served bundle) plus `bun audit --audit-level=high`.

### Wave 0 Gaps

- [ ] `apps/api/test/mcp/` helpers: `mintMcpToken(user, scopes)` (drives real DCR, authorize, consent and token with PKCE), an SDK-client factory, a `trace.disable()` setup.
- [ ] `packages/identity/test/oauth-provider.test.ts` (OAuth round trip).
- [ ] Spike plan: lifetime behaviour (Pitfall 2/3), consent-delete revokes tokens (A4), real Claude.ai connection through the tunnel.
- [ ] Gherkin feature + page objects for consent and Connected apps (`@mcp`), fresh-user fixture.
- [ ] Framework install: `bun add -d @modelcontextprotocol/client@2.4.0` (gated by the legitimacy checkpoint).
- [ ] Playwright browser: `bunx playwright install chromium` if the cache is stale.

## Security Domain

ASVS level 1 (`security_asvs_level: 1`), `security_block_on: high`.

### Applicable ASVS Categories

| ASVS Category                 | Applies | Standard Control                                                                                                                                 |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2 Authentication             | yes     | Better Auth sign-in for consent; OAuth 2.1 (PKCE S256 mandatory, `clientRegistrationRequirePKCE`), no password grant                             |
| V3 Session Management         | yes     | Access token ≤10 min; rotating refresh with replay detection; Disconnect revokes; consent bound to user and client                               |
| V4 Access Control             | yes     | `read` vs `write` scope gate; membership via `tenantGuard`; RLS; tool allowlist; D-03 (same authz as web)                                        |
| V5 Input Validation           | yes     | Zod on every tool input; 500-row cap; decimal-string money; max payload size (SDK `maxRequestBodySize` 4 MiB default); reject unknown currencies |
| V6 Cryptography               | yes     | Better Auth + jose-signed JWTs from `jwt` plugin; never hand-roll; client secrets hashed via `storeClientSecret` default                         |
| V7/V8 Error + data protection | yes     | No query parameters or amounts in spans/logs (existing rule); write-log PII handling (Pitfall 8)                                                 |
| V13 API                       | yes     | Per-connection rate limits; 429 + `retry_after`; Better Auth `rateLimit` on register and token                                                   |

### Known Threat Patterns for this stack

| Pattern                                                                         | STRIDE                      | Standard Mitigation                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection through notes, imports or shared-budget text, then tool misuse | Tampering / Info disclosure | Labelled untrusted fields; no exfiltration tools; destructive annotations; rate and entry caps; write scope opt-in                          |
| Anonymous DCR abuse (client spam, malicious redirect URIs)                      | DoS / Spoofing              | `validateRedirectUri` (https or loopback only; no wildcard); rate limit `/register`; consent screen shows the client name and redirect host |
| Token theft or replay                                                           | Spoofing                    | Short access TTL; refresh rotation + replay revoke; `aud` = `/mcp` only; `resource` binding                                                 |
| Confused deputy: token used on web API                                          | Elevation                   | Cookie/session routes don't accept bearer tokens; only the internal-dispatch WeakMap grants a session                                       |
| Header spoofing of the internal user                                            | Spoofing                    | WeakMap keyed by the Request object, never a header                                                                                         |
| Cross-tenant access via `budget_id` argument                                    | Info disclosure             | Dispatch passes through `tenantGuard` membership check + RLS; ci-gate extended                                                              |
| Open redirect/phishing on consent page                                          | Spoofing                    | Better Auth validates redirect URIs at registration and authorize; consent page renders only server-verified client data                    |
| Mass write / data destruction by a runaway agent                                | Tampering / DoS             | 20 writes/min, 5000 entries/day, 500/row call, undo log, no hard or bulk delete tools                                                       |
| DNS rebinding                                                                   | Spoofing                    | Host check not needed: public host only; SDK has `hostHeaderValidation` if exposed on localhost                                             |
| CORS on `/mcp`                                                                  | Spoofing                    | No wildcard; browser-based inspectors need an explicit allowlist (not required for Claude.ai/ChatGPT server-side connectors)                |

## Sources

### Primary (HIGH confidence)

- `@better-auth/oauth-provider@1.7.15` tarball (`npm pack`): `dist/index.d.mts`, `oauth-*.d.mts`, `client-resource.d.mts`, `authorize-*.mjs`, `utils-*.mjs`. Verified option names, endpoints (`/oauth2/register|authorize|token|consent|revoke|introspect|get-consents|delete-consent`), table model names and fields, `offline_access` rule, refresh rotation code, peer deps.
- `@modelcontextprotocol/server@2.4.0` tarball: `README.md`, `createMcpHandler-*.d.mts`, `mcp-*.d.mts` (`registerTool` annotations and `scopeChallenge`, `registerPrompt`, `authInfo` pass-through, legacy stateless fallback).
- `@modelcontextprotocol/hono@2.0.2` README.
- npm registry (`npm view`): versions, dist-tags and peers for oauth-provider, cimd, server, client, hono, sdk, inspector.
- Repo reads: `apps/api/src/{app.ts,boot.ts,middleware/*,routes/*}`, `packages/identity/.../better-auth.ts`, `packages/platform/src/{audit,idempotency,db/tx.ts}`, `apps/migrator/post-migration.sql`, `drizzle/0103*`, `apps/web/{next.config.mjs,proxy.ts}`.

### Secondary (MEDIUM confidence)

- MCP spec search result: authorization pages for 2026-07-28/draft (DCR deprecated, CIMD preferred, RFC 9728 required): https://modelcontextprotocol.io/specification/latest/basic/authorization and https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md. The wording was not fetched in full; the web-fetch tools were blocked in this session.

### Tertiary (LOW confidence)

- None used for decisions. Client behaviour (Claude.ai/ChatGPT DCR, scopes requested) is unverified and sits in Assumptions A1 and A2.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH for existence, versions and option names (read from tarballs); MEDIUM for runtime behaviour (spike).
- Architecture: MEDIUM-HIGH. Route-dispatch is a design recommendation grounded in code reading; the Hono request-identity assumption is pinned by a test.
- Pitfalls: MEDIUM-HIGH. Items 1, 4, 8 come from this repo's own history; 2 and 3 are read from source and need empirical confirmation.

**Research date:** 2026-11-05
**Valid until:** 2026-11-19 (fast-moving: Better Auth ships patch releases weekly; MCP v2 is months old)
