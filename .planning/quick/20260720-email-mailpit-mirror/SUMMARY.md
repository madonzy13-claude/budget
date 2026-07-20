---
slug: email-mailpit-mirror
status: complete
date: 2026-07-20
---

# Summary: Mailpit mirror + reserved-domain guard for API email

## Delivered

Dev now sends every mail via the **real SMTP provider** (Mailtrap live,
`live.smtp.mailtrap.io:587`, from `Budget <noreply@send.madonzy.com>`) **and**
mirrors it to mailpit, toggled by `MAILPIT_ENABLED`. E2E never reaches the real
provider — all E2E addresses (`@test.local` / `@example.com` / `@example.test`)
are RFC-reserved and skipped by the guard.

## Changes

- `packages/platform/src/email/reserved-email-domains.ts` — `isReservedEmailDomain`,
  `isLocalMailHost`, `SkipReservedDomainsEmailSender`.
- `packages/platform/src/email/fan-out-email-sender.ts` — `FanOutEmailSender`.
  Runs ALL senders via `Promise.allSettled`, then propagates the primary's
  failure (a flaky real leg never costs the mailpit copy).
- `packages/platform/src/index.ts` — re-export both.
- `packages/shared-kernel/src/env.ts` — `MAILPIT_ENABLED/HOST/PORT`; relaxed
  `SMTP_FROM` from `.email()` to `.string().min(1)` (was crash-looping boot on
  the display-name `Name <addr>` form).
- `apps/api/src/boot.ts` — `buildEmailSender`: real (guarded iff non-local host)
  + mailpit mirror when enabled → FanOut / single / Stdout.
- `docker-compose.override.yml` — stop pinning api SMTP_* to mailpit; let the
  real provider (Infisical) through + `MAILPIT_ENABLED=true`. Worker left
  mailpit-only (it sends no email).

## Tests (TDD red→green)

- `packages/platform/test/reserved-email-domains.test.ts` (guard/domains/host)
- `packages/platform/test/fan-out-email-sender.test.ts` (primary/mirror semantics)
- `packages/shared-kernel/test/env.test.ts` (display-name SMTP_FROM accepted)
- All green; typecheck + eslint(0-warn) clean.

## Live verification (budget-dev)

- Direct Mailtrap send → `250 queued`, accepted `madonzy13@gmail.com` (real email).
- Real Better Auth signup (first email after boot) → mailpit received
  "Verify your email — Budget" **with a valid verify link**; primary Mailtrap
  leg ran in the same allSettled → real email to gmail. Dual-send confirmed.

## Root cause fixed mid-task

First send after a container boot lost the mailpit copy because the old FanOut
awaited the primary before the mirror and skipped the mirror on primary failure
(cold TLS handshake threw). Now `allSettled` guarantees the mirror always runs.

## Commits

- `8b46e15` feat(email): mirror to mailpit + reserved-domain guard
- `d890442` fix(email): allow display-name SMTP_FROM; dev mirrors real→mailpit
- `47035b9` fix(email): fan-out always attempts mirror, even on primary failure

## Notes

- Test accounts created on dev during UAT: `madonzy13@gmail.com` (+`+dual`,
  `+verify`), all unverified — harmless dev data.
- Branch `feat/email-smtp-mailpit-mirror` (off main). NOT pushed.
