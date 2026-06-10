---
phase: 06-settings-onboarding-share-ui
slug: settings-onboarding-share-ui
status: verified
threats_total: 28
threats_closed: 28
threats_open: 0
audited_at: 2026-05-29
asvs_level: 2
block_on: high
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.

---

## Trust Boundaries

| Boundary                                     | Description                                                    | Data Crossing                                  |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| migrator role → Postgres                     | Migration declares RLS policies that gate app_role connections | DDL, policy bodies                             |
| app_role connection → onboarding_progress    | Per-user RLS predicate isolates by `app.current_user_id`       | Wizard step (1..5), completed_at               |
| client → PATCH /budgets/:id                  | Untrusted JSON, Zod-validated; tenant + owner-gated            | Identity / currency / cushion / reserves flags |
| client → revoke / archive / delete endpoints | Untrusted memberId/budgetId; owner-gated; typed-name confirm   | Membership removal, soft/hard delete           |
| client → /onboarding/progress                | Untrusted JSON; user_id sourced exclusively from session       | Wizard step pointer                            |
| public internet → /budgets/join/:token       | Unauthenticated; token IS the credential                       | Budget name only (no members/amounts)          |
| recipient → POST accept                      | Auth-gated mutation creates membership                         | userId from session                            |
| browser → API (settings UI)                  | All mutations cross to owner/tenant-gated endpoints            | Identity, members, share-link, danger-zone     |
| middleware → API                             | Layout guard reads onboarding_progress for session user        | onboarding_progress.completed_at               |
| Better Auth signup hook → DB                 | Post-create insert seeds onboarding_progress                   | userId, step=1                                 |
| i18n catalogs → rendered UI                  | en/pl/uk parity guards runtime rendering                       | Translation keys                               |

---

## Threat Register

| Threat ID  | Category               | Component                                                  | Disposition | Mitigation                                                                                                                                                                                                       | Status |
| ---------- | ---------------------- | ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-06-01-01 | Information Disclosure | `tenancy.onboarding_progress` cross-user read              | mitigate    | `pgPolicy("onboarding_progress_owner_only")` keyed on `app.current_user_id`; FORCE RLS at `apps/migrator/post-migration.sql:198`                                                                                 | closed |
| T-06-01-02 | Tampering              | New table escapes tenant-leak gate                         | mitigate    | `tests/tenant-leak/USER-DATA-TABLES.txt:40` lists `tenancy.onboarding_progress USER-SCOPED` — Test 4 fails closed if FORCE RLS missing                                                                           | closed |
| T-06-01-03 | Elevation of Privilege | `archived_at` column not covered by RLS                    | accept      | Existing `budgets_tenant_isolation` policy covers all columns of the row — see Accepted Risks Log #AR-06-01                                                                                                      | closed |
| T-06-02-01 | Tampering              | Currency change after first transaction                    | mitigate    | `apps/api/src/routes/budget-identity.ts:120-125` — server `hasTransactions` check returns 409 `currency_locked`                                                                                                  | closed |
| T-06-02-02 | Information Disclosure | Cross-tenant mutation via guessed `:id`                    | mitigate    | `apps/api/src/routes/budget-identity.ts:98-101` — `tenantIds.includes(budgetId)` → 404 (no existence leak)                                                                                                       | closed |
| T-06-02-03 | Tampering              | Cushion boolean / SCD-2 history diverge                    | mitigate    | `packages/budgeting/src/adapters/persistence/budget-mode-repo.ts:97-101` — single tx writes both `cushion_mode_enabled` and SCD-2 row                                                                            | closed |
| T-06-02-04 | Tampering              | SQL injection in identity UPDATE                           | mitigate    | All UPDATEs use Drizzle `sql` template tags with `${}` bind params (verified across workspace-repo.ts UPDATE paths)                                                                                              | closed |
| T-06-03-01 | Elevation of Privilege | Non-owner revokes another member                           | mitigate    | `apps/api/src/routes/budget-members.ts:64-70` — role lookup → 403 before `removeMember`                                                                                                                          | closed |
| T-06-03-02 | Denial of Service      | Last owner revoked, budget orphaned                        | mitigate    | `apps/api/src/routes/budget-members.ts:73-79` — last-owner guard → 409                                                                                                                                           | closed |
| T-06-03-03 | Information Disclosure | Member list of non-member budget leaked                    | mitigate    | `apps/api/src/routes/budget-members.ts:29-32` — `tenantIds.includes` → 404 before `listMembers`                                                                                                                  | closed |
| T-06-03-04 | Information Disclosure | Members listing exposes raw PII                            | accept      | listMembers returns only userId/role/displayName; emails already member-visible — see Accepted Risks #AR-06-02                                                                                                   | closed |
| T-06-04-01 | Elevation of Privilege | Non-owner archives or deletes shared budget                | mitigate    | `apps/api/src/routes/budget-archive.ts:59-61` (archive) and `:113-115` (delete) — owner-only gate → 403                                                                                                          | closed |
| T-06-04-02 | Tampering              | Typed-name confirm bypass via direct API call              | mitigate    | `apps/api/src/routes/budget-archive.ts:128-132` — server re-validates `confirmName === budget.name` → 422 `name_mismatch`                                                                                        | closed |
| T-06-04-03 | Information Disclosure | One user reads/writes another user's onboarding_progress   | mitigate    | `apps/api/src/routes/onboarding.ts:54-59` — `userId = session.user.id`; body schema has no user_id field                                                                                                         | closed |
| T-06-04-04 | Tampering              | SQL injection in archive/delete/onboarding queries         | mitigate    | All queries use Drizzle `sql` template tags with `${}` bind params (workspace-repo.ts hardDelete @ 416-427)                                                                                                      | closed |
| T-06-04-05 | Denial of Service      | Hard delete leaves orphaned child rows                     | mitigate    | `packages/tenancy/src/adapters/persistence/workspace-repo.ts:416-480` — `hardDelete` removes child rows (budget_members, shared_budget_member_shares) explicitly in same tx before deleting budgets row          | closed |
| T-06-05-01 | Elevation of Privilege | Non-owner sees Archive/Delete UI                           | mitigate    | `apps/web/src/components/settings/settings-accordion.tsx:40,120,126` + `danger-zone-section.tsx:107` — gated by `isOwner === true`; server gate (T-06-04-01) is real authority                                   | closed |
| T-06-05-02 | Tampering              | Typed-name UI disable bypass                               | accept      | UI disable is cosmetic; server re-validates (T-06-04-02) — see Accepted Risks #AR-06-03                                                                                                                          | closed |
| T-06-05-03 | Information Disclosure | Members section shown on PRIVATE budget                    | mitigate    | `apps/web/src/components/settings/settings-accordion.tsx:97` — `budget.kind === "SHARED"` conditional                                                                                                            | closed |
| T-06-05-04 | Information Disclosure | Share URL persists in DOM/history                          | mitigate    | `apps/web/src/components/settings/share-url-field.tsx:48` — `useState<string \| null>(null)` ephemeral, no link history list                                                                                     | closed |
| T-06-06-01 | Information Disclosure | Wizard reads/writes other user's onboarding_progress       | mitigate    | Onboarding endpoints (T-06-04-03) key on session; wizard sends no user_id                                                                                                                                        | closed |
| T-06-06-02 | Tampering              | `?step` query forged to skip required steps                | mitigate    | `apps/web/src/components/onboarding/wizard-page.tsx:85-94` — defer-create model; each step performs its own API write; step query only restores UI position                                                      | closed |
| T-06-06-03 | Denial of Service      | Force-redirect loop on `/budgets/new`                      | mitigate    | `apps/web/src/app/[locale]/(app)/layout.tsx:65` — skip when `pathname.includes("/budgets/new")`; `:102` — only redirect when `completedAt === null` AND row exists                                               | closed |
| T-06-06-04 | Elevation of Privilege | Budget created with forged kind/owner                      | mitigate    | `POST /budgets` derives owner from session (existing pattern); `kind` validated by createSchema enum (unchanged)                                                                                                 | closed |
| T-06-06-05 | Denial of Service      | Signup fails because onboarding_progress insert errors     | mitigate    | `packages/identity/src/adapters/persistence/better-auth.ts:161-164` uses `ON CONFLICT (user_id) DO NOTHING`; `:168-175` logs but does not throw on error                                                         | closed |
| T-06-07-01 | Spoofing               | Share-link token brute force                               | accept      | Tokens are unguessable random (Phase 2); 7-day TTL + single-use limit window — see Accepted Risks #AR-06-04                                                                                                      | closed |
| T-06-07-02 | Information Disclosure | Public join page leaks budget internals                    | mitigate    | `apps/api/src/routes/share-join.ts:51-56` — GET returns only `{budgetName, isExpired, isRevoked, isUsed}`                                                                                                        | closed |
| T-06-07-03 | Elevation of Privilege | Unauthenticated visitor joins without session              | mitigate    | `apps/api/src/routes/share-join.ts:71-74` — POST accept returns 401 `Unauthenticated` when no session                                                                                                            | closed |
| T-06-07-04 | Tampering              | Revoked/expired token still grants access                  | mitigate    | `apps/api/src/routes/share-join.ts:84-86` — 410 Revoked / 410 Expired / 409 AlreadyUsed; `apps/web/src/components/share/join-page-card.tsx:69-72` — client transitions to error state, never redirects to budget | closed |
| T-06-07-05 | Elevation of Privilege | Public join route inherits app auth chrome / stays bounced | mitigate    | Route at `apps/web/src/app/[locale]/budgets/join/[token]/page.tsx` (outside `(app)` group); `apps/web/src/middleware.ts:12,82` — `PUBLIC_BUDGET_PATHS = ["/budgets/join/"]` exempts from PROTECTED_ROUTES bounce | closed |
| T-06-08-01 | Tampering              | i18n key drift between en/pl/uk crashes runtime            | mitigate    | `apps/web/messages/{en,pl,uk}.json` — 8 `share`/`settings`/`onboarding` namespace occurrences match across all 3 locales (parity verified by Task 1 of 06-08)                                                    | closed |
| T-06-08-02 | Repudiation            | E2E gate skipped hides failures                            | mitigate    | Per project memory `feedback_e2e_must_block.md`; 06-08 Task 3 ran the full gate with no `continue-on-error` (37/37 ci-gate green, 27/27 Vitest green)                                                            | closed |
| T-06-08-03 | Information Disclosure | `onboarding_progress` regresses out of tenant-leak gate    | mitigate    | `tests/tenant-leak/USER-DATA-TABLES.txt:40` keeps the table INCLUDED USER-SCOPED — Test 4 fails closed if removed                                                                                                | closed |

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                                                                                  | Accepted By     | Date       |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- |
| AR-06-01 | T-06-01-03 | `tenancy.budgets.archived_at` is an additional column on an already-protected row; the existing `budgets_tenant_isolation` RLS policy covers all columns of every row — no separate column-level policy required.          | planner (06-01) | 2026-05-22 |
| AR-06-02 | T-06-03-04 | `listMembers` returns userId, role, and displayName only. Email addresses are already member-visible inside a shared budget (workspace identity sharing was approved in Phase 2). No new disclosure introduced by SETT-05. | planner (06-03) | 2026-05-22 |
| AR-06-03 | T-06-05-02 | The UI typed-name gate on Delete is cosmetic; the server re-validates `confirmName === budget.name` (mitigated under T-06-04-02). UI bypass yields no privilege escalation.                                                | planner (06-05) | 2026-05-22 |
| AR-06-04 | T-06-07-01 | Share-link tokens were generated by Phase 2's `createShareLink` using `crypto.randomBytes`-backed unguessable strings; 7-day TTL and single-use limit narrow the attack window. No Phase-6 change to token generation.     | planner (06-07) | 2026-05-22 |

---

## Unregistered Flags

None — only one summary (06-03) carried a `## Threat Flags` section, which stated "None — no new network endpoints or auth paths beyond those planned." Summaries 01, 02, 04, 05, 06, 07, 08 did not declare new attack surface; their threat models were complete at PLAN time and no new endpoints surfaced during implementation.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-05-29 | 28            | 28     | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-06-01..AR-06-04)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-29
