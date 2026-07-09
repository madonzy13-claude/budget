# Phase 10 — User Settings Redesign · RESEARCH

**Researched:** 2026-06-26 (inline, Opus). Source: Better Auth docs (context7 `/better-auth/better-auth`) + live codebase.
**Purpose:** Resolve the open questions CONTEXT.md flagged ("confirm in research") so planning doesn't re-derive
the Better Auth wiring or the GDPR deletion cascade. Everything CONTEXT already locked is NOT repeated here.

> Read CONTEXT.md first — this file only fills its gaps: **changeEmail wiring, account-deletion cascade,
> revokeOtherSessions, the reset-password client flow, and the new email template.**

---

## 1. Email change (`changeEmail`) — exact wiring

Better Auth `user.changeEmail` config (verified, `users-accounts.mdx` + `reference/options.mdx`):

```ts
user: {
  changeEmail: {
    enabled: true,
    // Sent to the CURRENT (old) email when the user IS verified — a confirm link.
    sendChangeEmailConfirmation: async ({ user, newEmail, url, token }) => {
      await opts.emailSender.send({
        to: user.email,                 // OLD address
        template: "change-email",       // NEW template (see §5)
        vars: { url, newEmail },
        locale: pickLocale((user as { locale?: string }).locale),
      });
    },
    updateEmailWithoutVerification: false,
  },
},
```

**Flow when the current email is verified (our case — `requireEmailVerification: true`):**

1. `authClient.changeEmail({ newEmail, callbackURL })` →
2. Better Auth sends a **confirmation link to the OLD email** via `sendChangeEmailConfirmation`.
3. User clicks → email column is updated to `newEmail`, `email_verified` flips to **false**, and Better Auth
   sends a verification to the **NEW** address through the existing `emailVerification.sendVerificationEmail`
   (already wired to the `verify-email` template).
4. User clicks the NEW-address link → `email_verified` true again.

> **Nuance to verify in an integration test (TDD):** the docs describe the confirm-to-old-then-verify-new
> two-hop. CONTEXT decision 4 says "re-verification link to the NEW address; stays pending until clicked" —
> that matches step 3-4. The executor's integration test MUST assert WHICH address receives WHICH template
> (old→`change-email`, new→`verify-email`) rather than assuming. If Better Auth's installed version only sends
> to the new address (single-hop), drop `sendChangeEmailConfirmation` and rely on `sendVerificationEmail` alone.
> Pin behaviour with the test, not the docs.

### 1a. **CRITICAL — `email_hash` recompute (CONTEXT gotcha, now concrete)**

`email`/`email_encrypted`/`email_nonce`/`email_hash` are the encrypted-PII columns. Better Auth `changeEmail`
touches **only the plain `email` column**. The `users_email_hash_uq` UNIQUE index + `findByEmail` lookups read
`email_hash`. So an email change MUST recompute `email_hash` (+ `email_encrypted`/`email_nonce`).

Mirror the **existing create-after hook** (`better-auth.ts` `databaseHooks.user.create.after`, lines ~180-205):
it already does `keyStore.emailHash(user.email)` → `withUserContext(UserId, tx => tx.execute(UPDATE identity.users
SET email_hash = ... WHERE id = ...))`. Add the symmetric **`databaseHooks.user.update.after`** that, when the
`email` field changed, recomputes `email_hash` the same way:

```ts
databaseHooks: {
  user: {
    create: { after: async (user) => { /* existing */ } },
    update: {
      after: async (user) => {
        // Only when email actually changed — Better Auth fires update.after for any field.
        const hash = await opts.keyStore.emailHash(user.email as string);
        await withUserContext(UserId(user.id as string), async (tx) => {
          await tx.execute(sql`
            UPDATE identity.users SET email_hash = ${Buffer.from(hash)} WHERE id = ${user.id}::uuid
          `);
        });
      },
    },
  },
},
```

> Name re-encryption (`name_encrypted`) is a Phase-6 concern — plain `name` is what's read today, so a name
> change needs no hook. Note it; don't block. `email_encrypted`/`email_nonce` are written by the same DEK path
> as create — reuse whatever the create-after hook does for the encrypted blob (if it only writes `email_hash`
> today, match that; the hash is what the UNIQUE lookup needs).

---

## 2. Account deletion (`deleteUser`) — the cascade is APPLICATION-LEVEL

**Key finding:** tenancy `budgets.owner_user_id` and `budget_members.user_id` are **bare `uuid` columns with NO
`references()` / NO `ON DELETE` clause** (bounded-context separation — tenancy never FK-references identity).
Therefore **Postgres will NOT cascade** anything when the user row is deleted. Better Auth `deleteUser` removes
only `identity.users` + `sessions` + `accounts`. Everything else must be purged by us.

### Better Auth config

```ts
user: {
  deleteUser: {
    enabled: true,
    beforeDelete: async (user) => { /* APP CASCADE — see below */ },
    // afterDelete: optional post-cleanup
  },
},
```

Client (CONTEXT decision 6 — typed confirmation + sign-out):
`await authClient.deleteUser({ password })` → Better Auth re-auths with the password, runs `beforeDelete`,
deletes the user, revokes sessions (signs out). **Password-gated immediate delete** (no email round-trip) is the
recommended path — it satisfies "explicit confirmation" with a typed `DELETE` confirmation + password re-entry,
and avoids building a delete-account email template. Skip `sendDeleteAccountVerification`.

### Cascade contents (run in `beforeDelete`, raw SQL via `withUserContext` — mirror create-after hook)

Personal rows keyed by the user (delete all):

- `shared_kernel.user_keys` WHERE user_id = X — **the user's DEK; MUST delete** (their encryption key).
- `tenancy.budget_members` WHERE user_id = X — their memberships.
- `tenancy.budget_invitations` WHERE inviter_id = X — invites they sent.
- `identity.verifications` for the user (token rows; harmless but tidy).
- (`identity.sessions` / `accounts` — Better Auth deletes these itself.)

Owned budgets (`budgets.owner_user_id = X`) — **the decision point:**

| Budget kind / state                                  | Recommended action                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRIVATE` (single-user)                              | **Full delete** — budget row + ALL tenant data (tenant_id = budget.id) across budgeting / reserves / cushion / investments / shares schemas.                                    |
| `SHARED` with **no other members** (memberCount ≤ 1) | Full delete (same as private).                                                                                                                                                  |
| `SHARED` with **other members**                      | **BLOCK deletion.** Return a clear error: "Transfer ownership or remove other members before deleting your account." Do NOT unilaterally destroy other members' household data. |

> **Recommended locked decision (give the planner this):** v1.2 deletion purges the user's identity, keys,
> memberships, invitations, and any budget they **solely** own (PRIVATE or member-less SHARED) with all its
> tenant data. If the user is the **sole owner of a SHARED budget that still has other members**, block the
> delete with a remediation message. This is the GDPR-defensible minimum (the user's own personal data is
> erased) without cross-member data loss, and it bounds the cascade. The "transfer ownership" path is a v1.3
> follow-up — out of scope here.

> **Org-plugin caveat to verify:** budgets are Better Auth **organization-plugin** orgs. Deleting a user who
> owns orgs may trip org-plugin invariants. The `beforeDelete` hook must purge `budget_members` + owned-budget
> rows FIRST so the user owns/belongs-to nothing by the time Better Auth deletes the user row. Cover with an
> integration test: create user → owned PRIVATE budget with data → `deleteUser` → assert budget + all tenant
> rows + user_keys + memberships gone, and a SHARED-with-members budget blocks.

### Cascade location (hexagonal)

The cascade touches multiple bounded contexts (tenancy + shared_kernel). Cleanest seam: a single
`beforeDelete` in `better-auth.ts` that runs the purge as raw SQL inside `withUserContext` (same adapter-level
DB-access pattern the create-after hook already uses). Avoid a new cross-context application service for v1.2 —
the raw-SQL purge in the adapter is the lazy, contained option and keeps Drizzle out of the domain. A
`deleteAccount` application port can be extracted later if reused.

---

## 3. Sessions — sign-out-others

`authClient.revokeOtherSessions()` revokes every session except the current one. Add to `sessions-list.tsx`
(existing component already uses `authClient.revokeSession({ token })` + AlertDialog confirm). A new
"Sign out all other devices" button → confirm dialog → `revokeOtherSessions()` → toast + refetch list.
No new API route needed (Better Auth client method hits `/auth/*` directly, like `revokeSession` does today —
note the existing `/settings/sessions` API route proxies `auth.api.listSessions`/`revokeSession`; the client
method is simpler and is what the component already uses).

---

## 4. Forgot / reset-password client flow (logged-out pages)

Two missing pages. Better Auth client methods:

- `authClient.requestPasswordReset({ email, redirectTo: "/<locale>/reset-password" })` (alias:
  `forgetPassword`). Fires the existing `sendResetPassword` → `reset-password` email template (already wired,
  `resetPasswordTokenExpiresIn: 1800`). The emailed link lands on `redirectTo?token=...`.
- `authClient.resetPassword({ newPassword, token })` — `token` read from the URL query on the reset page.

Pages to build (mirror `sign-in/page.tsx` structure + design tokens):

- `apps/web/src/app/[locale]/forgot-password/page.tsx` — email input → `requestPasswordReset`. Always show
  a neutral "if an account exists, we sent a link" success (no account enumeration).
- `apps/web/src/app/[locale]/reset-password/page.tsx` — reads `?token=`, new-password form (min length **10**,
  mirror `minPasswordLength`) → `resetPassword` → redirect to sign-in. Handle missing/expired token
  (Better Auth returns an error → show "link expired, request a new one" linking back to forgot-password).
- **Fix the dead link:** `sign-in/page.tsx:110` already points at `/${locale}/reset-password` but no page exists.
  The "Forgot your password?" link should point at **`/${locale}/forgot-password`** (the request page), not the
  consume page. Repoint it.

The **email-gated password change for logged-IN users** (Security section) reuses the SAME flow: a button calls
`requestPasswordReset({ email: session.user.email, redirectTo: "/<locale>/reset-password" })` → user gets the
same email → same `/reset-password` consume page. No new-password entry in settings, no custom pending table
(CONTEXT decision 5).

---

## 5. New `change-email` email template

`packages/platform/src/email/templates.ts` is a closed enum + renderer map:

- `TemplateName` union (`"verify-email" | "reset-password" | ...`) — add `"change-email"`.
- `STRINGS[locale]` has per-locale blocks (`verify`, `reset`, ...) — add a `changeEmail` block for **en/pl/uk**.
- `RENDERERS` map (`TemplateName → renderer fn`) — add `"change-email": renderChangeEmail` (clone
  `renderResetPassword`/`renderVerifyEmail`; CTA button → `vars.url`, body references `vars.newEmail`).
- `TemplateVars` — ensure `newEmail` is an allowed var.

> Email-template edits require rebuilding **api + worker** (per CLAUDE.md), not just web.

---

## 6. Provider-feature removal — order of operations (avoid a broken build)

CONTEXT has the full surface table. Sequence so nothing references a dropped symbol mid-step:

1. **FE first** (page.tsx Providers tab JSX + `LLM_PROVIDERS`/`STT_PROVIDERS` consts, `server-session.ts`
   normalization, i18n `settings.providers.*`) — FE has no DB dependency.
2. **API route** (`settings.ts`: `providerPrefsSchema`, `PUT /provider-prefs`, `LLMProviderName`/`STTProviderName`
   imports) + its test.
3. **Identity package** (contracts `api.ts` types + UserDTO fields, `user-repo` port `updateProviderPrefs` +
   impl, delete `application/update-provider-prefs.ts` + its test, `better-auth.ts` `additionalFields`
   `preferredLlmProvider`/`preferredSttProvider`).
4. **Schema + migration LAST** — drop `preferred_llm_provider` + `preferred_stt_provider` columns from
   `identity.users` (`packages/identity/.../schema.ts`) + a new `drizzle/00NN_*.sql` migration. Migration runs via
   the migrator image — **rebuild migrator** (baked `drizzle/`) or `make migrate` silently no-ops (known gotcha).
5. `make ci-gate` green (tenant-leak gate) after removal.

> Columns are `text` and nullable-ish — a plain `ALTER TABLE ... DROP COLUMN` is non-destructive to other data.
> No backfill. The drop is the only irreversible step; everything above is code-only.

---

## Validation Architecture

Per-requirement validation strategy (Nyquist Dimension 8). Every requirement maps to at least one runnable check;
TDD-first per CLAUDE.md.

| Requirement                                   | Validation layer(s)          | Concrete check                                                                                                                                                                                             |
| --------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider removal (USET-removal)               | Integration + ci-gate + grep | `apps/api/test/routes/settings.test.ts` provider-prefs tests deleted; `grep -r preferredLlmProvider src` → 0 hits; `make ci-gate` green; migration drops both columns (`\d identity.users` shows neither). |
| Settings pill shell (General · User)          | Component (Vitest+RTL) + E2E | shell renders 2 pills, pushState carousel switches without RSC; `loading.tsx` present. E2E: navigate both pills @375px.                                                                                    |
| General (locale + currency restyle)           | Component + E2E              | existing `PUT /settings/locale` + `/display-currency` still 200; locale change reloads `[locale]`.                                                                                                         |
| Profile name edit                             | Integration + E2E            | `authClient.updateUser({name})` → DB plain `name` updated; E2E change-name golden.                                                                                                                         |
| Profile email change + re-verify (USET email) | **Integration (critical)**   | email change → plain `email` updated, `email_verified=false`, **`email_hash` recomputed** (assert `findByEmail(newEmail)` resolves, old fails); correct template→address. E2E change-email + re-verify.    |
| Email-gated password change (USET pw)         | Integration + E2E            | logged-in button → `requestPasswordReset` fires `reset-password` email to self; `/reset-password?token` sets new pw. E2E golden.                                                                           |
| Sessions list + revoke + sign-out-others      | Component + E2E              | revoke removes row; `revokeOtherSessions` leaves only current. E2E revoke + sign-out-others.                                                                                                               |
| Account deletion / GDPR (USET delete)         | **Integration (critical)**   | PRIVATE-owner delete purges budget + tenant data + `user_keys` + memberships + invitations + user; SHARED-with-members **blocks**; user signed out. E2E delete-account golden (typed confirm + password).  |
| Forgot/reset pages + sign-in link             | E2E (Gherkin)                | forgot-password golden + expired-token; sign-in "Forgot?" → `/forgot-password`. EN/PL/UK.                                                                                                                  |
| Cross-cutting i18n                            | Build + grep                 | every new key present in en/pl/uk; `settings.providers.*` removed.                                                                                                                                         |

**Reference dataset / fixtures:** fresh-user-per-scenario E2E fixture (existing); integration tests use real
Postgres (no mocking, per CLAUDE.md) with `AUTH_RATE_LIMIT_DISABLED=true` for reset/sign-in endpoints.

**Critical failure modes to guard:** (1) email change without `email_hash` recompute → silent `findByEmail`
breakage (no error, login-by-email fails later); (2) account deletion leaving orphan tenant data or a live
`user_keys` row → GDPR violation + decrypt-after-delete; (3) deleting a SHARED budget's data out from under
other members; (4) provider-column drop migration silently no-op'd (migrator image not rebuilt).

---

## Open decisions to confirm at plan/exec time (not blockers)

1. **Email-change hop count** — confirm via integration test whether installed Better Auth sends confirm-to-old
   then verify-new (two-hop) or only verify-new (single-hop); wire `sendChangeEmailConfirmation` accordingly.
2. **Delete confirmation mechanism** — recommended `deleteUser({ password })` (password re-entry + typed
   `DELETE`). Fallback if password-gating is awkward with cookie-cache sessions: `sendDeleteAccountVerification`
   email flow (adds a template). Confirm in the Danger-Zone plan.
3. **SHARED-owner block vs transfer** — recommended: block in v1.2; transfer-ownership deferred to v1.3.
