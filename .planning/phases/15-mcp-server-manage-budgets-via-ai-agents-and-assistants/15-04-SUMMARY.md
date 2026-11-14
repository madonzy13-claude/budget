---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 04
status: complete
---

# 15-04 Summary: schema + migration 0106 applied

## Built

- `packages/identity/src/adapters/persistence/oauth-schema.ts` — 8 tables from the plugins' own `schema` (dumped from `jwt()` + `oauthProvider()` at runtime instead of the CLI generator): **jwks, oauthClient, oauthResource, oauthClientResource, oauthRefreshToken, oauthAccessToken, oauthConsent, oauthClientAssertion** (actual model list, matches plan). `oauthBetterAuthSchema` keyed by model name. NOT re-exported from identity index (adapters stay internal; createAuth lives in the same package).
- `packages/platform/src/mcp/schema.ts` — `mcpWriteLog`, `mcpImportPreviews` (USER-SCOPED), exported from platform index.
- `drizzle/0106_mcp.sql` + journal idx 106; post-migration grants/policies; USER-DATA-TABLES (5 USER-SCOPED, 5 EXCLUDED).

## Deviations

- **Ids are `text`, not `uuid`** (same as identity.sessions/accounts): `oauth_client_assertion.id` is the client JWT `jti` (`forceAllowId`), and session_id refs are text. user_id stays uuid.
- **worker_role gets NO grant on OAuth tables** (security review: no worker job needs tokens/keys) — post-migration REVOKEs. jwks private_key is encrypted by the jwt plugin by default.
- Arrays are native `text[]`, json is `jsonb` (drizzle adapter `supportsArrays/JSON` for pg).

## Verification (dev DB, as postgres)

- identity OAuth tables: `8`; shared_kernel MCP tables: `2`
- relforcerowsecurity: oauth_access_token/refresh_token/consent, mcp_write_log, mcp_import_previews all `t`
- `has_column_privilege(app_role, mcp_write_log.reverted_at, UPDATE)` = `t`; `.after_jsonb` UPDATE = `f`
- worker_role SELECT on jwks / oauth_access_token = `f`
- force-rls-on-all-tables 4/0; identity+tenancy 98/0 (+1 new schema test)
- Migrator image must be REBUILT for post-migration.sql edits (baked in).
