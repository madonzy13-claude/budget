---
phase: 06-settings-onboarding-share-ui
plan: "07"
subsystem: apps/web — share link join UI
tags: [join-page, middleware-allowlist, public-route, shrd-04, share-join, tdd]
dependency_graph:
  requires:
    - plan/06-01 (card.tsx, button.tsx primitives)
    - plan/06-05 (share namespace created in en.json)
  provides:
    - Public /budgets/join/[token] route (SHRD-04)
    - JoinPageCard with 6 states + accept mutation
    - Middleware allowlist for /budgets/join/*
    - Join-page i18n keys appended to share namespace
  affects:
    - plan/06-08 (E2E can test join flow)
tech_stack:
  added: []
  patterns:
    - "Public RSC outside (app) group: app/[locale]/budgets/join/[token]/page.tsx"
    - "Middleware PUBLIC_BUDGET_PATHS allowlist pattern (complements PROTECTED_ROUTES)"
    - "JoinPageCard: useState(cardState) for client-side state transitions on 410/409"
    - "Server-side auth detection via getServerSession() — null = unauthenticated"
    - "accept() fetch /api/budgets/join/:token/accept with credentials:include"
    - "TDD: RED stub → GREEN implementation with human-readable mock translations"
key_files:
  created:
    - apps/web/src/components/share/join-page-card.tsx
    - apps/web/src/app/[locale]/budgets/join/[token]/page.tsx
  modified:
    - apps/web/src/middleware.ts
    - apps/web/messages/en.json
    - apps/web/test/share/join-page-card.test.tsx
decisions:
  - "JoinPageCard client component holds cardState in useState — accept POST 410/409 transitions state without a page reload (better UX than RSC re-render)"
  - "Unauthenticated CTA rendered as Button variant=ghost (not Link) to keep role=button for RTL getByRole assertions"
  - "Test mock returns human-readable strings instead of i18n keys — enables pattern matching on /joining/i for accepting state"
  - "already_used CTA links to /${locale} (home) rather than a specific budget — budgetId not available in already_used state from GET resolve"
  - "Route outside (app) group — no layout.tsx inheritance, no onboarding guard, no TopNav"
metrics:
  duration: "~8 min"
  completed: "2026-05-22"
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 6 Plan 07: Share Link Join Page Summary

**One-liner:** Public /budgets/join/[token] join page with 6 card states — valid/expired/revoked/already-used/not-found/accepting — wired to Phase 2 share-join backend; middleware allowlist exempts the route from auth bounce; authenticated accept creates membership and redirects to /budgets/:id/spendings.

## Tasks Completed

| #   | Task                                              | Commit  | Key Files                                           |
| --- | ------------------------------------------------- | ------- | --------------------------------------------------- |
| 1   | Middleware public allowlist for /budgets/join/\*  | 0fab773 | apps/web/src/middleware.ts                          |
| RED | Failing tests for JoinPageCard 6 states           | 4b3506b | apps/web/test/share/join-page-card.test.tsx         |
| 2   | JoinPageCard + public join route + i18n join keys | b229916 | join-page-card.tsx, [token]/page.tsx, en.json, test |

## Verification Results

- `cd apps/web && bun run test -- share/` — 6 pass, 0 fail
- `grep -c "PUBLIC_BUDGET_PATHS" middleware.ts` — 2 (declaration + use)
- `grep '"/budgets/join/"' middleware.ts` — matches
- `grep "!PUBLIC_BUDGET_PATHS.some" middleware.ts` — matches
- Route at `app/[locale]/budgets/join/[token]/page.tsx` (NOT inside `(app)`)
- `grep "JoinPageCard" [token]/page.tsx` — matches
- All 4 state strings (not_found, expired, already_used, valid) present in join-page-card.tsx
- `grep "accept" join-page-card.tsx` — matches (handleAccept + POST accept endpoint)
- `grep "spendings" join-page-card.tsx` — matches (accept redirect target)
- `grep '"share"' en.json` — matches; namespace has both 06-05 share-field keys AND join-page keys

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test i18n mock returned keys not values**

- **Found during:** GREEN phase test run
- **Issue:** Mock `useTranslations: () => (key) => key` returns key strings like `"accepting_cta"` which don't match `/joining/i` regex assertion
- **Fix:** Updated mock to return human-readable translation stubs matching actual en.json values
- **Files modified:** test/share/join-page-card.test.tsx
- **Commit:** included in b229916 (same commit, test fix + component in one GREEN commit)

## Threat Model Compliance

| Threat ID  | Mitigation Status | Location                                                                        |
| ---------- | ----------------- | ------------------------------------------------------------------------------- |
| T-06-07-02 | Mitigated         | RSC renders only budgetName from GET response — no amounts, members, or secrets |
| T-06-07-03 | Mitigated         | Unauthenticated CTA routes to sign-in; accept POST 401 handled by backend       |
| T-06-07-04 | Mitigated         | accept() transitions cardState on 410/409 — never redirects to budget on error  |
| T-06-07-05 | Mitigated         | Route outside (app); middleware PUBLIC_BUDGET_PATHS exemption in place          |

## Known Stubs

None — all plan deliverables fully implemented and wired to real backend endpoints.

## Self-Check: PASSED

- [x] apps/web/src/components/share/join-page-card.tsx — FOUND
- [x] apps/web/src/app/[locale]/budgets/join/[token]/page.tsx — FOUND
- [x] apps/web/src/middleware.ts PUBLIC_BUDGET_PATHS — FOUND (2 occurrences)
- [x] apps/web/messages/en.json share namespace join keys — FOUND
- [x] test/share/join-page-card.test.tsx — 6/6 GREEN
- [x] Route outside (app) group — CONFIRMED
- [x] Commits 0fab773, 4b3506b, b229916 — FOUND
