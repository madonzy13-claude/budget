# Phase 7: Tasks Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 7-tasks-queue
**Areas discussed:** audit of current implementation, kind set re-scope, STALE_WALLET disposition, MONTH_END_REVIEW disposition, CUSHION_BELOW_TARGET design, cushion target configuration UX, two cushion flags wiring, CategorySlider cushion-mirror behavior

---

## Audit of current implementation

**Approach:** User asked Claude to review the codebase before discussing
gray areas, because the ROADMAP §Phase 7 wording felt stale.

**Findings (locked in CONTEXT.md domain section):**

- The `tasks` table, `TaskRepo.listPending` adapter, `GET
/budgets/:id/tasks?status=pending` route, `TaskBanner` UI, and i18n key
  namespace are the Phase 3 shell. They render zero rows in prod because
  nothing writes to the table.
- No generators exist in `apps/worker/src/handlers/`. No write methods on
  `TaskRepo`. No POST resolve/dismiss routes. No auto-resolve hooks. No
  per-kind i18n title/action labels.
- E2E `task-banner.feature` seeds a row via raw SQL to assert the disabled
  state.
- `STALE_WALLET` and `MONTH_END_REVIEW` are declared in the
  `tasks_kind_chk` enum but no row of either kind has ever been inserted.
- `cushion_enabled` master flag and `cushion_mode_enabled` display-mode
  flag both already exist on `tenancy.budgets`. Claude's initial scan
  missed the master flag and was corrected by the user.

**User's verdict:** "Phase 7 doc is stale; most of this was NOT
implemented. Re-scope before planning."

---

## Kind set re-scope (original 4 → final 3)

| Original kind (ROADMAP §Phase 7) | Final disposition                                            |
| -------------------------------- | ------------------------------------------------------------ |
| `RESERVE_TOPUP`                  | ✓ Retained                                                   |
| `CONFIRM_DRAFT`                  | ✓ Retained                                                   |
| `STALE_WALLET`                   | ✗ Dropped — user said "not needed"                           |
| `MONTH_END_REVIEW`               | ✗ Dropped — user said "user can always check previous month" |
| `CUSHION_BELOW_TARGET` (new)     | ✓ Added — user request                                       |

**User's choice:** Net 3 kinds. Schema migration drops both unused kinds
from `tasks_kind_chk` and adds `CUSHION_BELOW_TARGET`. Safe because zero
rows of any of the four original kinds were ever inserted in any
environment.

**Notes:** ROADMAP, v1.1-SPEC §9, REQUIREMENTS.md §Tasks Queue all need
wording reconciliation in plan-phase deliverables. PROJECT.md aspiration
list (overspent, cushion-well-above, missing-investment) remains as v1.2
backlog.

---

## STALE_WALLET (discontinued)

Claude proposed mechanics, threshold UX, and per-kind dedup index. User
response: "Stale wallet task isn't needed."

**User's choice:** Drop entirely.

**Notes:** Original ROADMAP SC #3 references the 30-day threshold; planner
must remove the SC line. No code exists to delete (kind never wired).

---

## MONTH_END_REVIEW (discontinued)

Claude proposed cron schedule, dedup index, three action-button behaviors,
and N-day auto-expiry.

**User's choice:** Drop entirely. Rationale: "User can always check
previous month."

**Notes:** Phase 4 D-PH4 month-nav arrow keys + URL `?month=YYYY-MM` is
the user's substitute path. Insights dashboard (v1.2) is the future real
review surface.

---

## CUSHION_BELOW_TARGET (new kind)

### Formula

| Option                                                                         | Description            | Selected |
| ------------------------------------------------------------------------------ | ---------------------- | -------- |
| Σ category cushion × expected months vs Σ cushion-type wallets (FX→budget ccy) | User-specified formula | ✓        |

**User's choice:** Exact formula above. Required = Σ category cushion ×
months_expected; Actual = Σ cushion-type wallet amounts (FX-converted).

### Default `cushion_target_months`

| Option   | Description               | Selected |
| -------- | ------------------------- | -------- |
| 3 months | Claude's first suggestion |          |
| 6 months | User's explicit override  | ✓        |

**User's choice:** 6 months.

### Where to configure

| Option                                        | Description                                         | Selected |
| --------------------------------------------- | --------------------------------------------------- | -------- |
| Settings only                                 | Hardcode at create, edit later                      |          |
| Settings + new wizard step                    | Dedicated onboarding step                           |          |
| Settings + same wizard step as cushion toggle | Field directly below master toggle in existing step | ✓        |

**User's choice:** "In wizard there should not be separate step, just field
below the cushion feature flag." Same model in Settings.

### Cushion mode toggle vs. task lifecycle

| Option                                     | Description | Selected |
| ------------------------------------------ | ----------- | -------- |
| Display-mode toggle off resolves task      | Coupled     |          |
| Display-mode toggle has no effect on tasks | Decoupled   | ✓        |

**User's choice:** "Turning off cushion mode doesn't resolve task. Task
disappears if cushion feature is disabled or wallets has more or equal
than needed."

**Notes:** User clarified that two flags exist already in code:
`cushion_enabled` (master) and `cushion_mode_enabled` (display-mode). Only
the master gates task lifecycle. Display mode is independent.

### FX

| Option                                                 | Description                       | Selected |
| ------------------------------------------------------ | --------------------------------- | -------- |
| Convert cushion wallets to budget ccy via `FxProvider` | Reuse recurring-engine-fx pattern | ✓        |
| Restrict cushion wallets to budget ccy                 | Would simplify math               |          |

**User's choice:** FX conversion. (Cushion wallets are free-currency per
Phase 5 D-PH5-W12 — this constraint stays.)

### Negative cushion

| Option                         | Description                 | Selected |
| ------------------------------ | --------------------------- | -------- |
| Special-case logic             | Edge handler needed         |          |
| Impossible by domain invariant | `cushion_amount_cents >= 0` | ✓        |

**User's choice:** "Negative cushion isn't possible." No edge handling.

---

## CategorySlider cushion-mirror behavior

User requested: "if category cushion amount isn't set yet or is equal to
category amount — when changing category amount — change cushion category
amount in frontend in realtime."

### Mirror behavior

**Implementation:** Initialize `linked = (cushion == null || cushion ===
planned)`. On planned change: if linked, mirror to cushion. On cushion
change: silently break link.

### Link-icon UI affordance

| Option                                           | Description                                  | Selected |
| ------------------------------------------------ | -------------------------------------------- | -------- |
| Chain icon + broken-chain icon + click-to-relink | Explicit visual indicator                    |          |
| Silent, no icon                                  | Mirror invisibly; relink on next slider open | ✓        |

**User's choice:** "No need for separate link icon for cushion amount."
Silent behavior only.

---

## Claude's Discretion

- Default `cushion_target_months` value in schema (locked at 6 per
  D-PH7-15).
- Whether deep-link URL uses `?task=<id>` query param or `#task=<id>` hash
  fragment (D-PH7-30 picked query; planner may switch).
- Exact i18n string copy for the three task kinds — ICU placeholder
  field-list is fixed; wording at planner discretion.
- Whether `recompute-cushion-task.ts` is one function or a small module of
  helpers — call-site shape is what matters.
- Hourly defensive sweep hosting: existing `budgeting-reconciliation.ts`
  handler vs. a new handler. Existing handler preferred unless dep-cruiser
  objects.
- E2E `task-banner.feature` final scenario list (rewrite required;
  scenarios at planner discretion).

---

## Deferred Ideas

- `STALE_WALLET` reminder generator → revisit in v1.2 if needed.
- `MONTH_END_REVIEW` ritual nudge → revisit when Insights dashboard ships.
- Dismiss / snooze banner controls → not in v1.1.
- VAPID push dispatcher + per-user prefs → Phase 8.
- `STALE_WALLET` configurable threshold UI in Settings → moot.
- Banner kind-priority sort → ASC `created_at` is sufficient.
- Inline mini-modal for RESERVE_TOPUP / CUSHION_BELOW_TARGET → deep-links
  chosen instead.
- Banner row × dismiss control → out of scope per D-PH7-27.
- Category-overspent, cushion-well-above-target, missing-investment
  tasks → PROJECT.md aspiration list, v1.2.
