---
phase: 08-pwa-offline-push-i18n-e2e-hardening
slug: pwa-offline-push-i18n-e2e-hardening
status: verified
threats_total: 23
threats_closed: 23
threats_open: 0
audited_at: 2026-06-28
asvs_level: 2
block_on: high
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.
> Retroactive audit — phase predates the secure-phase gate.

---

## Trust Boundaries

| Boundary                              | Description                                                                  | Data Crossing                        |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| browser → /push/subscribe             | Untrusted subscription endpoint + key material crosses into server storage   | endpoint URL, p256dh, auth, budgetId |
| tenant A ↔ tenant B (push tables)     | Two tenants share push_subscriptions / notification_prefs; RLS must isolate  | subscription rows, pref toggles      |
| env → server (VAPID private key)      | VAPID private key must never reach the client bundle                         | VAPID_PRIVATE_KEY                    |
| IndexedDB ↔ origin                    | Per-origin readable RQ cache — must hold no secrets, no other tenant's data  | budget domain data                   |
| offline write → API                   | Replayed/retried write must not double-commit                                | Idempotency-Key, request body        |
| client → middleware (Accept-Language) | Untrusted header drives first-visit locale only                              | locale tag                           |
| auth check ↔ unreachable server       | Failure path must not loop-redirect to /login                                | session cookie presence              |
| push payload → lock screen            | Notification body visible without auth — must carry no financials            | title/body strings                   |
| notification url → app navigation     | Deep-link target must be a validated same-origin `/budgets/<id>/<tab>` shape | locale, budgetId, tab, taskId        |
| ?task= param → banner expansion       | Untrusted query param drives only client-side row expansion                  | taskId                               |
| recipient → shared budget (join)      | Join must grant access only via a valid token                                | share token                          |
| CI gate ↔ shippable artifact          | A red gate (i18n, tenant-leak, E2E) must block the artifact                  | build pass/fail                      |

---

## Threat Register

| Threat ID  | Category                  | Component                               | Disposition | Mitigation (with file:line)                                                                                                                                                                                                                                                                   | Status |
| ---------- | ------------------------- | --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-08-01-01 | Information Disclosure    | push_subscriptions / notification_prefs | mitigate    | FORCE RLS + `*_tenant_isolation` PERMISSIVE policies keyed on `app.tenant_ids` `apps/migrator/post-migration.sql:760-773`; both tables `TENANT-SCOPED` `tests/tenant-leak/USER-DATA-TABLES.txt:42-43` (Test-4 fails closed if FORCE RLS dropped)                                              | closed |
| T-08-01-02 | Information Disclosure    | VAPID private key                       | mitigate    | `VAPID_PRIVATE_KEY` read only from `process.env` `packages/platform/src/push/vapid.ts:20`; sole repo refs in that server file; `apps/web` uses only `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `apps/web/src/lib/push-subscribe.ts:50`                                                                    | closed |
| T-08-01-03 | Tampering                 | migration journal                       | accept      | AR-08-01 — hand-authored migration + manual journal                                                                                                                                                                                                                                           | closed |
| T-08-02-01 | Spoofing                  | /push/\* handlers                       | mitigate    | Session guard on every state-changing handler `apps/api/src/routes/push.ts:51-52` (POST), `:74-75` (DELETE), `:135` (PATCH); userId from `session.user.id` (`:63,:84,:143`), never body; membership `tenantIds.includes(budgetId)`→403 (`:58-59,:79-80,:102-103`)                             | closed |
| T-08-02-02 | Information Disclosure    | getSubscriptionsForBudget               | mitigate    | Runs inside `withTenantTxRead` so `app.tenant_ids`/`app.current_user_id` GUC set before DML — `packages/platform/src/push/push-repo.ts:163-169`; RLS from 08-01 confines rows                                                                                                                 | closed |
| T-08-02-03 | Input Validation          | subscribe/prefs payloads                | mitigate    | `zValidator("json", …)` on POST/PATCH (`push.ts:50,:73,:133`); `endpoint: z.string().url()` (`:21`); `notificationType: z.enum([...])` (`:36-40`); budgetId `z.string().uuid()`                                                                                                               | closed |
| T-08-02-04 | Tampering                 | outbox emission                         | mitigate    | `writeOutbox(tx, …)` in the same task-insert tx, gated on a genuine insert (`row.inserted === true`) — `packages/budgeting/src/adapters/persistence/task-repo.ts:101-117`; ON CONFLICT no-ops → no emit                                                                                       | closed |
| T-08-03-01 | Information Disclosure    | offline cache (IndexedDB RQ cache)      | mitigate    | Cache holds only RQ domain data; wiped on logout via `clearQueryCache()`+`dropLegacyBudgetCache()` (`apps/web/src/lib/query-persist.ts:208,:108`) called at `components/auth/profile-menu.tsx:219` and `sign-out-button.tsx:31`. Naming drift — see Unregistered Flags                        | closed |
| T-08-03-02 | Tampering                 | replay double-write                     | mitigate    | Server idempotency middleware computes `scope_hash`+`body_hash`, `SELECT FOR UPDATE` returns cached 2xx — `packages/platform/src/idempotency/middleware.ts:36-40,:95,:124`; client replay queue removed (`apps/web/src/lib/offline-write.ts:6`), same-key dedup backstop intact               | closed |
| T-08-03-03 | DoS                       | unbounded queue growth                  | accept      | AR-08-02 — D-06: no hard cap in v1.1                                                                                                                                                                                                                                                          | closed |
| T-08-04-01 | Tampering                 | Accept-Language header                  | mitigate    | Validated against fixed allowlist `["en","pl","uk"]` (`apps/web/i18n.config.ts:4`) in `negotiateLocale`→`"en"` fallback (`src/lib/negotiate-locale.ts:14,:41,:48`); only for unauthenticated no-prefix path (`middleware.ts:86-101`); authenticated session locale authoritative (`:107-118`) | closed |
| T-08-04-02 | DoS / availability        | auth-failed redirect loop               | mitigate    | `ServerDownSignedOut` has only a manual Reload button, no /login link, no auto-redirect — `apps/web/src/components/common/server-down-card.tsx:151-191`; retry probes /api/health with `safeNextTarget` open-redirect guard (`:52-58`)                                                        | closed |
| T-08-04-03 | Information Disclosure    | offline fallback copy                   | accept      | AR-08-03 — static `apps/web/public/offline-shell.html` generic copy only                                                                                                                                                                                                                      | closed |
| T-08-05-01 | Information Disclosure    | push payload                            | mitigate    | `BODIES`/`TITLES` generic strings ("Go to Reserves/Spendings/Wallets tab"), no amounts/categories — `apps/worker/src/handlers/push-notification-handler.ts:44-77`                                                                                                                             | closed |
| T-08-05-02 | Tampering / open-redirect | notificationclick url                   | mitigate    | url built server-side from fixed template `/${locale}/budgets/${budgetId}/${notifType.tab}?task=${taskId}` with `tab` from registry — `push-notification-handler.ts:155`; SW opens relative same-origin url via `clients.openWindow` — `apps/web/sw.ts:318-356`                               | closed |
| T-08-05-03 | DoS                       | stale subscription                      | mitigate    | 410/404 from push endpoint deletes the subscription row — `push-notification-handler.ts:166-174`                                                                                                                                                                                              | closed |
| T-08-05-04 | Spoofing                  | permission/subscribe                    | accept      | AR-08-04 — `Notification.requestPermission` user-gesture-gated browser API                                                                                                                                                                                                                    | closed |
| T-08-05-05 | Tampering                 | ?task= deep-link param                  | mitigate    | Param only expands a task already in the loaded pending list; unknown/foreign id stays collapsed, no fetch — `apps/web/src/components/budgeting/tasks/pill-task-slider.tsx:83-87`; passed only on initial tab (`budget-detail.tsx:212`)                                                       | closed |
| T-08-06-01 | Elevation of Privilege    | share-link join                         | mitigate    | Revoked/expired link asserts error state + return-home link, never lands on budget — `tests/e2e/features/share/join.feature` (Scenario 3). Naming drift — see Unregistered Flags                                                                                                              | closed |
| T-08-06-02 | n/a (test layer)          | E2E suite                               | accept      | AR-08-05 — test-only plan, no new runtime surface                                                                                                                                                                                                                                             | closed |
| T-08-07-01 | Repudiation / quality     | i18n completeness                       | mitigate    | `check:i18n` exits 1 on any missing/stale EN/PL/UK key — `scripts/check-i18n-completeness.ts:69-71`; blocking CI step `.github/workflows/ci.yml:76`                                                                                                                                           | closed |
| T-08-07-02 | Information Disclosure    | real push delivery (UAT)                | mitigate    | Human UAT Test 8 device-confirmed generic push (no amounts) — `.planning/phases/08-.../08-UAT.md:82,:84`; code control is T-08-05-01                                                                                                                                                          | closed |
| T-08-07-03 | n/a                       | gate sweep                              | accept      | AR-08-06 — verification-only plan                                                                                                                                                                                                                                                             | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                                                         | Accepted By     | Date       |
| -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- |
| AR-08-01 | T-08-01-03 | Hand-authored migration + manual journal entry per established Phase 1/5/6 precedent; reviewed before `make migrate`. Tables created in migration 0032; FORCE RLS + grants in post-migration.sql. | planner (08-01) | 2026-06-28 |
| AR-08-02 | T-08-03-03 | No hard cap on offline write retries in v1.1 (D-06); drains on reconnect. Client replay queue largely removed in SPA/SWR refactor, narrowing the surface further.                                 | planner (08-03) | 2026-06-28 |
| AR-08-03 | T-08-04-03 | `offline-shell.html` is static generic copy with no financial data.                                                                                                                               | planner (08-04) | 2026-06-28 |
| AR-08-04 | T-08-05-04 | `beforeinstallprompt` + `Notification.requestPermission` are user-gesture-gated browser APIs; no new server auth surface.                                                                         | planner (08-05) | 2026-06-28 |
| AR-08-05 | T-08-06-02 | Test-only plan; exercises existing mitigations end-to-end, no new runtime surface.                                                                                                                | planner (08-06) | 2026-06-28 |
| AR-08-06 | T-08-07-03 | Verification-only gate sweep; relies on prior plans' mitigations being green together.                                                                                                            | planner (08-07) | 2026-06-28 |

---

## Unregistered Flags

No new attack surface. The following are LOW-severity plan-vs-code divergences — controls verified present, only names/locations drifted; none open a threat:

- **[LOW] T-08-03-01 test/file naming drift.** Plan cites `cross-tenant-cache.spec.ts` and `apps/web/src/lib/offline-cache.ts`; neither exists. Actual wipe control lives in `query-persist.ts` (`clearQueryCache`/`dropLegacyBudgetCache`, called from both auth sign-out paths). Control present; **recommend adding a regression spec** so the cache wipe can't silently regress.
- **[LOW] T-08-03-02 architecture pivot.** Plan describes a client replay queue reusing the Idempotency-Key; the offline queue/replay was removed (`offline-write.ts:6`) yet UAT Test 12 (`08-UAT.md:48`) still references a per-transaction offline enqueue. The double-write backstop (server idempotency middleware, scope_hash+body_hash+SELECT FOR UPDATE) is intact regardless; the plan text is stale, not the control.
- **[LOW] T-08-06-01 feature file naming.** Plan cites `share-link.feature` (@phase8); actual coverage is `tests/e2e/features/share/join.feature` tagged `@phase6`. Revoked/expired scenario present, asserts no membership grant.
- **[INFO] i18n namespace split.** `ServerDownCard` reads namespace `server_down` (`:61`) while `ServerDownSignedOut` reads `serverDown` (`:157`). Both must exist in all three locales or `check:i18n` fails — confusing, not a security issue.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-06-28 | 23            | 23     | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-08-01..AR-08-06)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
