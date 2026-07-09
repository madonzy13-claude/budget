---
phase: 10-user-settings-redesign
plan: 06
subsystem: identity-ui
tags:
  [better-auth, delete-user, gdpr, rls, cascade, crypto-shred, email-template]

requires:
  - phase: 10-user-settings-redesign
    provides: User-pill Danger Zone slot (10-02) + changeEmail/deleteUser user block (10-03)
  - phase: 02-identity
    provides: withUserContext + budget_members_self bootstrap policy + user_keys crypto-shred (destroyed_at)
provides:
  - "Better Auth user.deleteUser (email-gated) + purgeUserData() application cascade"
  - "AccountDangerZone: typed-DELETE → authClient.deleteUser({ callbackURL })"
  - "delete-account email template (en/pl/uk)"
  - "post-migration column grant: UPDATE (created_by) on category_reserve_adjustments"
  - "settings.accountDanger.* i18n (en/pl/uk)"
affects: []

tech-stack:
  added: []
  patterns:
    - "App-level GDPR cascade in one withUserContext tx: bootstrap memberships via budget_members_self (current_user_id), SET LOCAL app.tenant_ids to them, then classify/block/purge — app_role, NO BYPASSRLS"
    - "Crypto-shred over row-delete for the DEK (user_keys has UPDATE not DELETE): destroyed_at + wiped key material erases all DEK-encrypted PII (incl. append-only audit_history/outbox that app_role can't delete)"
    - "Email-gated destructive action: deleteUser sends a confirmation link; beforeDelete cascade runs only when the link is consumed (mirrors the change-email pattern)"
    - "Column-scoped GRANT UPDATE (created_by) keeps an append-only ledger append-only while permitting GDPR anonymisation"

key-files:
  created:
    - packages/identity/test/account-deletion-cascade.test.ts
    - apps/web/test/settings/account-danger-zone.test.tsx
    - apps/web/e2e/features/settings-danger-zone.feature
    - apps/web/e2e/steps/settings-danger-zone.steps.ts
  modified:
    - packages/identity/src/adapters/persistence/better-auth.ts
    - packages/platform/src/email/templates.ts
    - packages/platform/test/email-templates.test.ts
    - apps/migrator/post-migration.sql
    - apps/web/src/components/settings/account-danger-zone.tsx
    - apps/web/messages/en.json
    - apps/web/messages/pl.json
    - apps/web/messages/uk.json

key-decisions:
  - "HUMAN CHECKPOINT (autonomous:false) answers: (1) mechanism = EMAIL-VERIFICATION (sendDeleteAccountVerification → delete-account template), not password-gated; (2) sole-owner-of-SHARED-with-members = BLOCK with remediation; (3) cross-budget authored reserve adjustments = ANONYMISE (created_by → NULL), keep the data."
  - "Cascade table list derived from the LIVE DB (information_schema), not guessed: 19 tenant_id tables; only expense_ledger/tasks/investments/budget_share_links ON DELETE CASCADE from budgets; the rest deleted explicitly."
  - "Three tenant tables intentionally NOT explicitly deleted: budget_share_links (CASCADEs + no DELETE grant), audit_history + outbox (no DELETE grant; their DEK-encrypted PII is erased by the crypto-shred)."
  - "Grant lives in post-migration.sql (runs after role creation, as admin), NOT a drizzle migration (which runs before app_role exists)."

patterns-established:
  - "purgeUserData() — the single auditable place the GDPR cascade + its table list live"
  - "Crypto-shred is the erase mechanism; row deletes are only for app_role-deletable tenant rows"

requirements-completed: [USET-06]

duration: ~70min
completed: 2026-06-26
---

# Phase 10 Plan 06: Account Deletion Cascade + Danger Zone Summary

**The Danger Zone deletes a user's account (GDPR right-to-delete) behind a typed-DELETE gate + an email confirmation. `purgeUserData()` runs the application-level cascade in Better Auth's `beforeDelete`: it blocks if the user solely owns a SHARED budget with other members, otherwise purges every solely-owned budget + all its tenant data, anonymises reserve adjustments the user authored elsewhere, and crypto-shreds the DEK. tenancy/shared_kernel have NO DB FK to identity.users, so this app cascade is the only thing that erases the data. Proven by a real-Postgres test (3/0) and a full live E2E (account actually deleted, old credentials rejected).**

## Performance

- **Duration:** ~70 min (checkpoint + DB enumeration + RED → GREEN → E2E + grant/shred iteration)
- **Completed:** 2026-06-26
- **Files:** 4 created, 9 modified (incl. post-migration.sql)

## Accomplishments

- `better-auth.ts`: `user.deleteUser` (enabled, email-gated) + exported `purgeUserData(uid)` — one `withUserContext` tx: bootstrap memberships → widen `app.tenant_ids` → BLOCK sole-owner-of-SHARED-with-members → purge each solely-owned budget across 15 explicitly-deletable tenant tables (+ `category_reserve_adjustments` first) + membership/invite/share rows + the budget → anonymise authored adjustments elsewhere → crypto-shred the DEK.
- `templates.ts`: `delete-account` template (en/pl/uk).
- `post-migration.sql`: column-scoped `GRANT UPDATE (created_by)` so the anonymise runs while the ledger stays otherwise append-only.
- `account-danger-zone.tsx`: typed-DELETE AlertDialog → `authClient.deleteUser({ callbackURL })`; `settings.accountDanger.*` i18n.

## Task Commits

1. **RED** — `test(10-06): failing account-deletion cascade + danger-zone UI + delete-account template`
2. **GREEN (+REFACTOR)** — `feat(10-06): account deletion cascade + danger zone UI`
3. **E2E** — `test(10-06): danger-zone e2e — full email-gated deletion`

(REFACTOR folded into GREEN — `purgeUserData` IS the extracted single-place cascade helper the plan asked for.)

## Decisions Made

- **Human checkpoint (autonomous:false)** resolved mechanism (email-verification), the SHARED-with-members block, and cross-budget anonymisation — see frontmatter.
- **Crypto-shred, not row-delete, for the DEK.** `app_role` has UPDATE (not DELETE) on `user_keys` — the system's day-one design erases by destroying key material (`destroyed_at` + wiped cipher/nonce). This also covers `audit_history`/`outbox`, which `app_role` cannot delete: their DEK-encrypted PII becomes undecryptable.
- **Grant in post-migration.sql, not a drizzle migration.** A drizzle migration runs before `app_role` exists; grants live in post-migration.sql (admin, after role creation). The first attempt (migration 0046) was reverted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `permission denied` (42501) on the cascade — app_role grant gaps**

- **Found during:** the RED→GREEN cascade test run.
- **Issue:** `app_role` lacked UPDATE on `category_reserve_adjustments` (append-only by design — even a 0-row anonymise UPDATE needs the table privilege), and had no DELETE on `user_keys`/`audit_history`/`outbox`/`budget_share_links`.
- **Fix:** column-scoped `GRANT UPDATE (created_by)` in post-migration.sql; crypto-shred the DEK via UPDATE instead of DELETE; drop the three undeletable tables from the explicit-delete list (budget_share_links CASCADEs; audit_history/outbox are crypto-shred-covered).
- **Verification:** cascade test 3/0; live E2E deleted a real account; tenant-leak gate 54/0.
- **Committed in:** the GREEN commit.

**2. [mechanism change → UI/test shape] Email-gated, not password-gated**

- The checkpoint chose email-verification, so the UI calls `deleteUser({ callbackURL })` (no password) and the component test asserts that; the SHARED-block surfaces server-side (cascade test), not in the request-time dialog. A `delete-account` email template was added (not in the original password-gated plan).

## Verification Results

- **Backend (real Postgres):** `account-deletion-cascade.test.ts` 3/0 + `email-templates.test.ts` 16/0. PRIVATE-owner purge leaves zero residual rows + no live DEK; SHARED-with-members blocks (deletes nothing); member-only removes the member + DEK and anonymises their authored adjustments.
- **Component (Vitest):** `apps/web/test/settings/` 21/0 (danger-zone: typed-DELETE gate + deleteUser call).
- **i18n parity:** `settings.accountDanger` identical across en/pl/uk.
- **Production build:** `docker compose build migrator api worker web` → exit 0.
- **Tenant-leak gate:** `bun test tests/tenant-leak` → **54 pass / 0 fail** (no cross-tenant regression).
- **Live E2E (budget-dev.madonzy.com):** `make test-e2e --grep @settings-danger` → **2 pass / 0 fail** (chromium + mobile): typed DELETE → real delete-account email → confirm link → cascade deletes the account → old credentials rejected.

## Issues Encountered

- The testcontainer flaked once (a setup race), passed cleanly on re-run (3/0). Grant gaps were the real blocker, fixed in post-migration.sql.

## Next Phase Readiness

- Phase 10 (all 6 plans) is complete. The settings redesign ships: provider feature removed, 2-pill carousel, profile name/email edit, security (password-reset + sessions), forgot/reset pages, and GDPR account deletion.

---

_Phase: 10-user-settings-redesign_
_Completed: 2026-06-26_
