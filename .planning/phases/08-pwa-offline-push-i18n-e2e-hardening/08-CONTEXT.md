# Phase 8: PWA, Offline, Push, i18n & E2E Hardening - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Cross-cutting launch hardening for v1.1 — make the app installable, offline-capable, push-aware, fully localized, and E2E-green. Five concerns:

1. **PWA / offline** — Serwist offline shell over the new IA; IndexedDB cache; offline quick-entry queue with sync-on-reconnect (Idempotency-Key); graceful total-outage fallback.
2. **Web-push** — VAPID push wired to task creation, per-budget/per-kind prefs, deep-links to the Phase 7 URL contract.
3. **i18n** — EN/PL/UK message catalogs current for the renamed IA; Intl number/currency, Temporal + Intl date formatting; persisted, switchable locale.
4. **E2E** — audit + gap-fill the existing playwright-bdd suite for the v1.1 flows; add offline/push scenarios; verify green.
5. **CI gates** — tenant-leak + domain-coverage + Vitest + Playwright all green.

Scope is HOW to harden what's already built. New product capabilities (e.g. non-task notification triggers) are out of scope — see Deferred Ideas.

</domain>

<decisions>
## Implementation Decisions

### Offline behavior (PWA)

- **D-01 (cache scope):** Cache **all last-synced data** in IndexedDB (budgets, wallets, categories, transactions across all visited months) — not just current month. Budget data is small; favor offline reach.
- **D-02 (write-replay policy):** Offline-queued quick-entry replays **best-effort** on reconnect via `Idempotency-Key`. Entries that fail (archived category, validation, month rolled) collect in a **visible "sync issues" list** the user resolves manually. No silent data loss.
- **D-03 (sync visibility):** Queued txns show a **per-row "pending sync" marker** on their Spendings grid row **AND** a **global offline/queue badge** in the nav. User always knows what's unsynced.
- **D-04 (cold cache):** Opening an offline surface that was never synced shows an **explicit "unavailable offline"** empty-state with a retry — not a blank or skeleton.
- **D-05 (staleness marker):** Cached views shown while offline/reconnecting display a subtle **"last synced X ago"** marker so the user knows data age.
- **D-06 (eviction):** **Refresh-on-reconnect, no hard cap** — overwrite cached entities with fresh data whenever online; let cache grow. Wipe cache on **logout / tenant-switch** (cross-tenant cache isolation already tested — `apps/web/e2e/cross-tenant-cache.spec.ts`). Revisit a size cap only if it becomes a problem.

### PWA resilience / total-outage fallback (PWAX-01/02)

- **D-07 (no blank pages, no infinite redirects):** When backend/services are fully down OR there's no internet, the app must render a **graceful native-app-style fallback** — never a blank page and never an auth-redirect loop.
- **D-08 (logged-out-on-server-error):** If the user can't be authenticated because the server is unreachable, show a friendly **"you're signed out — can't sign in right now due to a server problem"** screen with a **manual Reload button** (the reload breaks any redirect loop). Generic "no internet / server issue" fallback states everywhere, worded nicely.

### Push notifications

- **D-09 (opt-in trigger):** Permission requested from **both** a Settings "Enable push" toggle **and** an onboarding-wizard step (each is a valid user gesture). Settings toggle is the durable control.
- **D-10 (granularity):** **Per-budget + per-kind** toggles (RESERVE_TOPUP / CONFIRM_DRAFT / CUSHION_BELOW_TARGET).
- **D-11 (extensible dispatch — IMPORTANT):** Build the notification prefs + dispatch as an **extensible notification-type registry**, NOT hardcoded to task creation. v1.1 ships only the 3 task-kind triggers, but the schema + prefs UI + dispatcher must accommodate **future non-task triggers (spendings-fill reminders, insights, etc.) with no migration**. Adding a new trigger type later = register it, not reshape the system.
- **D-12 (task kinds — corrected):** Only **3** task kinds exist — RESERVE_TOPUP, CONFIRM_DRAFT, CUSHION_BELOW_TARGET. Phase 7 dropped STALE_WALLET and MONTH_END_REVIEW. **REQUIREMENTS.md PWAX-05 text is stale** (still lists the dropped kinds) — wire the 3 real kinds; the ROADMAP success-criteria #2 is authoritative.
- **D-13 (deep-link landing — resolves D-PH7-31):** Clicking a push opens `/budgets/<id>/<tab>?task=<id>` (D-PH7-30, locked) and **auto-expands the task banner row only** — no scroll-to-surface.
- **D-14 (stale task):** If the deep-linked task was already resolved (handled on another device), **land on the tab silently** — resolved task simply isn't in the banner. No toast, no dead-end.
- **D-15 (payload privacy):** Push notification body is **generic — no financials** (e.g. "Reserve needs attention", "A draft needs confirming"). No amounts, no category names on lock screens. Real detail loads when the app opens via the deep-link.

### PWA install

- **D-16 (install entry points):** Do NOT gate on engagement. Capture `beforeinstallprompt`; on **mobile web** render a **visible top banner** with: an **Install button**, a **close (✕)**, and a **"Learn more"** link that opens a popup explaining install benefits. ALSO surface an **Install** entry in the **profile mini-menu** (the menu that appears when clicking the user-profile button). Banner is dismissible; profile-menu entry is persistent.

### i18n

- **D-17 (missing-key behavior):** **Both** — CI completeness gate fails the build on any missing EN/PL/UK key (enforces I18N-01 "delivered simultaneously"), AND runtime **falls back to EN** as a safety net if anything slips. No raw keys, no blanks.
- **D-18 (translation source):** **Keep existing PL/UK strings** where keys carry over from v1.0; translate only **new/renamed** keys. Preserves prior human edits, minimizes churn.
- **D-19 (new-key translation):** New/renamed PL/UK strings are **LLM-translated and flagged as machine-origin** for later human review. Keeps the 3-locale CI gate green at launch without blocking on a translator.
- **D-20 (first-visit locale):** Detect from **browser Accept-Language** → if it matches PL/UK use that, else default EN. This first-visit negotiation is the **only missing piece** — `apps/web/src/middleware.ts` currently bare-`/` → next-intl default `en` with no Accept-Language read; add the negotiation there.
  - **ALREADY BUILT (do NOT re-scope — verified 2026-06-10):**
    - Logged-out switcher: `apps/web/src/components/common/public-locale-switcher.tsx` (header, swaps URL locale).
    - Logged-in switcher: `apps/web/src/components/settings/locale-select.tsx` (Settings — **by-design, not a user-menu item**; the public switcher's own comment states logged-in users change locale only in Settings).
    - Persist `users.locale` (I18N-05): `PUT /settings/locale` at `apps/api/src/routes/settings.ts:36` writes the column; `users.locale` already exists (`text("locale").notNull().default("en")`).
    - URL/cookie sync: `budget-locale` cookie set on change + `apps/web/src/middleware.ts` redirects logged-in users to their account locale; `apps/api/src/middleware/i18n.ts` reads `session.user.locale`.
  - ROADMAP criterion #3 says "switchable from the **user menu**" — satisfied by the **Settings** switcher (deliberate placement). No new switcher UI in Phase 8.

### E2E (audit-and-fill, NOT a rewrite)

- **D-21 (approach correction):** The `.feature` suite is **already Gherkin and already new-IA** (reserves/home/nav-switcher/bdp-tab-frame/tasks built incrementally in Phases 3–7). Phase 8 E2E is **NOT a from-scratch rewrite**. It is: (a) **audit** existing coverage against the E2EX-03 scenario list (quick-entry txn, recurring-draft confirm, reserve auto-deduct, cushion-mode toggle, share-link join, onboarding wizard) and **fill gaps**; (b) add **new Phase-8 scenarios** for offline quick-entry replay and push opt-in/deep-link; (c) **verify green** against `PLAYWRIGHT_BASE_URL` from `.env.local`.
- **D-22 (raw .spec.ts disposition):** Leave infra/security raw Playwright specs (`cross-tenant-cache.spec.ts`, `server-down.spec.ts`) **as-is** — they test cross-cutting infra, not user flows; Gherkin adds little. Pragmatic exception to the "all E2E via Gherkin" rule.

### Claude's Discretion

- Exact IndexedDB library/approach (idb vs raw), Serwist runtime-caching route config, service-worker precache manifest details — planner/researcher decide.
- Exact ICU string copy for notifications and offline/error fallback screens.
- Whether the notification-type registry lives in the Notifications bounded context vs a shared dispatch table — planner decides, but it MUST be extensible per D-11.
- E2E scenario authoring details, fixtures reuse, server-test-clock usage — planner decides within the existing playwright-bdd structure.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 8 source-of-truth

- `.planning/ROADMAP.md` §"Phase 8: PWA, Offline, Push, i18n & E2E Hardening" — goal + 5 success criteria (authoritative over stale REQUIREMENTS text).
- `.planning/REQUIREMENTS.md` — PWAX-01..06, I18N-01..05, E2EX-01..05. ⚠ PWAX-05 task-kind list is STALE (see D-12); trust ROADMAP success-criteria #2.

### Push URL contract (from Phase 7 — LOCKED)

- `.planning/phases/07-tasks-queue/07-CONTEXT.md` §"Push deep-link URL contract" — **D-PH7-30** URL shape `/budgets/<id>/<tab>?task=<id>` per kind; **D-PH7-31** anchor behavior (resolved here as D-13: expand banner only). Also documents the dropped STALE_WALLET / MONTH_END_REVIEW kinds and the `task.created` outbox event Phase 8 consumes.

### UI authority

- `DESIGN.md` (repo root) — Binance dark canvas, single yellow accent, Inter + IBM Plex Sans. Install banner, offline/error fallback screens, sync markers, push prefs UI all follow it.

### Existing PWA/E2E assets (read during scout)

- `apps/web/sw.ts`, `apps/web/sw-offline.ts`, `apps/web/public/sw.js` — existing Serwist service worker + offline handling.
- `apps/web/test/sw-offline.test.ts` — offline SW test.
- `apps/web/e2e/cross-tenant-cache.spec.ts`, `apps/web/e2e/server-down.spec.ts` — raw infra specs (keep as-is, D-22).
- `apps/web/e2e/features/` — existing new-IA Gherkin features (reserves, home, nav-switcher, bdp-tab-frame, tasks) + `page-objects/`, `steps/`, `fixtures/`.
- `apps/web/messages/{en,pl,uk}.json` — message catalogs. ⚠ Scout flag: `workspaces`/`accounts` substrings still grep-hit in all three — researcher must confirm whether Phase 1's codemod left genuine stale namespaces (I18N-02 requires them gone) vs benign substring matches.
- `apps/web/next.config.mjs` — Serwist/next config.

### Project conventions

- `CLAUDE.md` — stack (Serwist for PWA, web-push + manual VAPID, next-intl, Temporal, Notifications bounded context = Resend + web-push + pg-boss worker), TDD-first rules.
- Memory: `feedback_e2e_gherkin` (all E2E via playwright-bdd .feature + Page Objects + fresh-user-per-scenario), `feedback_test_baseurl` (PLAYWRIGHT_BASE_URL from .env.local APP_URL), `feedback_design_md_authority`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Serwist SW** (`apps/web/sw.ts`, `sw-offline.ts`, `public/sw.js`): offline shell foundation already exists — extend, don't rebuild. PWAX-01 largely in place.
- **Idempotency-Key**: already the pattern for online transaction creates (`apps/web/src/...use-create-transaction` hook) — offline replay (D-02) reuses it.
- **playwright-bdd suite**: features + Page Objects + fresh-user fixture established — audit-and-fill, not rebuild (D-21).
- **Cross-tenant cache isolation test**: `cross-tenant-cache.spec.ts` already guards the wipe-on-tenant-switch requirement (D-06).
- **Notifications bounded context** (per CLAUDE.md: Resend + web-push + pg-boss worker): the home for the extensible push dispatcher (D-11).

### Established Patterns

- **i18n**: next-intl with `apps/web/messages/{en,pl,uk}.json` bundled at build time (rebuild `web` after edits — memory `feedback_always_rebuild_web`).
- **Hexagonal / ports & adapters**: web-push goes behind a port (CLAUDE.md "web-push + manual VAPID").
- **Task outbox**: Phase 7 emits `task.created`; Phase 8 push worker consumes it (the extensible registry should subscribe to outbox events, not be hardwired into task creation — supports D-11).

### Integration Points

- **Push ← tasks**: subscribe to Phase 7 `task.created` outbox event → dispatch via notification-type registry → web-push.
- **`users.locale`**: new/confirmed column for persisted locale (D-20, I18N-05).
- **Push prefs storage**: per-budget/per-kind prefs table — design for extra trigger types (D-11).
- **Offline queue ↔ Spendings grid**: per-row pending marker (D-03) wires into the existing grid row component.

</code_context>

<specifics>
## Specific Ideas

- **Install banner (D-16):** top banner on mobile — Install button + ✕ close + "Learn more" link → benefits popup. Plus a persistent "Install" item in the profile mini-menu.
- **Total-outage fallback (D-07/08):** "native app feeling" — explicit, friendly screens for no-internet and server-down; logged-out-on-server-error screen with a manual Reload button; never blank, never redirect-loop.
- **Generic push copy (D-15):** "Reserve needs attention" / "A draft needs confirming" — no figures.

</specifics>

<deferred>
## Deferred Ideas

- **Non-task notification triggers** — spendings-fill reminders, insights notifications, month-end nudges, etc. NOT built in v1.1, but the notification-type registry (D-11) must make them addable with no migration. Candidate for v1.2 Insights.
- **Per-kind push quiet-hours / batching / digest** — not in v1.1 scope; the prefs schema can grow into it later.
- **Cache size/age cap with LRU eviction** — deferred (D-06 chose no hard cap); revisit only if cache growth becomes a real problem.
- **Human translation review of LLM-generated PL/UK strings** — strings are flagged machine-origin (D-19) for a later human pass.

</deferred>

---

_Phase: 8-PWA, Offline, Push, i18n & E2E Hardening_
_Context gathered: 2026-06-10_
