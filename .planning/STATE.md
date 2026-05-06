---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 01-08-web-app-surfaces-PLAN.md
last_updated: "2026-05-06T21:07:00.000Z"
last_activity: 2026-05-06 -- 01.08 web-app-surfaces complete
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 11
  completed_plans: 8
  percent: 73
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-05)

**Core value:** A family can replace a complex personal-budget spreadsheet with a multi-user, multi-currency tool that tells them — through a single Tasks queue — exactly what to do this week to keep budget, reserve, and cushion healthy.
**Current focus:** Phase 1 — Foundations

## Current Position

Phase: 1 of 6 (Foundations — executing)
Plan: 9 of 11
Status: Wave 2 complete — 01.08 web-app-surfaces done; 01.09 docker-compose-stack next
Last activity: 2026-05-06 -- 01.08 web-app-surfaces complete

Progress: [███████░░░] 73%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase                             | Plans | Total | Avg/Plan |
| --------------------------------- | ----- | ----- | -------- |
| 1. Foundations                    | 0     | —     | —        |
| 2. Budgeting & FX                 | 0     | —     | —        |
| 3. Reserve, Investments, Cushion  | 0     | —     | —        |
| 4. Tasks, Insights, Notifications | 0     | —     | —        |
| 5. Onboarding & Comparison        | 0     | —     | —        |
| 6. Launch Hardening               | 0     | —     | —        |

**Recent Trend:**

- Last 5 plans: none
- Trend: —

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Postgres + tenant_id + RLS (not schema-per-tenant); app + worker roles have NO BYPASSRLS; FORCE ROW LEVEL SECURITY on all user-data tables
- Phase 1: Better Auth + organization plugin (not Lucia, deprecated) for family workspace
- Phase 1: Drizzle (not Prisma) for first-class `pgPolicy()` RLS
- Phase 1: Crypto-shredding day 1 — PII columns separated from ledger; DEK destroy flow ships Phase 6
- Phase 1: dependency-cruiser CI rule — `domain/` cannot import `drizzle-orm`, Hono, AI SDK, or `adapters/`
- Phase 5: LLM bounded to Onboarding adapter only; Tasks generators are deterministic
- Phase 5: Comparison gated behind DPIA + k-anonymity floor (k≥20, tenant-policy-configurable)
- 01.05: better-auth/adapters/drizzle ships inside better-auth 1.6+ (no @better-auth/drizzle-adapter package)
- 01.05: listSessions is session-context-based in Better Auth; server-side list returns []; UI uses BA client
- 01.05: DEK insert in user.create.after is best-effort (PC-09); Phase 6 adds reconciliation worker
- 01.05: Plain email column kept in identity.users for Phase 1 Better Auth compatibility; Phase 6 drops it
- 01.06: DrizzleWorkspaceRepo.findById/listMembers use withInfraTx (bootstrap carve-out); no user context at lookup time
- 01.06: test/helpers.ts pattern for cross-package test helpers (dep-cruiser only restricts src/ not test/ imports)
- 01.06: PRIVATE-cap trigger PC-18 limitation documented — Phase 6 will harden with SELECT FOR UPDATE
- 01.06: createTenancyModule uses lazy require() to keep contracts/ free of adapter imports (PC-15)
- 01.07: PC-27 — withBootstrapUserContext is the dedicated bootstrap primitive for tenant-guard (not raw pool connect); avoids grep:no-pool-connect CI gate
- 01.07: apps/\*_ cannot statically import packages/_/src/application — route handlers call auth.api directly using factory output
- 01.08: AppType imported via local shim (api-type.d.ts) not directly from apps/api to prevent pre-existing Hono context type errors cascading
- 01.08: Tailwind v4 uses @import not @tailwind directives; @apply with CSS variable utilities unsupported in @layer base
- 01.08: turbopack: false is invalid in Next.js 16 config (object expected, not boolean); Serwist requires --webpack build flag
- 01.08: sessions-list receives empty array Phase 1; real session list wired Phase 2 (IDNT-04)
- 01.08: proxy.ts (not middleware.ts) for next-intl routing — avoids next-intl pitfall 12

### Pending Todos

None yet.

### Blockers/Concerns

Open questions to resolve in/before Phase 1 (from research):

- Crypto-shredding key storage: Postgres pgcrypto + KEK env var, or external KMS? Decide before migration #001
- Better Auth `organization.members` vs domain `family_members`: pick mechanic in Phase 1 plan
- Hosting region v1: single-region confirmed (PLAT-11); region-per-family is v1.x
- Voice STT default: Browser Web Speech with Groq fallback, or always-Groq — defer to Phase 5

## Deferred Items

| Category | Item | Status | Deferred At |
| -------- | ---- | ------ | ----------- |
| _(none)_ |      |        |             |

## Session Continuity

Last session: 2026-05-06T21:07:00.000Z
Stopped at: Completed 01-08-web-app-surfaces-PLAN.md
Resume file: None
