# Phase 10 — User Settings Redesign · CONTEXT

Design record from brainstorm (2026-06-26). Seeds `/gsd-plan-phase 10`. Captures locked
decisions, reuse targets, the exact Provider-removal surface, what already exists vs. is
missing, and gotchas — so planning/research doesn't re-derive it.

> Scope = **USER account settings**, NOT per-budget settings. v1.2 track. Mobile-first.

---

## Locked decisions

1. **Shell** — replace the legacy 4-tab page with a **2-pill client carousel** reusing the
   **BDP pill pattern** (pushState carousel under a catch-all route, tiered prefetch, SWR
   hooks, `loading.tsx` instant soft-nav). Pills: **General · User**.
2. **User pill content** reuses the **BDP Settings-tab accordion** layout (`settings-accordion.tsx`
   pattern). Sections, in order: **Profile → Security → Danger Zone**.
3. **General pill** — display language + display currency. Both already exist; restyle into
   the new shell only. No backend change.
4. **Profile** — edit **name** (`authClient.updateUser({ name })`) and **email**
   (`authClient.changeEmail`). Email change → re-verification link to the NEW address; email
   stays pending/unverified until clicked.
5. **Security** — **email-gated password change, REUSING the reset flow**: button calls
   `requestPasswordReset`/`forgetPassword` (existing `sendResetPassword` + `reset-password`
   template) → user clicks emailed link → lands on the SAME `/reset-password` consume page →
   sets new password. No up-front new-password entry, no custom pending-password table.
   Plus the existing **active-sessions list + revoke**, and a new **"sign out all other
   devices"** action (`revokeOtherSessions`).
6. **Danger Zone** — user can **permanently delete their own account** after explicit
   confirmation (GDPR right-to-delete); personal data removed + user signed out.
7. **Forgot password (logged-out)** — build the two MISSING pages: `/[locale]/forgot-password`
   (request) + `/[locale]/reset-password` (consume `?token=`). Fix the sign-in "Forgot your
   password?" link (currently points at a dead `/reset-password`).
8. **Provider feature (AI/voice)** — removed **end-to-end, including the DB columns** (migration).
9. **Avatar/profile image** — OUT OF SCOPE (no upload/storage pipeline exists; `image` col is a URL).

---

## Reuse targets (mirror these, don't reinvent)

- **Pill carousel shell** — BDP client tabs: `apps/web/src/lib/bdp-tabs.ts` (non-client shared
  consts), the catch-all `[[...tab]]` route + pushState carousel, tiered prefetch, per-tab
  `loading.tsx`. Create a parallel `lib/settings-tabs.ts`. (See memory: BDP client tabs,
  loading.tsx instant soft-nav, prefetch thundering-herd tiering.)
- **Section accordion** — BDP Settings tab: `apps/web/src/components/settings/settings-accordion.tsx`
  (+ `budget-identity-section.tsx`, `settings-tab-client.tsx`) for section structure.
- **Sessions** — existing `apps/web/src/components/settings/sessions-list.tsx`
  (`authClient.revokeSession`); restyle, add sign-out-others.
- **Language / currency** — existing `locale-select.tsx` (hard-reload to swap `[locale]`,
  keep) + `display-currency-picker.tsx`.
- **Design system** — `DESIGN.md` (Binance dark canvas, single yellow accent #fcd535,
  surface-card #1e2329, hairline #2b3139, Inter/IBM Plex). Reuse `components/ui/*` primitives.

---

## Provider-removal surface (full, exact where read)

| Layer         | File                                                                  | Detail                                                                                                                     |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FE UI         | `apps/web/src/app/[locale]/(app)/settings/page.tsx`                   | `LLM_PROVIDERS`/`STT_PROVIDERS` consts (19-27) + Providers tab JSX (90-136)                                                |
| API route     | `apps/api/src/routes/settings.ts`                                     | `providerPrefsSchema` (30-33) + `PUT /provider-prefs` handler (73-96) + `LLMProviderName`/`STTProviderName` import (13-17) |
| API test      | `apps/api/test/routes/settings.test.ts`                               | provider-prefs tests (~119-149)                                                                                            |
| Better Auth   | `packages/identity/src/adapters/persistence/better-auth.ts`           | `user.additionalFields.preferredLlmProvider` + `preferredSttProvider` (149-158)                                            |
| DB schema     | `packages/identity/src/adapters/persistence/schema.ts`                | `preferred_llm_provider`, `preferred_stt_provider` columns                                                                 |
| **Migration** | new `drizzle/00NN_*.sql`                                              | DROP both columns (+ `post-migration.sql` if used)                                                                         |
| Domain types  | `packages/identity/src/contracts/api.ts`                              | `LLMProviderName`, `STTProviderName`; UserDTO fields                                                                       |
| Repo port     | `packages/identity/src/ports/user-repo.ts`                            | `updateProviderPrefs` signature                                                                                            |
| Repo impl     | `packages/identity/src/adapters/persistence/user-repo.ts`             | `updateProviderPrefs` method + SQL mapping                                                                                 |
| App layer     | `packages/identity/src/application/update-provider-prefs.ts` (+ test) | delete whole file + `test/provider-prefs.test.ts`                                                                          |
| Session norm  | `apps/web/src/lib/server-session.ts`                                  | camelCase normalization (196-201)                                                                                          |
| i18n          | `apps/web/messages/{en,pl,uk}.json`                                   | `settings.providers.*` keys                                                                                                |

---

## Already exists vs. missing

**Exists (restyle / reuse):** sessions list + revoke (`GET/DELETE /settings/sessions`),
locale update (`PUT /settings/locale`), display-currency update (`PUT /settings/display-currency`),
reset-password email template + `sendResetPassword` config (`resetPasswordTokenExpiresIn: 1800`),
`reset.*` / `verify.*` / `signin.*` i18n keys.

**Missing (build):**

- Profile **name update** endpoint/UI (none today) — via Better Auth `updateUser`.
- Profile **email change** — `user.changeEmail` is **NOT enabled** in `better-auth.ts`; needs
  `user: { changeEmail: { enabled: true, sendChangeEmailVerification } }` + a new **`change-email`
  email template** (EN/PL/UK in `packages/platform/src/email/templates.ts`) + i18n.
- **Password-change UI** (none) — wire the reuse-reset flow (decision 5).
- **Forgot-password pages** — `/[locale]/forgot-password` + `/[locale]/reset-password` (none exist;
  sign-in links to a dead `/reset-password`).
- **Account-deletion** flow (Danger Zone) — Better Auth `deleteUser` (enable + verification?) or a
  custom cascade; must purge identity + tenancy personal data (GDPR). Confirm cascade scope in research.

---

## Gotchas (carry into planning)

- **`email_hash` recompute on email change** — `name`/`email` columns are encrypted
  (`email_hash` UNIQUE, `email_encrypted`/`email_nonce`, `name_encrypted`/`name_nonce`). Better
  Auth `updateUser`/`changeEmail` only touch the PLAIN columns. An email change MUST recompute
  `email_hash` (+ `email_encrypted`) via a `databaseHooks.user.update` after-hook using
  `withUserContext` + `keyStore.emailHash` — mirror the create-after hook (better-auth.ts:180-205).
  Else unique-hash lookups (`findByEmail`) break. Name re-encryption is Phase-6 concern (plain
  `name` is what's read today) — note but don't block.
- **Locale change = full reload** (swap `[locale]` segment) — keep `window.location.assign`.
- **Password min length 10** (`emailAndPassword.minPasswordLength: 10`) — mirror in forms.
- **Rate limit** — sign-in/reset endpoints keep the global 100/60s limit (anti-brute-force);
  `/get-session` exempt. E2E uses `AUTH_RATE_LIMIT_DISABLED=true`.
- **Account deletion** is irreversible + signs the user out — confirm with typed confirmation;
  decide session/tenancy cascade (sole budget owner? membership rows?) during research.
- **Rebuild after FE/i18n edits** (`make restart-web`) — bundled at build time. Email-template
  edits → rebuild `api` + `worker`.

---

## Testing (TDD-first, per CLAUDE.md)

- **Integration** (`apps/api/test/`): name update, email change (+ pending state + email_hash
  recompute), password-reset request while logged in, account deletion, every changed route.
- **Component** (`apps/web/test/`, Vitest+RTL): each section + the pill shell.
- **E2E Gherkin** (`apps/web/e2e/`, playwright-bdd, fresh-user-per-scenario): forgot-password
  golden + expired token, change name, change email + re-verify, email-gated password change,
  revoke session, sign-out-others, delete account. EN/PL/UK + 375px phone viewport.
- `make ci-gate` green after Provider removal (tenant-leak gate).

---

## Next

`/gsd-plan-phase 10` — break into plans/waves (suggested: ① Provider removal + migration ·
② settings pill shell · ③ General · ④ Profile name/email + changeEmail wiring · ⑤ Security
password+sessions · ⑥ Danger Zone delete · ⑦ forgot/reset pages + sign-in link · cross-cutting
i18n + E2E).
