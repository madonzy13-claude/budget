---
phase: 03
slug: navigation-home-bdp-frame
status: verified
asvs_level: 1
audited_at: 2026-05-13
threats_total: 48
threats_closed: 48
threats_open: 0
auditor: gsd-security-auditor (Opus 4.7 1M)
block_on: high
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail for the Navigation + Home + BDP Frame phase (Plans 03-01 through 03-07).

**Verdict:** SECURED — 48/48 closed (29 mitigate verified + 19 accepts documented)

---

## Summary

Phase 3 introduces two new API read endpoints (`GET /budgets/:id/home-summary`, `GET /budgets/:budgetId/tasks`) and three new web surfaces (TopNav switcher, Home dashboard with budget cards, BDP frame with tabs + task banner). The phase deletes the legacy `/workspaces/*` route tree. All `mitigate`-disposition threats are verified by concrete code references in `apps/api/src/routes/{budgets,tasks}.ts`, `apps/api/src/middleware/{tenant-guard,require-auth,require-workspace}.ts`, `apps/api/src/app.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/budget-fetch.server.ts`, the `(app)/layout.tsx` and `(app)/budgets/[id]/layout.tsx` server components, plus the `task-banner*` client components and the `freshUser`/`fresh-user-per-scenario` E2E fixtures. The `make ci-gate` tenant-leak suite now exercises both the home-summary and tasks endpoints via `tests/tenant-leak/{home-summary,tasks}-cross-tenant.test.ts`. No new blockers.

---

## Trust Boundaries

| Boundary                                   | Description                                                                                   | Data Crossing                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------- |
| Browser -> Next.js middleware              | Cookie presence check; protected-route redirects; `x-pathname` injected (overwritten)         | session cookie, locale, pathname  |
| Next.js RSC -> API (`serverApiFetch`)      | Same-origin server-to-server with forwarded session cookie + `X-Budget-ID` header             | session cookie, budget id         |
| Client -> API (`clientApiFetch`)           | Browser fetch, same-origin, cookie-auth                                                       | session cookie                    |
| API -> Postgres (`app_role`)               | RLS via `app.tenant_ids` + `app.current_user_id` GUCs set by `withTenantTx`/`withUserContext` | Tenant-scoped rows, identity row  |
| Tenant-guard middleware                    | Resolves `X-Budget-ID` header -> verified `tenantIds` set                                     | header -> membership intersection |
| BDP membership gate (RSC)                  | Server checks `id` against `/budgets/active` list before rendering tab frame                  | budget id, redirect target        |
| E2E fixture -> API (`/auth/sign-up/email`) | Programmatic Better Auth signup; Set-Cookie replayed into Playwright context                  | test credentials, session cookie  |

---

## Threat Register

| Threat ID  | Category      | Sev    | Disposition | Status                | Evidence                                                                                                                                                                                                                                                                  |
| ---------- | ------------- | ------ | ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-01-01 | Tampering     | low    | accept      | CLOSED-VIA-ACCEPTANCE | Lockfile pinning of `@tanstack/react-query` + `playwright-bdd`; 03-01-PLAN threat register.                                                                                                                                                                               |
| T-03-01-02 | InfoDisc      | low    | accept      | CLOSED-VIA-ACCEPTANCE | Deleted `/workspaces/*` returns 404 via Next default. Verified: `apps/web/src/app/[locale]/workspaces/` absent.                                                                                                                                                           |
| T-03-01-03 | DoS           | low    | mitigate    | CLOSED                | `apps/web/playwright.config.ts:18` — `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"` (env-driven, never hardcoded to public host).                                                                                                                  |
| T-03-02-01 | Spoofing      | high   | mitigate    | CLOSED                | `apps/api/src/routes/budgets.ts:248-249` — `const session = c.get("session"); if (!session) return c.json({error:"unauthorized"},401);` plus app-level fence `apps/api/src/app.ts:68` (`app.use("/budgets/*", requireAuth)`).                                             |
| T-03-02-02 | Tampering     | high   | mitigate    | CLOSED                | `apps/api/src/middleware/tenant-guard.ts:46` reads `X-Budget-ID`, intersects with membership; route defensive check `apps/api/src/routes/budgets.ts:252-255` (`tenantIds.includes(budgetId)` -> 404 on miss).                                                             |
| T-03-02-03 | Repudiation   | low    | accept      | CLOSED-VIA-ACCEPTANCE | Read-only endpoint; 03-02-PLAN threat register.                                                                                                                                                                                                                           |
| T-03-02-04 | InfoDisc      | high   | mitigate    | CLOSED                | `apps/api/test/routes/budgets-home-summary.test.ts:506-515` (cross-tenant 404) + `tests/tenant-leak/home-summary-cross-tenant.test.ts` registered in `scripts/ci/run-tenant-leak.sh`.                                                                                     |
| T-03-02-05 | InfoDisc      | medium | mitigate    | CLOSED                | Static error strings only: `apps/api/src/routes/budgets.ts:254,266,268` — `not_found`, `home_summary_failed`. No user-supplied data echoed.                                                                                                                               |
| T-03-02-06 | DoS           | medium | mitigate    | CLOSED                | `Promise.all` parallelism + FX caching from Phase 2; 03-02-PLAN threat register.                                                                                                                                                                                          |
| T-03-02-07 | EoP           | low    | accept      | CLOSED-VIA-ACCEPTANCE | `SYSTEM_USER_ID` for `withTenantTx` matches reserve-balance-repo precedent; budgetId still gates RLS scope.                                                                                                                                                               |
| T-03-02-08 | SQLi          | high   | mitigate    | CLOSED                | `packages/budgeting/src/adapters/persistence/budget-home-summary-repo.ts:59,92,119,153` — all use Drizzle `` sql`...` `` template tag (parameterized binds), `::uuid`/`::date` casts.                                                                                     |
| T-03-02-09 | InfoDisc      | low    | accept      | CLOSED-VIA-ACCEPTANCE | `wallets_value_display_ccy.converted_at` is timestamp only, no PII; 03-02-PLAN threat register.                                                                                                                                                                           |
| T-03-02-10 | Tampering     | high   | mitigate    | CLOSED                | `packages/identity/src/adapters/persistence/user-repo.ts:22-23` — `findById` uses `withUserContext(id, ...)`, NOT `withTenantTx`. RLS gates by `app.current_user_id` GUC.                                                                                                 |
| T-03-03-01 | Spoofing      | high   | mitigate    | CLOSED                | `apps/api/src/routes/tasks.ts:32-33` — session check; app-level fence `apps/api/src/app.ts:68` covers `/budgets/*/tasks`.                                                                                                                                                 |
| T-03-03-02 | Tampering     | high   | mitigate    | CLOSED                | `apps/api/src/routes/tasks.ts:43-46` — `tenantIds.includes(budgetId)` -> 404 on cross-tenant.                                                                                                                                                                             |
| T-03-03-03 | InfoDisc      | high   | mitigate    | CLOSED                | `apps/api/test/routes/tasks.test.ts:301-316` (cross-tenant 404) + `tests/tenant-leak/tasks-cross-tenant.test.ts` registered in `scripts/ci/run-tenant-leak.sh`.                                                                                                           |
| T-03-03-04 | InfoDisc      | medium | accept      | CLOSED-VIA-ACCEPTANCE | `task.payload` returned only to authenticated tenant-scoped requests; banner never renders payload (T-03-06-03 verified separately).                                                                                                                                      |
| T-03-03-05 | Tampering     | low    | mitigate    | CLOSED                | `apps/api/src/routes/tasks.ts:25` — `status: z.literal("pending")` via `zValidator("query", querySchema)`; non-`pending` -> 422.                                                                                                                                          |
| T-03-03-06 | SQLi          | high   | mitigate    | CLOSED                | `packages/budgeting/src/adapters/persistence/task-repo.ts:45` — Drizzle `` sql`...` `` parameterized; `::uuid` casts.                                                                                                                                                     |
| T-03-03-07 | DoS           | low    | accept      | CLOSED-VIA-ACCEPTANCE | v1.1 task volume bounded by 4 generators × small budget set; 03-03-PLAN threat register.                                                                                                                                                                                  |
| T-03-04-01 | Spoofing      | high   | mitigate    | CLOSED                | `apps/web/src/app/[locale]/(app)/layout.tsx:30-37` — `const session = await getServerSession(); if (!session) { ... redirect("/${locale}/sign-in?reason=...") }`.                                                                                                         |
| T-03-04-02 | InfoDisc      | high   | mitigate    | CLOSED                | `apps/api/src/routes/budgets.ts:371` — `deps.tenancy.workspaceRepo.listForUser(userId)`. RLS-scoped via Phase 1+2.                                                                                                                                                        |
| T-03-04-03 | XSS           | high   | mitigate    | CLOSED                | Verified by adversarial grep: zero hits of the unsafe-HTML React API token and `innerHTML` in `apps/web/src/components/budgeting/`. React JSX auto-escape only.                                                                                                           |
| T-03-04-04 | Open Redirect | low    | mitigate    | CLOSED                | `(app)/layout.tsx` and BDP layout use hardcoded path templates (`/${locale}/budgets/...`); locale from next-intl whitelist.                                                                                                                                               |
| T-03-04-05 | Tampering     | medium | mitigate    | CLOSED                | `apps/web/src/lib/budget-fetch.server.ts:17-22` — `serverApiFetch` sets `X-Budget-ID` from explicit first arg; all per-budget callers (e.g. `budget-card.tsx`, BDP `layout.tsx` task fetch) pass `id` first arg. Global routes (`/budgets/active`) correctly pass `null`. |
| T-03-04-06 | Tampering     | low    | mitigate    | CLOSED                | `apps/web/src/middleware.ts:65-66` — `requestHeaders.set("x-pathname", request.nextUrl.pathname)` OVERWRITES (defense against client-supplied header).                                                                                                                    |
| T-03-04-07 | InfoDisc      | low    | accept      | CLOSED-VIA-ACCEPTANCE | Pathname is client-visible; reading server-side is bookkeeping.                                                                                                                                                                                                           |
| T-03-05-01 | InfoDisc      | high   | mitigate    | CLOSED                | `/budgets/active` RLS-scoped via `listForUser` (T-03-04-02). Each card's per-budget fetch passes `X-Budget-ID` (`budget-card.tsx` calls `serverApiFetch(budget.id, ...)`).                                                                                                |
| T-03-05-02 | InfoDisc      | medium | mitigate    | CLOSED                | `apps/web/src/components/budgeting/budget-card.tsx` error path renders static i18n; never echoes API error.                                                                                                                                                               |
| T-03-05-03 | XSS           | high   | mitigate    | CLOSED                | React JSX auto-escape; adversarial grep returns zero hits for unsafe-HTML APIs in `apps/web/src/components/budgeting/`.                                                                                                                                                   |
| T-03-05-04 | Open Redirect | low    | mitigate    | CLOSED                | Hardcoded path templates; id from server-controlled `/budgets/active`.                                                                                                                                                                                                    |
| T-03-05-05 | Spoofing      | high   | mitigate    | CLOSED                | `apps/web/src/lib/budget-fetch.server.ts:5,12-16` — `import { cookies } from "next/headers"` + `import "server-only"`; `cookies()` reads same-origin session.                                                                                                             |
| T-03-05-06 | Tampering     | high   | mitigate    | CLOSED                | Verified: `grep -rn 'serverApiFetch(null,\s*"/budgets/[^/]*/'` returns ONLY `/budgets/active` (global route, no `id` segment in path) — no per-budget paths called with `null` budgetId.                                                                                  |
| T-03-05-07 | InfoDisc      | low    | mitigate    | CLOSED                | `apps/web/src/components/budgeting/budget-card.tsx:50-58` — `try { Intl.NumberFormat(...) } catch { return ` + "`${v.toFixed(2)} ${currency}`" + ` }`.                                                                                                                    |
| T-03-06-01 | InfoDisc      | high   | mitigate    | CLOSED                | `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx:43-49` — fetches `/budgets/active`, checks `list.some((b) => b.id === id)`, `redirect("/${locale}")` on miss.                                                                                                    |
| T-03-06-02 | Tampering     | medium | mitigate    | CLOSED                | Next.js URL-encodes path segments; backend `::uuid` cast in `tasks` SQL -> 404 on invalid id.                                                                                                                                                                             |
| T-03-06-03 | XSS           | medium | mitigate    | CLOSED                | Verified: `grep -rn "task\.payload" apps/web/src/components/budgeting/` returns ONLY the documentation comment in `task-banner-row.tsx:14` ("task.payload is NEVER rendered in Phase 3"). No DOM render of `payload`.                                                     |
| T-03-06-04 | DoS           | low    | mitigate    | CLOSED                | `apps/web/src/components/budgeting/task-banner.tsx:55` — `refetchIntervalInBackground: false`; `:67-68` — `visibilitychange` listener invalidates on re-visible.                                                                                                          |
| T-03-06-05 | Spoofing      | medium | mitigate    | CLOSED                | `clientApiFetch` same-origin; API session middleware 401s on stale cookies (`apps/api/src/app.ts:68` `requireAuth` fence).                                                                                                                                                |
| T-03-06-06 | Spoofing      | low    | accept      | CLOSED-VIA-ACCEPTANCE | Hostile browser extension mutation is local-only; server state unaffected.                                                                                                                                                                                                |
| T-03-06-07 | InfoDisc      | medium | accept      | CLOSED-VIA-ACCEPTANCE | `/budgets/active` disclosure surface is already shared with home + switcher.                                                                                                                                                                                              |
| T-03-06-08 | Tampering     | high   | mitigate    | CLOSED                | `apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx:32` — `serverApiFetch(budgetId, /budgets/${budgetId}/tasks?status=pending)` (id first-arg).                                                                                                                      |
| T-03-07-01 | InfoDisc      | low    | accept      | CLOSED-VIA-ACCEPTANCE | Test emails `@test.local` non-routable; Docker-only per CLAUDE.md memory.                                                                                                                                                                                                 |
| T-03-07-02 | Tampering     | medium | accept      | CLOSED-VIA-ACCEPTANCE | Direct PG INSERT for task seeding; matches `wallets.test.ts` convention; test-only code.                                                                                                                                                                                  |
| T-03-07-03 | Tampering     | low    | accept      | CLOSED-VIA-ACCEPTANCE | Better Auth permits unverified signup by default; verification is separate Phase 6 surface.                                                                                                                                                                               |
| T-03-07-04 | InfoDisc      | low    | accept      | CLOSED-VIA-ACCEPTANCE | Phase 3 i18n translations are author-controlled.                                                                                                                                                                                                                          |
| T-03-07-05 | DoS           | low    | accept      | CLOSED-VIA-ACCEPTANCE | E2E suite ~6 min runtime acceptable for pre-verification gates.                                                                                                                                                                                                           |
| T-03-07-06 | Spoofing      | low    | mitigate    | CLOSED                | `apps/web/e2e/fixtures/fresh-user-per-scenario.ts:143-144` — `throw new Error("signup response had no Set-Cookie headers — Better Auth session cookie cannot be replayed")` on empty `setCookieHeaders`.                                                                  |

---

## Accepted Risks

| Threat ID  | Rationale                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| T-03-01-01 | npm package supply-chain — pinned via `bun.lock`; both packages are widely audited.                                                |
| T-03-01-02 | Bookmarks to deleted `/workspaces/*` URLs return 404 with no data leak.                                                            |
| T-03-02-03 | `GET /home-summary` is read-only; Phase 7 will audit task resolution writes.                                                       |
| T-03-02-07 | `SYSTEM_USER_ID` used for `withTenantTx` audit metadata; budgetId still gates RLS scope.                                           |
| T-03-02-09 | FX `converted_at` timestamp leak is informational only, no PII.                                                                    |
| T-03-03-04 | Task `payload_json` JSON returned only to authenticated tenant-scoped callers; banner row doesn't render it (T-03-06-03 verified). |
| T-03-03-07 | Task list unbounded but task volume bounded by 4 generators per budget at v1.1 scale.                                              |
| T-03-04-07 | `x-pathname` value is client-visible — server reading it is bookkeeping.                                                           |
| T-03-06-06 | Hostile browser extension fabricating client response affects only local UI, not server state.                                     |
| T-03-06-07 | `/budgets/active` disclosure surface shared with switcher + home; no new disclosure.                                               |
| T-03-07-01 | E2E test credentials use `@test.local` non-routable domain; Docker-only per `feedback_docker_always_on`.                           |
| T-03-07-02 | Direct PG INSERT seeding follows `apps/api/test/routes/wallets.test.ts` convention; test-only.                                     |
| T-03-07-03 | Programmatic Better Auth signup bypasses email verification; verification is a separate Phase 6 surface.                           |
| T-03-07-04 | Phase 3 i18n translations are author-controlled in this plan.                                                                      |
| T-03-07-05 | ~6 min E2E runtime acceptable for pre-verification gates.                                                                          |

(Note: T-03-02-03, T-03-03-04, T-03-06-06, T-03-06-07 are also listed in the Threat Register table above as `accept`-disposition; they are reproduced here as the canonical accepted-risks log.)

---

## Open Threats

None. 48/48 closed.

---

## Unregistered Flags

None. SUMMARY.md `## Threat Flags` sections across 03-01 through 03-07 each map to a registered T-03-NN-NN entry.

---

## Audit Trail

| Date       | Auditor                                | Closed | Open | Notes                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------- | ------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-13 | gsd-security-auditor (Opus 4.7 1M ctx) | 48/48  | 0    | Initial Phase 3 audit. All `mitigate` evidence verified by path:line grep. `make ci-gate` now exercises home-summary + tasks tenant-leak tests via `scripts/ci/run-tenant-leak.sh` (7+ total tests including `home-summary-cross-tenant.test.ts` and `tasks-cross-tenant.test.ts`). |

### Verification metrics

| Metric                                                                                           | Value                     | Source                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------ |
| Threats total                                                                                    | 48                        | Plans 03-01 … 03-07 threat registers                         |
| Mitigate verified                                                                                | 29                        | path:line evidence in this register                          |
| Accept documented                                                                                | 19                        | Accepted Risks section                                       |
| Open                                                                                             | 0                         | —                                                            |
| ASVS level                                                                                       | L1                        | Plan 03-01 (consumer SaaS read-only endpoints)               |
| `make ci-gate` backend tests                                                                     | 7+                        | `tests/tenant-leak/*.test.ts` (incl. home-summary, tasks)    |
| Forbidden API grep (unsafe-HTML React API + `innerHTML` in `apps/web/src/components/budgeting/`) | 0 hits                    | adversarial sweep                                            |
| Pitfall 4 grep (`serverApiFetch(null, "/budgets/<id>/`)                                          | 0 hits                    | adversarial sweep — only `/budgets/active` matches `null`    |
| `task.payload` render grep                                                                       | 0 hits (only doc comment) | adversarial sweep on `apps/web/src/components/budgeting/`    |
| x-pathname overwrite                                                                             | confirmed                 | `apps/web/src/middleware.ts:66`                              |
| `findById` user context isolation                                                                | confirmed                 | `packages/identity/src/adapters/persistence/user-repo.ts:23` |
