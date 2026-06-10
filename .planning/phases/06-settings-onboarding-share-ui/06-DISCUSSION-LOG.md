# Phase 6: Settings, Onboarding & Share UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 6-settings-onboarding-share-ui
**Areas discussed:** Settings field interaction, Onboarding wizard shape, Danger zone & archive, Members & share-link UX

---

## Settings field interaction

### Budget identity edit pattern

| Option                    | Description                                                                         | Selected |
| ------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Inline-autosave per field | Click → edit → blur saves → toast. Matches Wallets tab (Phase 5) and grid autosave. | ✓        |
| Form + explicit Save      | Section is a form with a Save button; clearer dirty state but a new pattern.        |          |

### Cushion toggle aggression

| Option                  | Description                                               | Selected |
| ----------------------- | --------------------------------------------------------- | -------- |
| Instant persist + toast | Flip → PATCH immediately → toast. Reversible so low risk. | ✓        |
| Confirm dialog first    | alert-dialog warns before persisting.                     |          |

**Notes:** User asked how cushion relates to grid headers. Explained: each category carries two limits (`planned` + `cushion`); the toggle re-points all grid headers + reserve/overspent calc to the other column, never mutating data. With that, user chose instant persist.

### Recurring rules surfacing

| Option                               | Description                                                                          | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------ | -------- |
| Reuse P4 components, form in Sheet   | Render recurring-rules-list inline; add/edit form in Sheet. Retire /recurring route. | ✓        |
| Inline-expand row form               | Form expands in-place in the row. New layout work.                                   |          |
| Keep standalone /recurring, link out | Settings links out; keeps it light but splits the surface.                           |          |

### Section visual container

| Option                     | Description                                        | Selected |
| -------------------------- | -------------------------------------------------- | -------- |
| Plain sections + Separator | Vertical sections divided by separators. Lightest. |          |
| Card-wrapped sections      | Each section in a Card surface.                    |          |
| Accordion collapsibles     | Sections collapse/expand. Less scroll on mobile.   | ✓        |

---

## Onboarding wizard shape

### Wizard layout

| Option                   | Description                                                 | Selected |
| ------------------------ | ----------------------------------------------------------- | -------- |
| Single-page step machine | One /budgets/new route, React step state, no per-step URLs. | ✓        |
| Route-per-step           | URL per step; deep-linkable, more routing.                  |          |

### Partial answer persistence

| Option                                       | Description                                                                              | Selected |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Create budget row at step 1, PATCH per step  | Budget exists early as draft; onboarding_progress tracks step only. Matches spec schema. | ✓        |
| Widen onboarding_progress with jsonb payload | Store all answers server-side; budget created at finish. Schema deviation.               |          |
| localStorage draft, create at finish         | Answers in browser; not resumable across device/sign-out.                                |          |

### Progress indicator

| Option                          | Description                             | Selected |
| ------------------------------- | --------------------------------------- | -------- |
| Numbered stepper (1–5 segments) | Segmented stepper showing current/done. | ✓        |
| Plain 'Step 2 of 5' text        | Text counter only.                      |          |
| Progress bar                    | Filling bar; less precise.              |          |

### Resume entry

| Option                                   | Description                                                  | Selected |
| ---------------------------------------- | ------------------------------------------------------------ | -------- |
| Force-redirect into wizard at saved step | On login, incomplete onboarding → redirect to saved step.    | ✓        |
| Resume only on navigate to /budgets/new  | No forced redirect; wizard restores saved step when visited. |          |

---

## Danger zone & archive

### Archive effect

| Option                        | Description                                                    | Selected |
| ----------------------------- | -------------------------------------------------------------- | -------- |
| Hidden from home + switcher   | Set archived_at; budget disappears from home cards + switcher. | ✓        |
| Stays visible, dimmed + badge | Archived budget greyed on home with a badge.                   |          |

### Restore

| Option                          | Description                                      | Selected |
| ------------------------------- | ------------------------------------------------ | -------- |
| Restore from an 'Archived' list | Expandable Archived section with Restore action. |          |
| No restore UI in v1.1           | Archive one-way in UI; restore deferred.         | ✓        |

### Role gating

| Option                             | Description                                  | Selected |
| ---------------------------------- | -------------------------------------------- | -------- |
| Owner-only; members get Leave only | Archive + Delete render only for the owner.  | ✓        |
| Any member                         | Anyone can archive/delete. Risky for SHARED. |          |

### Last-owner protection

| Option                                      | Description                                                             | Selected |
| ------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Block Leave; tell them to Delete instead    | Last owner blocked from Leave; directed to Delete. No transfer in v1.1. | ✓        |
| Block Leave; auto-promote a member to owner | Auto-promote on last-owner leave. Adds logic not in spec.               |          |

---

## Members & share-link UX

### Generate share link

| Option                                  | Description                                     | Selected |
| --------------------------------------- | ----------------------------------------------- | -------- |
| One-click: generate → auto-copy + toast | Single button; URL auto-copied, toast confirms. |          |
| Generate → show URL field + Copy button | Link in a read-only field with a Copy button.   | ✓        |

### Link TTL

| Option                     | Description                                | Selected |
| -------------------------- | ------------------------------------------ | -------- |
| Fixed 7-day TTL, no picker | Links always expire in 7 days. No UI knob. | ✓        |
| TTL picker before generate | User picks 1d/7d/30d. More UI.             |          |

### Link display

| Option                                | Description                                                         | Selected |
| ------------------------------------- | ------------------------------------------------------------------- | -------- |
| Ephemeral — copied, not shown again   | Not re-displayed after reload; no links-list. SHRD-05 out of scope. | ✓        |
| Show last-generated link until reload | Link stays visible until page reload.                               |          |

**Notes:** Generate UX answer (URL field + Copy button) and Link display answer (ephemeral) reconciled in CONTEXT D-14: the generated URL is shown in a read-only field for the current session, but not persisted or re-displayed after reload, and there is no outstanding-links list.

### Revoke member

| Option               | Description                          | Selected |
| -------------------- | ------------------------------------ | -------- |
| Confirm dialog first | alert-dialog confirms before revoke. | ✓        |
| Instant + undo toast | Immediate revoke; toast offers Undo. |          |

---

## Claude's Discretion

- Default-open accordion section (suggest Budget identity).
- Stepper / progress visual treatment within DESIGN.md tokens; toast copy wording.
- Whether the stray `/onboarding` route is hard-deleted or redirected to `/budgets/new`.
- Members section empty-state / hidden behaviour for PRIVATE budgets.
- Field ordering inside the recurring-rule-form Sheet.

## Deferred Ideas

- Restore / un-archive budget UI — later phase.
- Outstanding share-links list with per-link revoke (SHRD-05) — not in Phase 6 scope.
- Transfer ownership — no transfer feature in v1.1.
- Share-link TTL picker — fixed 7-day TTL in v1.1.
