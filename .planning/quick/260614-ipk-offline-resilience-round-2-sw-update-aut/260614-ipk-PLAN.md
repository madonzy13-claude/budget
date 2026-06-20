---
quick_id: 260614-ipk
type: quick
mode: quick
title: Offline resilience round 2 — SW-update auto-reload + reconnect replay + offline.html recovery
autonomous: false
files_modified:
  - apps/web/src/components/common/sw-update-reloader.tsx
  - apps/web/test/sw-update-reloader.test.tsx
  - apps/web/src/hooks/use-online-sync.ts
  - apps/web/test/use-online-sync.test.ts
  - apps/web/src/app/[locale]/(app)/layout.tsx
  - apps/web/public/offline.html
  - apps/web/test/sw-offline.test.ts
must_haves:
  truths:
    - "An installed PWA running an OLD build auto-reloads ONCE when a new deploy's service worker takes control (no force-close needed) — except the very first install, which never reloads"
    - "The SW-update reloader never enters a reload loop (a single controllerchange yields exactly one reload)"
    - "Queued offline writes auto-replay when the user returns online OR returns to the app (visibilitychange→visible / window focus), not only on the navigator 'online' event"
    - "Replay reuses each item's stored idempotencyKey, so an online+focus double-trigger cannot double-write (server dedupes on Idempotency-Key)"
    - "The offline.html Try-again recovers when the origin is reachable even if the /api/health probe fails or aborts (it still attempts the real navigation), and re-probes on visibilitychange→visible / focus"
    - "safeNext() open-redirect sanitization is preserved"
  artifacts:
    - path: "apps/web/src/components/common/sw-update-reloader.tsx"
      provides: "Client island: controllerchange→reload-once with first-install + loop guards"
    - path: "apps/web/src/hooks/use-online-sync.ts"
      provides: "Reconnect replay on online + visibilitychange/focus, idempotent"
    - path: "apps/web/public/offline.html"
      provides: "Robust Try-again: navigate-on-origin-back + retries + reprobe on visibility/focus"
  key_links:
    - from: "apps/web/src/app/[locale]/(app)/layout.tsx"
      to: "SwUpdateReloader + useOnlineSync"
      via: "mounted in the (app) client island region near OfflineStatusBadge"
      pattern: "SwUpdateReloader|useOnlineSync"
---

<objective>
Phase 08 UAT test 4 ("offline write, then go back online → syncs automatically") still fails on device after the i5m write-fork fix. A live read-only investigation found 3 root causes — all verified against current code (file:line) during planning:

1. **Installed PWA never runs new deploys without a force-close.** No client-side SW-update handling exists: no `controllerchange` listener, no update reload, no `@serwist/window` registration. `apps/web/sw.ts:76-78` sets `skipWaiting + clientsClaim + navigationPreload`, so a new SW activates under the running document, but the open page keeps its already-parsed OLD JS until a navigation/reload/app-kill. RESULT: every deploy is invisible to installed users until force-close — which is _why_ the i5m fix "didn't take effect" on device, AND a real product bug for all installed users.

2. **Offline write queue never auto-replays on reconnect (dead hook).** `apps/web/src/hooks/use-online-sync.ts` is never mounted (grep: 0 usages outside its own file; its own docstring says "Mount this hook ONCE in the (app) layout client island"). So queued offline writes never drain when the network returns. It also only listens for `window "online"` (line 70), which iOS reports unreliably.

3. **Post-reconnect "Try again" screen stuck until app restart.** `apps/web/public/offline.html` retry (lines 247-279) does a one-shot `fetch('/api/health', 5s)` and only navigates on `res.ok`; otherwise `fail()` and stays put. Auto-recovery is only on the `online` event (line 294) — iOS-unreliable. One failed tap → stuck until app kill.

**Shared root cause:** issues 2 & 3 over-rely on `navigator.onLine` / the `online` event, which iOS reports unreliably. The cross-cutting hardening = re-probe reachability on `visibilitychange→visible` / `focus`, not only the `online` event.

Purpose: make deploys reach installed PWAs without a force-close, make offline writes drain automatically on reconnect, and make the offline screen self-recover — closing UAT test 4 robustly on iOS.
Output: a new SW-update reloader client island; a hardened `useOnlineSync` (mounted); a robust `offline.html`; updated/added Vitest coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<verified_facts>

- The i5m fix IS in the served bundle (timeout + fetch-failure fallback in use-create-transaction.ts:121-155, 2 chunks). Device "still the same" is NOT a stale Docker image — it's issue 1 (the OLD installed PWA never picked up the new build).
- `useOnlineSync` is NEVER mounted (grep: 0 usages outside its own file). `OfflineStatusBadge` IS mounted at apps/web/src/app/[locale]/(app)/layout.tsx:209. The (app) layout is a Server Component; OfflineStatusBadge/SyncIssuesList are "use client" leaf islands. Hooks can only mount inside a client component → mount the reloader + hook via a client component placed alongside them.
- `apps/web/sw.ts:76-78` sets skipWaiting+clientsClaim+navigationPreload (confirmed in public/sw.js). JS chunks are CacheFirst on content-hashed URLs (new build = new hash, no stale pin).
- `@serwist/next` is configured (next.config.mjs:10-14, swSrc sw.ts → public/sw.js). `@serwist/window` resolves transitively at workspace root node_modules (hoisted, importable) — but we are NOT using it; see the mechanism decision in Task 1.
- Replay idempotency: use-online-sync.ts:41 sends `"Idempotency-Key": item.idempotencyKey` (the SAME key stored at enqueue, use-create-transaction.ts:90/107-112). offline-queue.ts:24 documents the key is re-used verbatim on replay. Server dedupes on Idempotency-Key (T-08-03-02). So a double-trigger (online + focus) cannot double-write.
- offline.html is plain static HTML/JS (no bundler). Edit carefully, keep it dependency-free. It is served via sw-offline.ts buildOfflineDocument (precache HIT of /offline.html), which injects window.**OFFLINE_NEXT / window.**OFFLINE_LANG.
- offline behavior is Vitest-guaranteed, NOT E2E (project memory: setOffline+SW unreliable in Playwright; 3 offline E2E are @skip). All new tests here are Vitest.
  </verified_facts>

<interfaces>
From apps/web/src/lib/offline-queue.ts (replay contract — DO NOT change the idempotency behavior):
```typescript
export interface OfflineTxn {
  idempotencyKey: string;   // re-used verbatim on replay
  budgetId: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  failReason?: string;      // set on 4xx → moved to sync-issues
}
export async function getOfflineQueue(): Promise<OfflineTxn[]>;
export async function removeFromQueue(idempotencyKey: string): Promise<void>;
export async function markQueueItemFailed(idempotencyKey: string, reason: string): Promise<void>;
export const OFFLINE_QUEUE_CHANGED_EVENT = "offline-queue-changed";
```

Current useOnlineSync (apps/web/src/hooks/use-online-sync.ts) replay branches to PRESERVE exactly:

- 2xx → removeFromQueue + invalidate [transactions|spendings-summary|tasks pending]
- 4xx → markQueueItemFailed (sync-issue)
- 5xx / throw → leave in queue
- skips items where `item.failReason` is set
  Currently registers ONLY `window.addEventListener("online", replay)` (line 70). This task adds visibility/focus triggers + a re-entrancy guard.

offline.html retry internals to harden (apps/web/public/offline.html):

- `safeNext()` (229-245): same-origin absolute path only; rejects `//`, rejects `offline.html`. PRESERVE verbatim.
- `retry()` (247-279): one-shot fetch('/api/health', 5s AbortController); `res.ok` → location.assign(safeNext()); else fail().
- `fail()` (281-288): re-enables button, shows "still unreachable" copy.
- auto-recover: `window.addEventListener("online", retry)` (294) only.
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SW-update auto-reload client island (issue 1 — FIRST, it's what lets deploys reach the device)</name>
  <files>apps/web/src/components/common/sw-update-reloader.tsx, apps/web/test/sw-update-reloader.test.tsx</files>
  <behavior>
    Mechanism DECISION (justify in a file header comment): hand-rolled `navigator.serviceWorker` `controllerchange` listener — NOT `@serwist/window`. Rationale: `@serwist/next` already registers the SW; instantiating a second `@serwist/window` `Serwist` to listen for `controlling` risks double-registration and adds lifecycle surface. The only behavior needed is "reload once when the controller CHANGES after a prior controller existed" — a bare controllerchange listener + sessionStorage loop-guard is the minimal robust option and is trivially unit-testable with a mocked serviceWorker.

    Silent reload (NOT a toast) DECISION (justify in comment): app state is server/queue-backed (offline writes are persisted in IndexedDB via the offline queue; React Query refetches), so a reload-on-update loses no user data. A silent reload is acceptable and avoids leaving users on a stale build behind a dismissable prompt. (If a future in-edit form risk emerges, swap to a toast — note this in the comment.)

    Tests (write FIRST, must fail before impl exists):
    - Test 1 (UPDATE → reload once): mock `navigator.serviceWorker` with a non-null `controller` (a prior controller exists = this is an UPDATE, not first install) and a working `addEventListener`. Render <SwUpdateReloader/>. Dispatch a `controllerchange` event. Assert `window.location.reload` (mocked/spied) is called exactly once.
    - Test 2 (FIRST install → NO reload): mock `navigator.serviceWorker.controller === null` at mount. Render. Dispatch `controllerchange`. Assert reload is NOT called (first SW taking control of a never-controlled page = first install, not an update).
    - Test 3 (no loop): after a reload was already triggered in this tab (sessionStorage guard flag set), dispatch a second `controllerchange`; assert reload is NOT called again. Also assert that on mount, if the guard flag is already set (we just reloaded), the component does NOT reload again.
    - Test 4 (SSR / no serviceWorker): mock `navigator.serviceWorker === undefined`; render; assert no throw and reload not called.
    - Test 5 (cleanup): unmount removes the controllerchange listener (spy removeEventListener called with "controllerchange").

  </behavior>
  <action>
    Create `apps/web/src/components/common/sw-update-reloader.tsx` — a `"use client"` component that renders `null` and runs a single `useEffect`:
    - Guard: `if (typeof navigator === "undefined" || !navigator.serviceWorker) return;` (SSR / unsupported).
    - Capture `hadController = !!navigator.serviceWorker.controller` at effect setup time. A `controllerchange` is an UPDATE only when a controller already existed (or one exists by the time the event fires); the FIRST install fires controllerchange transitioning from null→SW, which must NOT reload.
    - Loop guard: use a sessionStorage key e.g. `"sw-reloaded-once"`. The reload handler: if the guard flag is already set → do nothing (we already reloaded this tab session). Otherwise set the flag and call `window.location.reload()`.
    - First-install guard: in the controllerchange handler, only reload when `hadController` was true (an existing controller was replaced). If `hadController` was false, treat the event as the first install and do NOT reload (but you MAY set hadController=true so a SUBSEQUENT update in the same session still reloads — decide and comment; the safest is: first controllerchange after a null controller = install → no reload, mark that a controller now exists; any later controllerchange = update → reload-once).
    - Register `navigator.serviceWorker.addEventListener("controllerchange", handler)`; return cleanup that removes it.
    - Header comment: document the controllerchange vs @serwist/window decision, the silent-reload-vs-toast decision, and the two guards (first-install + loop) with WHY.
    Do NOT mount it yet (Task 2 mounts it alongside useOnlineSync in the layout island, so both land in one client-island edit).
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- sw-update-reloader 2>&1 | tail -20</automated>
  </verify>
  <done>sw-update-reloader.test.tsx passes all 5 cases. Reloads exactly once on an UPDATE controllerchange, never on first install, never loops (sessionStorage guard), no-throw under SSR, cleanup removes the listener.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mount the islands + harden useOnlineSync with visibility/focus reprobe replay (issue 2)</name>
  <files>apps/web/src/hooks/use-online-sync.ts, apps/web/test/use-online-sync.test.ts, apps/web/src/app/[locale]/(app)/layout.tsx</files>
  <behavior>
    The existing use-online-sync.test.ts branch tests (200/422/503/throw, same-key) MUST keep passing — do not regress them.

    Add NEW failing tests (write FIRST):
    - Test A (visibilitychange replays): enqueue one item; render the hook; set `document.visibilityState` to "visible" and dispatch a `visibilitychange` event (NOT an `online` event). Mock fetch → 200. Assert the queue drains (replay fired from visibilitychange, not just online). This currently FAILS — the hook only listens for "online".
    - Test B (focus replays): same setup but dispatch a window `focus` event. Assert replay fires.
    - Test C (idempotent / no double-write on double-trigger): enqueue one item; mock fetch → 200 (resolves). Fire `online` AND `visibilitychange` in quick succession. Assert `clientApiFetch` is called with the SAME `Idempotency-Key` for that item and that the item is removed exactly once (queue length 0) — a re-entrancy guard must prevent two concurrent replay passes from both POSTing the same queued item. (Server dedupe is the backstop, but the client must not fire redundant in-flight POSTs.)
    - Test D (visibilitychange while hidden does nothing): set visibilityState "hidden", dispatch visibilitychange; assert replay does NOT fire (only visible triggers).

  </behavior>
  <action>
    Edit `apps/web/src/hooks/use-online-sync.ts`:
    - Keep the existing `replay()` body and all three branches (2xx/4xx/5xx-throw) and the `item.failReason` skip EXACTLY as-is (the idempotencyKey re-use at line 41 is the dedupe contract — do not touch it).
    - Add an in-flight re-entrancy guard so overlapping triggers don't run two concurrent replay passes over the same queue: a `useRef`-held boolean (or a module-scoped/closure flag) set true at the start of replay and cleared in a `finally`; if a trigger fires while a pass is in flight, skip (the in-flight pass already drains everything; the queue is re-read at the top of each pass so newly-enqueued items still get a subsequent pass). Document that this guard + the same-idempotencyKey + server dedupe together make online+focus double-trigger safe (no double-write).
    - Register THREE triggers, all calling the same guarded `replay`:
      1. `window.addEventListener("online", replay)` (existing).
      2. `document.addEventListener("visibilitychange", onVisible)` where `onVisible` runs replay only when `document.visibilityState === "visible"`.
      3. `window.addEventListener("focus", replay)`.
    - Return a cleanup that removes all three. Update the file header to note iOS `online` unreliability is why visibility/focus reprobe was added.
    Then mount the islands in `apps/web/src/app/[locale]/(app)/layout.tsx`:
    - The layout is a Server Component; `useOnlineSync` is a hook and must run in a client component. Create (or reuse) a tiny `"use client"` wrapper that calls `useOnlineSync()` and renders `<SwUpdateReloader/>` (from Task 1) — e.g. a `ClientResilience` island, OR add `useOnlineSync` to an existing client island. Simplest robust option: create `apps/web/src/components/common/offline-resilience.tsx` ("use client") that calls `useOnlineSync()` and returns `<SwUpdateReloader/>`. Mount it once in the layout right next to `<OfflineStatusBadge />` (layout.tsx:209). useOnlineSync needs a QueryClientProvider ancestor — confirm the (app) tree already has one (OfflineStatusBadge/React Query are already used app-wide); if not, mount inside the existing provider.
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- use-online-sync 2>&1 | tail -25</automated>
  </verify>
  <done>use-online-sync.test.ts: all existing branch tests still pass AND new tests A–D pass. Replay fires on online, visibilitychange→visible, and focus; never fires while hidden; double-trigger does not double-POST (re-entrancy guard) and reuses the stored idempotencyKey. OfflineResilience island mounted in the (app) layout (typecheck/build clean).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Robust offline.html Try-again — navigate-on-origin-back + retries + visibility/focus reprobe (issue 3)</name>
  <files>apps/web/public/offline.html, apps/web/test/sw-offline.test.ts</files>
  <behavior>
    offline.html is plain static HTML/JS (no bundler), so its retry logic cannot be imported directly. Extract the retry decision into a pure, testable function and unit-test THAT (mirroring the existing sw-offline.test.ts injected-fake pattern), then mirror the logic inline in offline.html. Keep offline.html dependency-free.

    Approach: add a small pure helper `decideOfflineRecovery({ probeFn, navigateFn, attempts })` — OR a `probeAndRecover` — to apps/web/sw-offline.ts (it already hosts pure, unit-tested offline logic) and call it from offline.html via an inline copy (offline.html cannot import). Tests go in sw-offline.test.ts with injected fakes:
    - Test 1 (probe OK → navigate): probeFn resolves ok → navigateFn called with safeNext target.
    - Test 2 (probe FAILS but origin is back → STILL navigate): probeFn rejects/aborts → after retries exhausted, the helper STILL calls navigateFn(safeNext()) (the real navigation goes network-first through the SW and renders the real page if the origin is reachable). This is the core fix: do NOT strictly gate recovery on a health 200.
    - Test 3 (retries with backoff): probeFn fails twice then succeeds → navigateFn eventually called; assert it retried (probeFn call count > 1) with short backoff.
    - Test 4 (safeNext sanitization preserved): a crafted `next` like `//evil.com` or `https://evil` → target falls back to `/<locale>` (no open redirect). Reuse/port the existing safeNext rules.

  </behavior>
  <action>
    Harden `apps/web/public/offline.html` retry logic (lines 247-294), keeping it dependency-free:
    - On a failed/aborted `/api/health` probe, do NOT just `fail()` and stay. Instead: attempt a couple of retries with short backoff (e.g. 2 extra tries, ~1s then ~2s), and if the probe still fails, STILL call `window.location.assign(safeNext())` anyway — the navigation goes network-first through the SW and will render the real page if the origin is back; only if THAT navigation also fails does the SW re-serve offline.html (one screen, no loop). The strict `res.ok` gate is the bug; relax it so a flaky/blocked health probe never strands the user when the site is actually reachable.
    - Keep `safeNext()` sanitization verbatim (same-origin absolute path only; reject `//` and `offline.html`). Do not open a redirect hole.
    - Add reprobe triggers beyond `online`: `document.addEventListener("visibilitychange", ...)` (only when `visibilityState === "visible"`) and `window.addEventListener("focus", ...)`, each calling `retry()`. iOS reports `online` unreliably — returning to the app must re-attempt recovery.
    - Guard `retry()` re-entrancy (the existing `retrying` flag already does this — preserve it so visibility+focus+online triple-trigger doesn't stack).
    - Mirror the pure decision (probe→retries→navigate-anyway) added to sw-offline.ts; keep the inline copy minimal and dependency-free. The pure helper in sw-offline.ts is what the tests cover.
    - Add the pure helper to `apps/web/sw-offline.ts` and the tests to `apps/web/test/sw-offline.test.ts` (existing buildOfflineDocument/handleNavigationRequest tests must keep passing).
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- sw-offline 2>&1 | tail -25</automated>
  </verify>
  <done>sw-offline.test.ts: existing tests pass AND new recovery tests (1–4) pass. offline.html: probe-fails-but-origin-back still navigates; retries with backoff; re-probes on visibilitychange→visible and focus; safeNext sanitization intact; retry() re-entrancy preserved; file stays dependency-free.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Deploy, verify served bundle, on-device UAT test 4</name>
  <what-built>
    SW-update auto-reloader (reload-once on update, not first install, no loop); useOnlineSync mounted + replaying on online/visibilitychange/focus (idempotent); robust offline.html Try-again (navigate-on-origin-back + retries + visibility/focus reprobe). All Vitest-guarded.
  </what-built>
  <how-to-verify>
    Claude does FIRST (mechanical, before asking you to tap anything):
    1. Run the full frontend suite green:
       `cd apps/web && bun run test 2>&1 | tail -15` — sw-update-reloader, use-online-sync, sw-offline all pass; no regressions in offline-write-path / offline-status-badge.
    2. Typecheck/build clean (catches the layout island mount): `cd apps/web && bun run build --webpack 2>&1 | tail -15` (or the project's build command).
    3. Rebuild + restart web so the new build is served:
       `make restart-web` (wraps infisical so DATABASE_URL_* etc. interpolate). Then `docker compose ps` shows web recently restarted + healthy.
    4. Verify the SERVED bundle carries the reloader (not a cache-hit stale image):
       grep the served `.next` / public assets for the controllerchange reloader marker and confirm `public/sw.js` still has skipWaiting/clientsClaim. If a change won't appear, `--no-cache` rebuild + re-verify the served bundle (memory: docker build cache can ship a stale identical image).

    CRITICAL device-reachability note (call this out to the user):
    - The OLD installed PWA on the device does NOT yet contain the reloader. So THIS deploy still will not auto-reload on the device — the user must FORCE-CLOSE the PWA ONCE to pick up the build that contains the reloader. From then on, future deploys auto-reload (controllerchange → reload-once) with no force-close.

    Then the user verifies on device (https://budget-dev.madonzy.com), AFTER one force-close:
    1. Reopen the installed PWA (now running the reloader build).
    2. Go offline (airplane mode / kill network). Add a transaction → it stays as a pending/unsent row (i5m fork).
    3. Go back online. Without force-closing: the pending row syncs automatically (replay on online/visibility/focus). Confirm the badge clears and the row becomes confirmed.
    4. If the offline/server-down "Try again" screen appears at any point: with the network back, tapping Try again (or just returning to the app) recovers to the real page — it does not get stuck.
    5. To validate the auto-update path itself (optional): trigger a trivial deploy and confirm the open PWA reloads on its own within a moment (no force-close), exactly once.

  </how-to-verify>
  <resume-signal>Type "approved" if test 4 syncs automatically and the offline screen self-recovers, or describe what still fails (with device + steps).</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/web && bun run test` green for: sw-update-reloader, use-online-sync, sw-offline; no regression in offline-write-path, offline-status-badge, @tasks-redesign suites.
- No regression to: online happy path, i5m write fallback (use-create-transaction), sync-issues 4xx path, server-down card (signed-out), existing offline E2E (@skip unchanged).
- Build/typecheck clean with the new (app) layout island mounted.
- Served web bundle (after make restart-web) contains the SW-update reloader; public/sw.js still has skipWaiting/clientsClaim.
</verification>

<success_criteria>

- Installed PWA on a build that contains the reloader auto-reloads ONCE when a newer deploy's SW takes control (not on first install, no loop).
- Offline writes auto-replay on reconnect via online OR visibilitychange→visible OR focus, idempotently (no double-write).
- offline.html Try-again recovers when the origin is back even if /api/health fails/aborts, retries with backoff, and re-probes on visibility/focus; safeNext sanitization intact.
- UAT test 4 passes on device after the one required force-close (to install the reloader build).
  </success_criteria>

<idempotency_safety>
Replay reuses each queue item's STORED `idempotencyKey` (use-online-sync.ts:41 → `item.idempotencyKey`, the same key stamped at enqueue in use-create-transaction.ts:90/107-112). The server dedupes on `Idempotency-Key` (T-08-03-02). Therefore an online+focus (or online+visibilitychange) double-trigger cannot double-write: (a) the new in-flight re-entrancy guard prevents two concurrent replay passes from both POSTing the same item, and (b) even if a stray duplicate POST escaped, the server returns the cached 2xx for the same key. The offline.html recovery is a navigation, not a write, so it carries no double-write risk.
</idempotency_safety>

<device_note>
After THIS deploy the OLD installed PWA still won't auto-reload — the reloader is not in the running build yet. The user must FORCE-CLOSE the PWA ONCE to load the build that contains the reloader. Every deploy after that auto-reloads (controllerchange → reload-once, no force-close). This is surfaced in Task 4's checkpoint and must be communicated to the user.
</device_note>

<output>
After completion, create `.planning/quick/260614-ipk-offline-resilience-round-2-sw-update-aut/260614-ipk-SUMMARY.md`
</output>
