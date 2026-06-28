---
phase: 10-user-settings-redesign
slug: user-settings-redesign
status: verified
threats_total: 11
threats_closed: 11
threats_open: 0
audited_at: 2026-06-28
asvs_level: 2
block_on: high
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against implementation files; each mitigation traced to file:line evidence.
> Retroactive audit — phase predates the secure-phase gate. Auth-sensitive phase
> (password change, session revoke, email change, forgot/reset, GDPR delete) — audited
> with extra rigor.

---

## Trust Boundaries

| Boundary                                                   | Description                                                                               | Data Crossing                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| browser → `/auth/change-email` (Better Auth)               | Authenticated session required; confirm link to OLD address, re-verify NEW                | newEmail, confirm/verify tokens           |
| create/update `databaseHooks` → `identity.users`           | Server recomputes `email_hash` via `withUserContext` (RLS self-row); never client-trusted | BLAKE2b(email) bytea                      |
| browser → `/auth/request-password-reset`                   | Forgot (unauth) + in-app (auth); secret only ever leaves via email                        | email → reset token (out-of-band)         |
| browser → `/auth/reset-password`                           | Token IS the credential; single-use, 1800s TTL, server-revalidated                        | reset token, newPassword (≥10)            |
| browser → `authClient.revokeSession / revokeOtherSessions` | Better Auth scopes to caller's own sessions only; current preserved                       | session token                             |
| browser → `/auth/delete-user`                              | Authenticated session + emailed confirmation link; typed-DELETE UI gate                   | callbackURL → delete token (out-of-band)  |
| `beforeDelete` hook → Postgres (`app_role`, no BYPASSRLS)  | Whole GDPR cascade in ONE `withUserContext` tx; sole-owner-of-SHARED blocked              | tenant-table DELETEs, DEK crypto-shred    |
| middleware + `(app)` layout → `/settings`                  | `PROTECTED_ROUTES` cookie bounce + `getServerSession` redirect                            | session cookie; user locale/currency only |
| migrator → `identity.users`                                | Irreversible `DROP COLUMN` DDL, last step, idempotent                                     | provider-pref enum columns                |

---

## Threat Register

| Threat ID | Category                                             | Component                                      | Disposition | Mitigation (with file:line)                                                                                                                                                                                                                                                                                                                               | Status |
| --------- | ---------------------------------------------------- | ---------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-10-01   | Tampering (destructive migration)                    | `drizzle/0045` DROP COLUMN on `identity.users` | mitigate    | `drizzle/0045_phase10_drop_provider_prefs.sql:8-10` — `DROP COLUMN IF EXISTS` on two nullable text pref columns, idempotent; header comment "Run LAST"; no FK/index dependents                                                                                                                                                                            | closed |
| T-10-02   | Spoofing / auth boundary                             | `(app)/settings` route                         | mitigate    | `apps/web/src/middleware.ts:10` `PROTECTED_ROUTES` incl `/settings`, `:131-137` unauth → `/sign-in`; `(app)/layout.tsx:75,119` `getServerSession()` → `redirect(.../sign-in)`; page under `(app)` at `settings/[[...tab]]/page.tsx`                                                                                                                       | closed |
| T-10-03   | Spoofing (account takeover via email change)         | `authClient.changeEmail`                       | mitigate    | `packages/identity/src/adapters/persistence/better-auth.ts:338-357` — `changeEmail.enabled`, `sendChangeEmailConfirmation` to `user.email` (OLD addr, `:350`), `updateEmailWithoutVerification:false` (`:356`); requires session; NEW re-verified via `emailVerification` (`:249-261`); UI `profile-section.tsx:72`                                       | closed |
| T-10-04   | Tampering (PII-lookup integrity / email_hash)        | encrypted email cols vs plain-email write      | mitigate    | `better-auth.ts:52-64` `recomputeEmailHash` (server-side, `withUserContext`), called in `update.after` (`:456-468`) and `create.after` (`:405-415`); guard test `packages/identity/test/email-change-hash.test.ts`                                                                                                                                        | closed |
| T-10-05   | Spoofing / privilege (password change)               | in-app password change                         | mitigate    | `apps/web/src/components/settings/security-section.tsx:119-122` triggers `requestPasswordReset` to own email (NOT direct set); `better-auth.ts:239-247` `sendResetPassword` + `resetPasswordTokenExpiresIn:1800`; global rate limit `:473-496`                                                                                                            | closed |
| T-10-06   | Session management                                   | `revokeOtherSessions`                          | mitigate    | `apps/web/src/components/settings/sessions-list.tsx:97` `authClient.revokeOtherSessions()` (Better Auth scopes to own user server-side); current session preserved — `:100` skips `s.isCurrent`; single-revoke `:92`                                                                                                                                      | closed |
| T-10-07   | Information Disclosure (account enumeration)         | forgot-password request form                   | mitigate    | `apps/web/src/app/[locale]/forgot-password/page.tsx:33-48` — `setSent(true)` in `finally` regardless of success/throw → identical neutral message `:60-66`; rate limit unchanged (`better-auth.ts:482`)                                                                                                                                                   | closed |
| T-10-08   | Tampering (token replay / weak password)             | reset-password consume page                    | mitigate    | `better-auth.ts:247` `resetPasswordTokenExpiresIn:1800` (single-use, server-validated) + `:237` `minPasswordLength:10`; `reset-password/page.tsx:24,68` `MIN_PASSWORD=10` client gate; expired/missing token → error + request-new link (`:37-64`, `:142-149`)                                                                                            | closed |
| T-10-09   | Repudiation / Info Disclosure (GDPR right-to-delete) | account deletion cascade completeness          | mitigate    | `better-auth.ts:114-196` `purgeUserData` run from `beforeDelete` (`:379-381`); 14-table `TENANT_TABLES` purge `:157-161`, reserve-adjustments-first `:154-155`, DEK crypto-shred `:189-193`; one `withUserContext` tx (no orphan partial); guard test `packages/identity/test/account-deletion-cascade.test.ts`                                           | closed |
| T-10-10   | Tampering / Denial (destroying other members' data)  | deleting a SHARED budget the user owns         | mitigate    | `better-auth.ts:141-149` — `find(kind==="SHARED" && member_count>1)` → `throw APIError("BAD_REQUEST")` aborts whole deletion; only solely-owned budgets cascaded (`:151-175`)                                                                                                                                                                             | closed |
| T-10-11   | Elevation / Spoofing (unauthorized deletion)         | `deleteUser` trigger                           | mitigate    | Implemented as EMAIL-gate (substituted vs plan's "password re-entry"): `better-auth.ts:363-378` `sendDeleteAccountVerification` (delete fires only when emailed link consumed) + typed-DELETE UI gate `account-danger-zone.tsx:31,40,48`; `:51` `deleteUser({callbackURL})`. Hijacked cookie alone cannot delete (requires verified-inbox second factor). | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Accepted Risks Log

No accepted risks declared for Phase 10. (Out-of-phase, pre-existing: `better-auth.ts:288-292` documents a 365-day session lifetime, bounded by 60s `cookieCache` + revoke-on-logout — not a Phase-10 register entry.)

---

## Unregistered Flags

- **[INFO] T-10-11 register text divergence.** The PLAN.md mitigation text asserts `deleteUser` "requires the authenticated session AND a password re-entry." The implemented control is an **emailed confirmation link** (`sendDeleteAccountVerification`), NOT a password re-entry — `account-danger-zone.tsx:51` calls `deleteUser({ callbackURL })` with no password field; `better-auth.ts:363-378` wires no password requirement. The substitution is a documented checkpoint decision (`account-danger-zone.tsx:4-12`; `better-auth.ts:358-362`) and is functionally equal-or-stronger for the stated threat (requires control of the verified inbox — the account-recovery factor). Threat objective met → CLOSED. Register text corrected here to "email confirmation link". Not a blocker.
- No new unmapped attack surface in the auth files. Email-change, password-reset, session-revoke, and account-delete all route through Better Auth endpoints under the global rate limiter and existing RLS/`withUserContext` boundary; no bespoke unauthenticated route introduced.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-06-28 | 11            | 11     | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (none)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
