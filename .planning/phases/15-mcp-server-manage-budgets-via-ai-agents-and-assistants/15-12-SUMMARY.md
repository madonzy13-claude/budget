---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 12
status: complete
---

# 15-12 Summary: real-client spike (Claude.ai custom connector)

- Task 1: api/worker/web images rebuilt. On https://budget-dev.madonzy.com, protected-resource and AS metadata both return 200, and `POST /mcp` with no token returns 401 with `resource_metadata`. A Playwright run (390px) went through DCR → authorize → sign-in hop → consent → code → token, receiving a refresh token, `read write offline_access` and a 600s lifetime. `/mcp` then answered `list_budgets` with 200, and Connected apps listed the client.
- Task 2: the user connected Claude.ai, ran steps 1–6 and approved.
- Bug found at the checkpoint: Connected apps showed "last used" equal to "connected" even after the connector had been used. Last-used was the newest refresh-token issue, and JWT access tokens are not stored, so any call made inside the first 10-minute token never moved it. The fix:
  - Migration 0107 adds `identity.oauth_consent.last_used_at`.
  - `hasActiveConsent` became `touchConsent`, which runs `UPDATE … SET last_used_at = now() … RETURNING 1` in the same query as the consent check on every `/mcp` call.
  - `listConnections` reports `GREATEST(last_used_at, newest refresh issue)`.
  - Commits: RED test `connected-apps.test.ts` "last used moves on every MCP call", then GREEN. MCP + connected-apps tests 59/0, identity 56/0. Live re-run on the public host stamped `last_used_at`.

## Spike findings: A1, A2, A4

The real client row is `identity.oauth_client` created 2026-11-05 19:16:33 UTC. The other "Claude" rows are test-helper registrations that land in the dev DB.

- **Client registration (A1: DCR works, no CIMD needed) — TRUE.** The row has name `Claude`, `redirect_uris {https://claude.ai/api/mcp/auth_callback}`, `token_endpoint_auth_method none` (public client with PKCE), `application_type web`, `grant_types {authorization_code,refresh_token}` (`refresh_token` added by the ensureOfflineAccess register hook) and `scopes {read,offline_access,write}`. Claude.ai registered through plain DCR, and no CIMD was requested.
- **Consent scopes:** granted all-or-nothing on the consent page. The consent row itself was removed by Disconnect (step 5), as designed.
- **Refresh (A2: refresh token issued and used after 600s) — TRUE by user report.** Step 4 (more than 11 minutes later, no re-consent) passed. Disconnect deleted the client's refresh-token rows, so the rotation count could not be read back afterwards. The automated proof stays in `oauth-lifetime.test.ts` (rotation plus sliding expiry).
- **Audience:** `/mcp` accepts only JWTs whose `aud` is `https://budget-dev.madonzy.com/mcp`, via `verifyMcpAccessToken`. Steps 3–4 succeeded, so the issued tokens carried that audience: the client's `resource` matched, or `clientRegistrationDefaultResources` applied.
- **Disconnect (A4) — TRUE.** Step 6 failed after Disconnect: the consent row and tokens are gone, so `touchConsent` returns false and `/mcp` answers 401.

**Verdict: continue.**
