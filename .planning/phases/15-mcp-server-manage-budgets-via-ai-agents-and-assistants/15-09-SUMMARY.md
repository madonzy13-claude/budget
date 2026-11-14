---
phase: 15-mcp-server-manage-budgets-via-ai-agents-and-assistants
plan: 09
status: complete
---

# 15-09 Summary: sign-in return hop + consent screen

## Built

- `apps/web/src/lib/oauth-continue.ts` `oauthContinueUrl(search)` — when the sign-in page carries an authorize query (`client_id` + `response_type=code`), sign-in hard-navigates to **same-origin** `/auth/oauth2/authorize?<query minus sig/exp/ba_*>`; the server then picks the consent page or the client's registered redirect_uri. Crafted `next`/`redirect` params can't leave the origin. Wired in `sign-in-form.tsx`.
- `apps/web/src/app/[locale]/oauth/consent/page.tsx` (outside `(app)`) + `components/oauth/consent-form.tsx` — client name + "you go back to {host}" (from `GET /api/settings/connected-apps/client/:id`), all-budgets line, read/write lines by requested scope, revoke hint, Allow (primary yellow) / Deny (secondary). Both POST `/auth/oauth2/consent` `{ accept, scope: <requested scope as-is>, oauth_query: <signed page query> }` with fetch + `window.location.assign(url)` (no native form: CSP `form-action 'self'`). Unknown client → error, no Allow.
- `oauthConsent` namespace (12 keys) in en/pl/uk.

## Deviations

- Plugin mechanics (read from dist): the provider signs the authorize query (`sig`, `exp`, `ba_iat`) onto `/sign-in` and `/oauth/consent`; the consent POST takes that string as `oauth_query`. Rather than threading `oauth_query` through `signIn.email` (which would return the client's external redirect URL to follow), sign-in resumes via a same-origin authorize GET — simpler and never follows an off-site URL from the client.

## Verification

vitest: sign-in-form 9/9 (incl. 3 new), oauth-consent 6/6, middleware-mcp-paths green; web tsc + eslint clean. Live browser check deferred to 15-12/15-18 (needs web image rebuild).
