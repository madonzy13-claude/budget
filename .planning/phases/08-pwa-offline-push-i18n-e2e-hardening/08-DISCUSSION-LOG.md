# Phase 8: PWA, Offline, Push, i18n & E2E Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.
>
> **⚠️ The offline decisions discussed here (write-replay/sync-issues, pending+badge
> indicator, staleness marker) were superseded 2026-06-16/17** — see the 08-CONTEXT.md
> banner. Current offline = persisted React Query cache + rollback-toast + OfflineStaleBar.

**Date:** 2026-06-10
**Phase:** 8-PWA, Offline, Push, i18n & E2E Hardening
**Areas discussed:** Offline behavior, Push notifications, i18n locale handling, Push payload privacy, Cache eviction/staleness, PWA install, E2E rewrite scope, PWA total-outage fallback

---

## Offline behavior — cache scope

| Option                    | Description                                  | Selected |
| ------------------------- | -------------------------------------------- | -------- |
| Current month only        | Smallest footprint, literal success-criteria |          |
| Current ± adjacent months | Smoother offline month-nav                   |          |
| All last-synced data      | Best reach, larger IndexedDB                 | ✓        |

**User's choice:** All last-synced data.

## Offline behavior — replay policy

| Option                          | Description                                                    | Selected |
| ------------------------------- | -------------------------------------------------------------- | -------- |
| Best-effort + surface failures  | Apply via Idempotency-Key, failures → visible sync-issues list | ✓        |
| Apply blindly, no conflict UI   | Simplest, failures only log                                    |          |
| Block sync, prompt per-conflict | Safest, most friction                                          |          |

**User's choice:** Best-effort + surface failures.

## Offline behavior — sync visibility

| Option                     | Description                            | Selected |
| -------------------------- | -------------------------------------- | -------- |
| Per-row + global indicator | Pending marker on grid row + nav badge | ✓        |
| Global indicator only      | Nav badge only                         |          |
| Silent until reconnect     | No affordance                          |          |

**User's choice:** Per-row + global indicator.

## Offline behavior — cold cache

| Option                         | Description                       | Selected |
| ------------------------------ | --------------------------------- | -------- |
| Explicit 'unavailable offline' | Clear offline empty-state + retry | ✓        |
| Last-known or blank skeleton   | Neutral skeleton, ambiguous       |          |

**User's choice:** Explicit 'unavailable offline'.

---

## Push notifications — opt-in trigger

| Option                      | Description             | Selected |
| --------------------------- | ----------------------- | -------- |
| Settings toggle only        | No surprise prompts     |          |
| Settings + contextual nudge | Toggle + one-time nudge |          |
| Onboarding step             | Ask during wizard       |          |

**User's choice:** Settings toggle **+** onboarding wizard step (combined).

## Push notifications — granularity

| Option                | Description             | Selected |
| --------------------- | ----------------------- | -------- |
| Per-budget on/off     | Simple, literal PWAX-04 |          |
| Per-budget + per-kind | Finer control           | ✓        |

**User's choice:** Per-budget + per-kind.
**Notes:** Do not limit to task-created events. There may also be reminders to fill spendings, insights, etc. Keep the system open for later modification — easy to add extra notification triggers without task creation (extensible notification-type registry). → CONTEXT D-11.

## Push notifications — deep-link landing (D-PH7-31)

| Option                     | Description                                | Selected |
| -------------------------- | ------------------------------------------ | -------- |
| Expand + scroll to surface | Auto-expand banner + scroll to surface     |          |
| Expand banner only         | Open tab, expand task in banner, no scroll | ✓        |

**User's choice:** Expand banner only.

## Push notifications — stale task

| Option                          | Description                                      | Selected |
| ------------------------------- | ------------------------------------------------ | -------- |
| Land + 'already resolved' toast | Graceful toast                                   |          |
| Land on tab silently            | Resolved task absent from banner, no explanation | ✓        |

**User's choice:** Land on tab silently.

---

## i18n — missing-key behavior

| Option                      | Description              | Selected |
| --------------------------- | ------------------------ | -------- |
| Fall back to EN             | Runtime EN fallback      |          |
| Fail CI on any gap          | Strict completeness gate |          |
| Both: EN fallback + CI gate | Belt and suspenders      | ✓        |

**User's choice:** Both — EN fallback + CI gate.

## i18n — translation source

| Option                             | Description                               | Selected |
| ---------------------------------- | ----------------------------------------- | -------- |
| LLM-translated, human-reviewable   | Generate all via LLM                      |          |
| Keep existing + translate new only | Reuse v1.0 strings, translate new/renamed | ✓        |
| Human-translated                   | Highest quality, slowest                  |          |

**User's choice:** Keep existing + translate new only.

## i18n — first-visit locale detection

| Option                       | Description                          | Selected |
| ---------------------------- | ------------------------------------ | -------- |
| Browser Accept-Language → EN | Detect, match PL/UK else EN, persist | ✓        |
| Always default EN            | Manual switch only                   |          |

**User's choice:** Browser Accept-Language → EN.

## i18n — new-key translation method

| Option                             | Description                        | Selected |
| ---------------------------------- | ---------------------------------- | -------- |
| LLM-translated, flagged for review | Machine-origin, human verify later | ✓        |
| Human-translated before merge      | Blocks merge on translator         |          |

**User's choice:** LLM-translated, flagged for review.

---

## Push payload privacy

| Option                      | Description                          | Selected |
| --------------------------- | ------------------------------------ | -------- |
| Generic, no financials      | No amounts/categories on lock screen | ✓        |
| Kind + category, no amounts | Category name, no figures            |          |
| Full detail                 | Amounts exposed                      |          |

**User's choice:** Generic, no financials.

---

## PWA install

| Option                        | Description                                   | Selected |
| ----------------------------- | --------------------------------------------- | -------- |
| Custom nudge after engagement | beforeinstallprompt after 2nd visit/first txn |          |
| Browser-native only           | No custom UI                                  |          |
| Onboarding step               | Offer during wizard                           |          |

**User's choice:** None of the above (free-text). Do NOT wait for engagement. On mobile visit, render a visible **top banner** with: Install button, ✕ close, and "Learn more" link → popup explaining benefits. ALSO add an Install entry to the profile mini-menu (appears on user-profile button click). → CONTEXT D-16.

---

## Cache eviction / staleness — staleness marker

| Option                     | Description                | Selected |
| -------------------------- | -------------------------- | -------- |
| 'Last synced X ago' marker | Per-view timestamp/banner  | ✓        |
| Offline badge only         | Global indicator covers it |          |

**User's choice:** 'Last synced X ago' marker.

## Cache eviction / staleness — eviction policy

| Option                            | Description                        | Selected |
| --------------------------------- | ---------------------------------- | -------- |
| Refresh-on-reconnect, no hard cap | Overwrite when online, let it grow | ✓        |
| Size/age cap with LRU eviction    | Robust for heavy users             |          |
| Clear on logout only              | Persist until logout/tenant-switch | (folded) |

**User's choice:** Refresh-on-reconnect, no hard cap. (CONTEXT also folds clear-on-logout/tenant-switch via existing cross-tenant isolation.)

---

## E2E rewrite scope

| Option                      | Description                          | Selected |
| --------------------------- | ------------------------------------ | -------- |
| Full rewrite against new IA | From-scratch features + Page Objects |          |
| Migrate-in-place            | Incremental update                   |          |

**User's choice:** Rejected the premise — "E2E already exist and with gherkin." Correct: `.feature` suite is already new-IA Gherkin (built Phases 3–7). Phase 8 E2E re-scoped to **audit existing coverage + fill E2EX-03 gaps + add offline/push scenarios + verify green**. Raw infra `.spec.ts` (cross-tenant-cache, server-down) stay as-is. → CONTEXT D-21, D-22.

---

## PWA total-outage fallback (raised by user during wrap-up)

**User's requirement (free-text):** Even when Docker is off / no services running, the user must see a normal info page. If the user is logged out, tell them they're logged out and can't sign in due to a server problem (add a Reload button for manual retry). A nice fallback for "no internet or server issue." No blank pages, no infinite redirects. Native-app feeling. → CONTEXT D-07, D-08.

---

## Claude's Discretion

- IndexedDB library/approach, Serwist runtime-caching config, precache manifest details.
- Exact ICU copy for notifications + offline/error fallback screens.
- Notification-type registry location (Notifications context vs shared dispatch table) — must be extensible per D-11.
- E2E scenario authoring, fixtures reuse, server-test-clock usage within existing playwright-bdd structure.

## Deferred Ideas

- Non-task notification triggers (spendings-fill reminders, insights, month-end nudges) — registry must support, not built in v1.1. Candidate v1.2 Insights.
- Per-kind quiet-hours / batching / digest.
- Cache size/age cap with LRU eviction — only if growth becomes a problem.
- Human review pass over LLM-generated PL/UK strings.
