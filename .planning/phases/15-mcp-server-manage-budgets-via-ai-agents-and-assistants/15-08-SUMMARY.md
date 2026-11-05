---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 08
status: complete
---

# 15-08 Summary: Connected apps backend

- `packages/identity/src/adapters/persistence/oauth-connections-repo.ts` (exported from `@budget/identity`): `listConnections`, `disconnect` (refresh + access + consent in one `withUserContext` tx), `hasActiveConsent`, `getClientPublicInfo(userId, clientId)` → name + redirect **hostnames** only.
- `apps/api/src/routes/connected-apps.ts` at `/settings/connected-apps` (before generic `/settings`): `GET /` → `{connections:[{client_id, client_name, scopes (offline_access hidden), connected_at, last_used_at}]}`, `GET /client/:clientId` → `{client_id, client_name, redirect_hosts}` | 404, `DELETE /:clientId` → 204.
- `/mcp` handler: after JWT verify, `hasActiveConsent(sub, azp)` or 401 — disconnect kills an unexpired token immediately.

## Deviations

- **last_used_at = newest refresh-token issue**, not access token: JWT access tokens are never stored in oauth_access_token (only opaque ones are). An active client rotates every ≤10 min.
- `getClientPublicInfo` takes the caller's userId and reads under `withUserContext` (oauth_client has no RLS) instead of `withInfraTx`, which is reserved for infra paths.

## Verification

connected-apps 5/0 (own-only list, B member sees [], 401 unauth, disconnect → live JWT 401 + refresh refused, foreign DELETE no-op, reconnect with write, client info + 404), route-coverage-audit green, test/mcp green (38 total), identity+tenancy gate 0 fail, tsc + eslint clean.
