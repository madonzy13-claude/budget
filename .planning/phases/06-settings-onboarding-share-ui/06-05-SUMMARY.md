---
phase: 06-settings-onboarding-share-ui
plan: "05"
subsystem: apps/web — settings UI components
tags:
  [
    settings-accordion,
    budget-identity,
    cushion-mode,
    recurring-section,
    members-section,
    danger-zone,
    share-url-field,
    sett-01,
    sett-02,
    sett-03,
    sett-04,
    sett-05,
    sett-06,
    sett-07,
    sett-08,
    sett-09,
  ]
dependency_graph:
  requires:
    - plan/06-01 (accordion.tsx + switch.tsx primitives)
    - plan/06-02 (PATCH /budgets/:id, hasTransactions on GET)
    - plan/06-03 (GET /budgets/:id/members, POST revoke)
    - plan/06-04 (POST archive, POST delete, POST leave)
  provides:
    - Settings tab 5-section accordion (SETT-01..09)
    - share namespace in en.json (for Plan 06-07 to extend)
    - /recurring retired → redirect to /${locale}
  affects:
    - plan/06-07 (share namespace exists; join-page can add keys)
    - plan/06-08 (E2E budget-settings.feature can exercise all sections)
tech_stack:
  added: []
  patterns:
    - "SettingsAccordion: type=single defaultValue=budget-identity collapsible"
    - "InlineEditCell: blur-to-save with double-commit guard for budget name"
    - "Switch onCheckedChange: PATCH cushion_mode_enabled with instant toast (no confirm)"
    - "RecurringSection: RecurringRulesList + Sheet + RecurringRuleForm reuse (D-03)"
    - "ShareUrlField: ephemeral useState URL, clipboard.writeText catch toast (D-14)"
    - "DangerZone: AlertDialog typed-name gate disabled={confirmName !== budgetName}"
    - "Members: useQuery + invalidateQueries on revoke + AlertDialog confirm (D-16)"
key_files:
  created:
    - apps/web/src/components/settings/settings-accordion.tsx
    - apps/web/src/components/settings/budget-identity-section.tsx
    - apps/web/src/components/settings/cushion-mode-section.tsx
    - apps/web/src/components/settings/recurring-section.tsx
    - apps/web/src/components/settings/members-section.tsx
    - apps/web/src/components/settings/share-url-field.tsx
    - apps/web/src/components/settings/danger-zone-section.tsx
    - apps/web/src/app/[locale]/(app)/recurring/page.tsx
  modified:
    - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx
    - apps/web/messages/en.json
    - apps/web/test/settings/settings-accordion.test.tsx
    - apps/web/test/settings/danger-zone-section.test.tsx
decisions:
  - "RecurringSection makes RecurringRuleForm budgetId-agnostic — form uses its own fetch paths unchanged; no forking required (D-03)"
  - "budgetId param in RecurringSectionProps is optional (no API call in this component — rules passed as props); avoids unused-vars lint error"
  - "ShareUrlField uses standalone share namespace (not settings.*) for Plan 06-07 extensibility"
  - "DangerZoneSection: bare catch in handleDelete avoids double-toast when deleteError is set from 422 branch"
  - "/recurring/page.tsx redirects to /${locale} (home) — no budget id in context at this route"
metrics:
  duration: "~12 min"
  completed: "2026-05-22"
  tasks_completed: 2
  files_created: 8
  files_modified: 4
---

# Phase 6 Plan 05: Settings Accordion UI Summary

**One-liner:** 5-section accordion Settings tab wired to all Phase 6 backend endpoints — identity autosave, cushion toggle, recurring Sheet reuse, members share/revoke, danger-zone typed-name delete; /recurring route retired; component tests 9/9 GREEN.

## Tasks Completed

| #   | Task                                                                                             | Commit  | Key Files                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | SettingsAccordion shell + identity/cushion/recurring sections + /recurring retire + en.json keys | bc32c71 | settings-accordion.tsx, budget-identity-section.tsx, cushion-mode-section.tsx, recurring-section.tsx, members-section.tsx, danger-zone-section.tsx, share-url-field.tsx, recurring/page.tsx, en.json |
| 2   | danger-zone test + members/share test coverage GREEN                                             | 20d0af6 | test/settings/danger-zone-section.test.tsx                                                                                                                                                           |
| —   | Lint fix: unused catch var + unused budgetId param                                               | b6c1f80 | danger-zone-section.tsx, recurring-section.tsx                                                                                                                                                       |

## Verification Results

- `cd apps/web && bun run test -- settings/` — 9 pass, 0 fail (2 test files)
- `cd apps/web && bun run build` — compiles cleanly, no TypeScript or lint errors
- `grep 'defaultValue="budget-identity"' settings-accordion.tsx` — matches
- `grep 'kind === "SHARED"' settings-accordion.tsx` — matches (Members conditional)
- `grep "InlineEditCell" budget-identity-section.tsx` — matches
- `grep "Switch" cushion-mode-section.tsx` — matches
- `grep "RecurringRulesList" recurring-section.tsx` — matches
- `grep "navigator.clipboard.writeText" share-url-field.tsx` — matches
- `grep "copy_failed" share-url-field.tsx` — matches (catch branch implemented)
- `grep "AlertDialog" danger-zone-section.tsx` — matches
- `grep "disabled" danger-zone-section.tsx` — matches (typed-name gate)
- `grep "confirmName" danger-zone-section.tsx` — matches
- `grep "AlertDialog" members-section.tsx` — matches (revoke confirm, D-16)
- `grep '"members"' en.json && grep '"danger"' en.json && grep '"share"' en.json` — all match
- `grep "redirect" recurring/page.tsx` — matches (/recurring retired)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two ESLint unused-vars errors blocked build**

- **Found during:** Final `bun run build` verification
- **Issue 1:** `catch (err)` in `danger-zone-section.tsx` — `err` defined but never used
- **Issue 2:** `budgetId` destructured in `RecurringSection` function params but not used (form calls its own API paths)
- **Fix:** Bare `catch {}` in danger-zone; `budgetId` made optional in interface and removed from destructure
- **Files modified:** danger-zone-section.tsx, recurring-section.tsx
- **Commit:** b6c1f80

## Threat Model Compliance

| Threat ID  | Mitigation Status | Location                                                            |
| ---------- | ----------------- | ------------------------------------------------------------------- |
| T-06-05-01 | Mitigated         | DangerZoneSection renders Archive/Delete only when `isOwner===true` |
| T-06-05-02 | Accepted          | UI typed-name gate cosmetic; server re-validates (Plan 06-04)       |
| T-06-05-03 | Mitigated         | Members AccordionItem not rendered when `kind !== "SHARED"`         |
| T-06-05-04 | Mitigated         | ShareUrlField URL held in useState only — ephemeral, no persistence |

## Known Stubs

None — all plan deliverables fully implemented and wired to real endpoints.

## Self-Check

- [x] settings-accordion.tsx — FOUND
- [x] budget-identity-section.tsx — FOUND
- [x] cushion-mode-section.tsx — FOUND
- [x] recurring-section.tsx — FOUND
- [x] members-section.tsx — FOUND
- [x] share-url-field.tsx — FOUND
- [x] danger-zone-section.tsx — FOUND
- [x] recurring/page.tsx — FOUND (redirect)
- [x] settings/page.tsx updated — FOUND
- [x] en.json settings.\* namespace added — FOUND
- [x] en.json share.\* namespace created — FOUND
- [x] test/settings/settings-accordion.test.tsx — 3/3 GREEN
- [x] test/settings/danger-zone-section.test.tsx — 6/6 GREEN
- [x] bun run build — PASSES
- [x] Commits bc32c71, 20d0af6, b6c1f80 — FOUND

## Self-Check: PASSED
