---
slug: email-mailpit-mirror
status: in-progress
date: 2026-07-20
---

# Quick Task: Mailpit mirror + reserved-domain guard for API email

## Problem

Dev/prod now send via real SMTP (Resend). Two needs:

1. Optionally **also** deliver every mail to mailpit (dev inbox) — toggleable.
2. **Guarantee** E2E never sends to the real provider (all E2E addresses are
   `@test.local` / `@example.com` / `@example.test`), independent of stack config.

## Approach

- `isReservedEmailDomain(to)` — RFC 2606 (`example.com/.test/.invalid/.example/
.localhost`) + RFC 6762 (`.local`). Every E2E address matches.
- `isLocalMailHost(host)` — `mailpit`/`localhost`/`127.0.0.1`/`::1`/`*.local`.
  Guard is applied by boot ONLY when the real host is non-local, so a stack
  pointed at mailpit (CI/E2E) still delivers reserved addresses to the catcher.
- `SkipReservedDomainsEmailSender` — wraps the real sender; drops reserved
  recipients (never reach Resend → no bounces, no reputation damage).
- `FanOutEmailSender` — primary (real) failure propagates; mirror (mailpit)
  best-effort.
- `MAILPIT_ENABLED` / `MAILPIT_HOST` (def `mailpit`) / `MAILPIT_PORT` (def 1025).
- boot `buildEmailSender`: real (guarded iff non-local) + mailpit mirror when
  enabled → FanOut when both, single when one, Stdout when none.

## Tasks

1. [red→green] `packages/platform/test/reserved-email-domains.test.ts`
2. [red→green] `packages/platform/test/fan-out-email-sender.test.ts`
3. `packages/platform/src/email/reserved-email-domains.ts`
4. `packages/platform/src/email/fan-out-email-sender.ts`
5. Re-export both from `packages/platform/src/index.ts`
6. `MAILPIT_*` in `packages/shared-kernel/src/env.ts`
7. Rewrite `buildEmailSender` in `apps/api/src/boot.ts`
8. tsc + eslint + bun test → rebuild api → send test email to madonzy13@gmail.com

## Constraint

E2E never hits real SMTP. No CI/compose changes (CI's `SMTP_HOST=mailpit` is
local → unguarded → mailpit catches all).
