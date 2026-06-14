---
phase: quick-260614-rwt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/hooks/use-create-transaction.ts
  - apps/web/test/offline-write-path.test.tsx
  - apps/web/sw.ts
  - apps/web/sw-offline.ts
  - apps/web/test/sw-offline.test.ts
  - apps/web/public/offline-shell.html
  - apps/web/src/components/common/offline-status-badge.tsx
  - apps/web/src/components/budgeting/top-nav.tsx
  - apps/web/src/app/[locale]/(app)/layout.tsx
  - apps/web/test/offline-status-badge.test.tsx
  - apps/web/test/offline-shell-wiring.test.ts
  - apps/web/messages/en.json
  - apps/web/messages/pl.json
  - apps/web/messages/uk.json
  - apps/web/src/components/settings/* (build-version footer — exact file TBD by executor grep)
autonomous: false
requirements:
  - RWT-1-bulletproof-write-timeout
  - RWT-2-appshell-offline-nav
  - RWT-3-header-offline-indicator
  - RWT-X-build-freshness

must_haves:
  truths:
    - "Adding an expense while offline rolls back the optimistic row and shows the offline toast within ~6s even when the POST never settles on iOS"
    - "When navigator.onLine is false the offline toast fires immediately (no 6s wait)"
    - "Offline navigation to a VISITED route renders the real page (header + chrome) from the cached navigation document"
    - "Offline navigation to an UNVISITED route renders the app-shell document (header chrome + inline no-data note), NOT a bare centered full-page takeover"
    - "On reconnect the shell/notice auto-reloads to the real route; Try again triggers a real working navigation"
    - "The header shows a small Offline pill/dot when offline and nothing when online, with zero added vertical height (no layout shift)"
    - "A build/version string is visible in the Settings footer so on-device freshness can be confirmed"
  artifacts:
    - path: "apps/web/src/hooks/use-create-transaction.ts"
      provides: "Bulletproof Promise.race write timeout + navigator.onLine fast-negative"
      contains: "Promise.race"
    - path: "apps/web/sw-offline.ts"
      provides: "NetworkFirst nav handler that writes successful nav docs to cache + serves precached app-shell on miss"
      contains: "cache"
    - path: "apps/web/public/offline-shell.html"
      provides: "Static precached app-shell document: header chrome + inline no-data note + self-recovery JS"
      contains: "Budget"
    - path: "apps/web/src/components/common/offline-status-badge.tsx"
      provides: "Inline header offline pill, zero-height"
    - path: "apps/web/sw.ts"
      provides: "Wires precache of offline-shell + cache-writing nav handler"
  key_links:
    - from: "use-create-transaction.ts mutationFn"
      to: "OfflineWriteError → onError rollback + toast"
      via: "Promise.race timeout + onLine fast-negative"
      pattern: "Promise\\.race|navigator\\.onLine"
    - from: "sw.ts navigation handler"
      to: "named nav cache (write) + precached offline-shell (miss fallback)"
      via: "handleNavigationRequest with cachePut + shell fallback"
      pattern: "offline-shell"
    - from: "TopNav header"
      to: "OfflineStatusBadge inline pill"
      via: "client child rendered in header cluster"
      pattern: "OfflineStatusBadge"
---

<objective>
Three device-confirmed offline refinements on top of the just-shipped robust-minimal
offline (260614-q1v). The installed iOS PWA is running q1v code.

1. Offline write is silent — optimistic row stays, no rollback, no toast — because
   `AbortSignal.timeout(8000)` does NOT abort a hung POST on iOS WebKit, so onError
   never fires. Make the write timeout bulletproof (manual Promise.race) + add an
   instant `navigator.onLine === false` fast-negative.
2. The full-page "You're offline" 503 takeover is the wrong model. Offline nav should
   render the REAL app shell (header + chrome): visited route → cached real document;
   unvisited route → a precached static app-shell doc (header + inline "wasn't
   preloaded" note), NOT a bare centered screen. Auto-recover + working Try again.
3. Move the offline indicator INTO the header (TopNav) as a tiny inline pill/dot with
   ZERO added vertical height — no banner, no layout shift.

Cross-cutting: confirm the q1v SW-update auto-reload island is mounted (it is), and add
a small build/version string in the Settings footer for on-device freshness confirmation.

Purpose: make offline write failures honest and instant, kill the jarring full-page
offline takeover, and surface connectivity unobtrusively in the chrome already present.
Output: bulletproof write path, app-shell offline nav, header indicator, version stamp —
all Vitest-guarded (NOT E2E, per project memory: SW offline is unreachable via
Playwright setOffline).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<interfaces>
<!-- Verified against current code (file:line). Executor uses these directly. -->

apps/web/src/hooks/use-create-transaction.ts (issue 1 — CURRENT, the bug):

- L83 `useCreateTransaction(budgetId, month)`, `t = useTranslations("grid.txn")`.
- L88-134 mutationFn: builds payload, then ONLY:
  res = await clientApiFetch(`/budgets/${budgetId}/transactions`, {
  method:"POST", headers:{...,"Idempotency-Key":key,"X-Budget-ID":budgetId},
  body, signal: AbortSignal.timeout(8000), // L120 — the unreliable abort
  });
  catch → throw new OfflineWriteError(); // L122-126
  if (res.status >= 500) throw OfflineWriteError; // L129
  if (!res.ok) throw new Error(await res.text()); // L131 (genuine 4xx)
- L164-177 onError: rolls back ctx.previous (L168), invalidates summary,
  toast.error(err instanceof OfflineWriteError ? t("write.offline") : t("write.failed")).
  **_ onError rollback is already CORRECT — the bug is onError never RUNS offline. _**
- L27-32 `class OfflineWriteError extends Error` (reuse, do not rename).

apps/web/src/lib/budget-fetch.ts (clientApiFetch):

- L18 `clientApiFetch(path, init={}): Promise<Response>` → `fetch(`/api${path}`, {...init, headers})`.
- It FORWARDS init.signal verbatim. It does NOT add its own timeout. Safe to race around.

apps/web/sw.ts (issue 2 — CURRENT):

- L42-46 cache name consts: STYLE_CACHE="static-styles-v2", SCRIPT_IMAGE_CACHE="static-assets-v2".
- L56-116 `new Serwist({ precacheEntries: self.__SW_MANIFEST, skipWaiting:true, clientsClaim:true, navigationPreload:true, runtimeCaching:[...] })`.
- L104-114 navigate matcher → handler calls:
  handleNavigationRequest(request,
  (req)=>fetch(req),
  (req)=>caches.match(req,{ignoreSearch:true}), // READ ONLY — never writes!
  (req)=>buildInlineOfflineNotice(req)) // bare centered 503
- L153-170 activate handler purges legacy static caches.
- L65-68 /api/\* NetworkOnly denylist (KEEP — tenant isolation, T-9). Do NOT cache /api.

apps/web/sw-offline.ts (issue 2 — pure, unit-tested):

- `handleNavigationRequest(request, fetchFn, matchCache, makeInlineNotice, timeoutMs=5000)`:
  AbortController+timeout; res.status<500 → return res; else/throw → matchCache; miss → makeInlineNotice.
  **_ It NEVER writes the successful response to a cache → matchCache almost always MISSES → bare 503. _**
- `buildInlineOfflineNotice(request)`: builds the centered full-page 503 (the takeover to REPLACE).
- SUPPORTED_LOCALES = ["en","pl","uk"]; localeFromPath helper.

apps/web/src/components/common/offline-status-badge.tsx (issue 3 — CURRENT):

- "use client". online → `<span data-testid="offline-status-badge" aria-hidden className="sr-only"/>`.
  offline → span with red animate-pulse dot, aria-label t("offline.badge.ariaLabel").
- Driven by window online/offline events + navigator.onLine seed. (Indicator only — never gates writes.)
- **_ Currently MOUNTED in layout BODY (layout L209), NOT in the header. Move into TopNav header cluster. _**

apps/web/src/components/budgeting/top-nav.tsx (issue 3 — async RSC):

- `export async function TopNav({locale, activeBudgetId})`.
- L46 root `<div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-8">`.
- L47-54 LEFT cluster: BrandMark + BudgetSwitcher. L55-65 RIGHT cluster: ProfileMenu.
- It is a SERVER component → OfflineStatusBadge ("use client") can be rendered as a child (client leaf in server tree — fine).

apps/web/src/app/[locale]/(app)/layout.tsx:

- L209 `<OfflineStatusBadge />` (move OUT of body into TopNav). L213 `<OfflineResilience />` (KEEP — mounts SwUpdateReloader).
- L218-223 header: `<header data-shell-header className="z-50 border-b ... pt-[env(safe-area-inset-top)] backdrop-blur"><TopNav .../></header>`.

apps/web/src/components/common/offline-resilience.tsx + sw-update-reloader.tsx (cross-cutting — VERIFIED MOUNTED):

- OfflineResilience renders <SwUpdateReloader/>; layout L213 mounts OfflineResilience. Island is live.
- SwUpdateReloader: controllerchange → reload once, hadController + sessionStorage("sw-reloaded-once") guards. WORKS. No change needed — just CONFIRM in T3 acceptance.

CSS tokens (apps/web/src/app/global.css — for the static shell + pill):
--canvas-dark:#0b0e11 --primary:#fcd535 (yellow brand) --hairline-dark:#2b3139
--body-on-dark≈#eaecef --muted≈#848e9c --destructive≈#ef4444. Brand wordmark: bold uppercase "BUDGET".

i18n (apps/web/messages/{en,pl,uk}.json) — VERIFIED EXISTING:
grid.txn.write.offline ✓ grid.txn.write.failed ✓
offline.badge.ariaLabel ✓ offline.unavailable.{heading,body,retry} ✓ (reusable for the in-app no-data note)

Serwist feasibility (verified via Serwist docs):

- precacheOptions.navigateFallback + a precached static HTML works for cache-miss navigation fallback.
- additionalPrecacheEntries / public/\* files land in the precache manifest; serve via serwist.matchPrecache / caches.match.
- A custom navigation handler CAN cache.put a successful nav Response (NetworkFirst write) for offline replay.
  </interfaces>
  </context>

<rsc_feasibility_verdict>
Next App Router RSC reality — what is and isn't feasible, decided:

VISITED routes (issue 2a): FEASIBLE and is the core bug fix. The current SW READS the nav
cache (`caches.match`) but NEVER WRITES to it, so the cache is empty and almost every offline
nav falls through to the bare 503. Fix = NetworkFirst-with-write: on a successful (2xx/3xx)
navigation, `cache.put(request, res.clone())` into a dedicated nav cache (e.g. "nav-docs-v1",
ignoreSearch on read). On later offline nav, `caches.match` returns the cached REAL document →
the real header + chrome render; row data fills from the IndexedDB read-cache (offline read
already works) or shows the in-app empty state. KEEP /api NetworkOnly (no /api caching).

UNVISITED routes / app-shell (issue 2b): a Next ROUTE cannot be reliably precached as a
self-contained offline document — RSC/HTML for a dynamic `force-dynamic` (app) route needs the
server, so precaching `/[locale]/offline-shell` as a working route is NOT dependable. VERDICT:
ship a HAND-AUTHORED STATIC HTML shell at `apps/web/public/offline-shell.html`, precached via
the build manifest. It renders the REAL header chrome (yellow uppercase BUDGET wordmark + the
top-bar frame, matching global.css tokens) plus an in-app "This page wasn't preloaded — it'll
load when you reconnect" note INSIDE that header layout. This guarantees the header is present
with zero RSC/server dependency. It REPLACES `buildInlineOfflineNotice`'s bare centered 503.

RECOVER (issue 2c): the shell carries the same self-recovery JS already proven in
buildInlineOfflineNotice — reload on `online` + `focus` + `visibilitychange→visible` (iOS), plus
a Try-again button doing `location.reload()`. The reload is network-first through the SW, so when
the origin is back it renders the real page. (Try again "didn't work" before because the cache
was empty AND the inline 503 was the only fallback; with nav-doc caching + a network-first reload
it now resolves to a real document.)
</rsc_feasibility_verdict>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bulletproof write timeout + navigator.onLine fast-negative (issue 1)</name>
  <files>apps/web/src/hooks/use-create-transaction.ts, apps/web/test/offline-write-path.test.tsx</files>
  <behavior>
    RED first — add to offline-write-path.test.tsx (clientApiFetch mocked, fake timers):
    - Test A (the device bug): setOnline(true); mockFetch returns a NEVER-settling promise
      (`new Promise(() => {})`); mutate(input); advance fake timers past the race window
      (~6000ms) → toast.error called with "grid.txn.write.offline" AND rows roll back to
      baseline (ctx.previous). MUST FAIL on current AbortSignal-only code (the hung fetch never
      rejects, AbortSignal.timeout doesn't fire under happy-dom fake timers → onError never runs).
    - Test B (fast-negative): setOnline(false); mutate(input) → toast.error("grid.txn.write.offline")
      fires WITHOUT advancing timers ~6s (assert it resolves well under the race window) AND
      clientApiFetch is NOT called (or, if you keep best-effort fetch, the toast does not wait on it).
      Decide: fast-negative should reject BEFORE issuing the POST → assert mockFetch NOT called.
    - KEEP all existing passing tests green: online happy path (no toast), network-reject rollback,
      AbortError rollback, 5xx → offline toast, genuine 4xx → grid.txn.write.failed (NOT offline).
  </behavior>
  <action>
    Make the POST timeout independent of AbortSignal (iOS WebKit does not abort a hung POST).
    In mutationFn (per RWT-1):
    1. FAST-NEGATIVE: at the very top of mutationFn, `if (navigator.onLine === false) throw new OfflineWriteError();`
       — onLine===false is RELIABLE on iOS (only the true value lies). Gives an instant toast.
    2. BULLETPROOF RACE: wrap the fetch in `Promise.race([fetchPromise, rejectAfter(6000)])`
       where rejectAfter returns `new Promise((_, reject) => setTimeout(() => reject(new OfflineWriteError()), ms))`.
       Clear the timer in a finally so a fast success/failure doesn't leak it. Keep
       `signal: AbortSignal.timeout(8000)` on the fetch too (best-effort real cancel), but the
       race — not the signal — is what GUARANTEES onError fires within ~6s.
    3. Catch around the race: a network throw, AbortError, OR the race-timeout OfflineWriteError
       all → `throw new OfflineWriteError()` (the existing catch already does this; ensure the
       race rejection lands in it, not unhandled). Keep res.status>=500 → OfflineWriteError and
       !res.ok → new Error (genuine 4xx) unchanged.
    Do NOT touch onError/onMutate/onSuccess/onSettled — onError rollback (ctx.previous) + toast is
    already correct (verified L164-177); the only bug is that it never ran offline.
    Add a code comment: timeout is 6000ms (race) < 8000ms (AbortSignal) so the race always wins first.
  </action>
  <verify>
    <automated>cd apps/web && bun run test -- offline-write-path 2>&1 | tail -25</automated>
  </verify>
  <done>Test A + Test B pass; all prior offline-write-path tests still green; onError fires within ~6s on a hung POST; navigator.onLine===false → instant OfflineWriteError before the POST.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: App-shell offline nav — cache nav docs + precached header shell, delete full-page takeover (issue 2)</name>
  <files>apps/web/public/offline-shell.html, apps/web/sw-offline.ts, apps/web/sw.ts, apps/web/test/sw-offline.test.ts</files>
  <behavior>
    RED first — rewrite/extend test/sw-offline.test.ts against the new contract:
    - "network ok → caches the nav document": fetchFn resolves 200 HTML; assert the response is
      returned AND a cachePut fake was called once with the request + a clone (NetworkFirst write).
    - "offline + VISITED route (cache hit) → returns cached real doc, header present": matchCache
      resolves the cached page; assert body contains the cached-page marker; shell fallback NOT called.
    - "offline + UNVISITED route (cache miss) → returns the APP-SHELL doc, NOT the bare full-page
      notice": matchCache miss; shell fallback resolves the precached offline-shell; assert the
      returned body CONTAINS the header chrome marker (e.g. data-testid="offline-shell-header" and
      the BUDGET wordmark) and does NOT contain the old bare-takeover marker
      (data-testid=offline-inline-notice). This asserts header-present + no full-page takeover.
    - "recover": assert the shell HTML contains the self-recovery JS (addEventListener('online'…,
      'focus', 'visibilitychange') and a Try-again button doing location.reload()).
    - "5xx → treated unreachable → cached doc when present" (keep), "auth redirect 3xx/4xx pass
      through unchanged" (keep — do NOT cache or shell-fallback redirects).
    Update offline-shell-wiring.test.ts to also assert the shell file is referenced/precached.
  </behavior>
  <action>
    Replace the bare full-page takeover with a real app-shell model (per RWT-2). Three parts:

    (a) public/offline-shell.html — hand-authored STATIC shell (no RSC). Render the REAL top bar:
        a header bar styled with the global.css tokens (background var fallbacks: #0b0e11 canvas,
        #2b3139 hairline border-bottom, bold uppercase yellow #fcd535 "BUDGET" wordmark on the
        left) at the SAME 64px height + 1280px max-width + 16px gutter as TopNav, then BELOW it an
        in-app note (NOT a centered full-viewport hero): heading + body using the EXISTING
        offline.unavailable.{heading,body} strings inlined per-locale (en/pl/uk; default en), and a
        Try-again button (offline.unavailable.retry) doing location.reload(). Mark the header
        `data-testid="offline-shell-header"` and the note container `data-testid="offline-shell-note"`.
        Port the self-recovery <script> from buildInlineOfflineNotice (online/focus/visibilitychange
        → location.reload()). The doc must NOT use the centered min-height:100vh full-page layout;
        header on top, note in the content area — so it reads as "the app, page not preloaded".
        (Static HTML cannot read the request locale; render a single doc with EN copy as the base
        and a small inline script that swaps to the locale from location.pathname's first segment
        if pl/uk — keep it tiny. If that is too fiddly, ship EN-only copy for the shell and note it;
        the per-route CACHED real doc covers localized visited routes.)

    (b) sw-offline.ts — change handleNavigationRequest to NetworkFirst-WITH-WRITE + shell fallback:
        - add a `cachePut(req, res)` param (injected, so unit-testable). On a successful nav
          (status < 400, i.e. real 2xx; do NOT cache 3xx redirects or errors), `cachePut(request,
          res.clone())` before returning res.
        - keep: status<500 → return res (pass redirects/4xx through, but only cache real 2xx).
        - on unreachable (throw / 5xx): matchCache(request) → return if hit (cached real doc).
        - on cache MISS: instead of buildInlineOfflineNotice, return the PRECACHED app-shell via a
          new injected `matchShell()` (resolves caches.match("/offline-shell.html") /
          serwist.matchPrecache). If the shell somehow misses too, fall back to a minimal
          Response.error()-style 503 (last resort only).
        - KEEP buildInlineOfflineNotice exported ONLY if still referenced; otherwise DELETE it and
          its tests (the bare full-page takeover is gone). Prefer deleting it to avoid dead code.

    (c) sw.ts — wire it:
        - Precache the shell: add "/offline-shell.html" to the precache (additionalPrecacheEntries
          via the @serwist/next config OR confirm public/* is globbed into __SW_MANIFEST; if not
          auto-globbed, add it explicitly). Verify it lands in public/sw.js manifest after build.
        - New nav cache const e.g. NAV_CACHE = "nav-docs-v1"; add to CURRENT caches set so the
          activate purge keeps it; bump if the strategy changes later.
        - navigate handler now passes: fetchFn, matchCache (caches.match ignoreSearch), cachePut
          ((req,res)=>caches.open(NAV_CACHE).then(c=>c.put(req,res))), matchShell
          (()=>caches.match("/offline-shell.html") || serwist.matchPrecache("/offline-shell.html")).
        - Do NOT cache /api (keep NetworkOnly denylist L65-68). Do NOT cache auth redirects.
        Keep skipWaiting + clientsClaim + navigationPreload.

  </action>
  <verify>
    <automated>cd apps/web && bun run test -- sw-offline offline-shell-wiring 2>&1 | tail -30</automated>
  </verify>
  <done>Visited route → cached real doc served (header present); unvisited route → precached app-shell with header chrome + in-app note (NOT the bare centered takeover); successful nav writes to nav cache; redirects/4xx pass through uncached; /api still NetworkOnly; shell carries working online/focus/visibility recovery + Try-again reload; buildInlineOfflineNotice full-page takeover removed.</done>
  </task>

<task type="auto" tdd="true">
  <name>Task 3: Header offline indicator (no height) + build-version footer; confirm SW-reloader (issue 3 + cross-cutting)</name>
  <files>apps/web/src/components/common/offline-status-badge.tsx, apps/web/src/components/budgeting/top-nav.tsx, apps/web/src/app/[locale]/(app)/layout.tsx, apps/web/test/offline-status-badge.test.tsx, apps/web/test/offline-shell-wiring.test.ts, apps/web/messages/en.json, apps/web/messages/pl.json, apps/web/messages/uk.json</files>
  <behavior>
    RED first:
    - offline-status-badge.test.tsx: keep "hidden when online" / "shows indicator when offline".
      Add structural no-height assertion: the OFFLINE render is an INLINE element (inline-flex,
      no block banner) — assert it has no `w-full`/`h-*` banner classes and renders a small pill
      or dot (e.g. contains an "Offline" label OR a dot ≤ ~0.75rem). Online render stays
      zero-footprint (sr-only / aria-hidden) so there is NO layout shift between states.
    - offline-shell-wiring.test.ts: change the OfflineStatusBadge mount assertion — it must now be
      imported & rendered in top-nav.tsx (the HEADER), not the layout body. Add an assertion that
      top-nav.tsx renders <OfflineStatusBadge. Keep OfflineResilience + InstallBanner mounted in
      the layout (confirm SwUpdateReloader island still wired — cross-cutting acceptance).
  </behavior>
  <action>
    (issue 3) Move + restyle the indicator into the header, zero extra height (per RWT-3):
    - top-nav.tsx: import OfflineStatusBadge ("use client" leaf — fine inside the server TopNav)
      and render it in the RIGHT cluster (L55 `<div className="flex items-center gap-3">`), before
      ProfileMenu, so it sits inline next to the profile. The h-16 header height is unchanged; the
      pill lives INSIDE the existing 64px bar.
    - offline-status-badge.tsx: redesign the OFFLINE state as a small, clearly-visible inline pill
      — a wifi-off-style dot + tiny "Offline" label (use offline.badge.label, fallback to the
      existing offline.badge.ariaLabel) — using inline-flex, items-center, small text, the
      --destructive token, rounded, low-padding; NO full-width banner, NO fixed height that adds
      rows. Online state stays sr-only/aria-hidden (zero footprint → no layout shift on toggle).
      Keep the window online/offline + navigator.onLine driving (indicator only — NEVER gates
      writes; the write fast-negative in T1 is separate).
    - layout.tsx: REMOVE the `<OfflineStatusBadge />` at L209 (now mounted in TopNav). Leave
      OfflineResilience (L213) and InstallBanner intact.
    - messages: add offline.badge.label = "Offline" (en) / "Offline" (pl) / "Офлайн" (uk) if a
      visible label is used; reuse existing keys otherwise.

    (cross-cutting) Build-freshness:
    - CONFIRM (no code change) SwUpdateReloader is mounted via OfflineResilience (layout L213,
      verified). Note it in the deploy checkpoint.
    - Add a tiny, muted build/version string in the Settings footer (per RWT-X). Grep for the
      settings page/footer (e.g. `apps/web/src/components/settings/*` or the settings route under
      `apps/web/src/app/[locale]/(app)/settings/`). Render small muted text (text-[11px]
      text-[var(--muted)] or muted-foreground) showing a build id — use
      `process.env.NEXT_PUBLIC_BUILD_ID` if defined, else `process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`
      short, else a literal build timestamp injected at build. If no build-id env exists, add
      `NEXT_PUBLIC_BUILD_ID` plumbing minimally (next.config define or a generated constant) — keep
      it SMALL; the goal is on-device freshness confirmation without a debug overlay. If wiring an
      env is heavier than ~10 lines, fall back to a static `process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"`
      and document that CI must set it; do not over-build.

  </action>
  <verify>
    <automated>cd apps/web && bun run test -- offline-status-badge offline-shell-wiring 2>&1 | tail -25</automated>
  </verify>
  <done>OfflineStatusBadge renders in the TopNav header right cluster; offline = small inline pill/dot, online = zero-footprint, no layout-height change between states; layout body no longer mounts the badge; OfflineResilience/SwUpdateReloader still mounted; a muted build/version string shows in the Settings footer.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Deploy, verify served bundle, device confirm</name>
  <what-built>
    Bulletproof offline write (race + onLine fast-negative → rollback + toast), app-shell offline
    nav (visited=cached real doc, unvisited=precached header shell + in-app note, working recover),
    header offline pill (no height), Settings build-version stamp. SW navigation strategy changed
    AGAIN → a one-time Clear-caches + unregister SW on device is required (the q1v auto-reload
    island will then carry future deploys automatically).
  </what-built>
  <how-to-verify>
    Claude FIRST (mechanical, before asking user — per project memory "verify yourself first"):
      1. `cd apps/web && bun run test` for the touched suites all green; root `make test` not
         required (carries known infra debt — verify with the correct runner).
      2. `tsc --noEmit` (or the project typecheck), `eslint`, and depcruise CLEAN on changed files.
      3. `make ci-gate` green (tenant-leak gate — SW /api denylist untouched).
      4. Rebuild + restart web: `docker compose build web && make restart-web`; if a change won't
         appear, `--no-cache` rebuild (memory: build cache ships stale images). Verify the SERVED
         bundle: `docker compose ps` shows web recently restarted + healthy, and grep the served
         public/sw.js for "/offline-shell.html" + "nav-docs-v1" to prove the new SW shipped.
      5. Confirm offline-shell.html is in the precache manifest inside the built sw.js.
    THEN ask the user to confirm on the installed iOS PWA (one-time, since SW nav changed):
      Settings → clear site data / unregister SW for budget-dev.madonzy.com, reopen the PWA once.
      a) Go offline (airplane mode). Add an expense → optimistic row should VANISH within ~6s with
         the "You're offline — can't add right now" toast (NOT stay until reload). With iOS knowing
         it's offline, the toast should be ~instant (fast-negative).
      b) Offline, reload a VISITED tab → the REAL page renders (header + tabs), data from cache or
         empty state — NO full-page "You're offline" takeover.
      c) Offline, navigate to a tab NOT visited this session → the app HEADER shows with an in-app
         "wasn't preloaded — reconnect" note (header present), NOT a bare centered screen. Tap Try
         again while still offline → stays on the note; go back online → it auto-reloads to the real
         page (and Try again now works).
      d) The header shows a small "Offline" pill while offline and nothing online, with NO content
         jump (no added row/height).
      e) Settings footer shows a build/version string (note it changed vs the prior build).
    Canonical URL: https://budget-dev.madonzy.com (cloudflare tunnel) — never localhost/tailscale
    (HTTPS needed for SW/push).
  </how-to-verify>
  <resume-signal>Type "approved" or describe what still misbehaves on device.</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/web && bun run test` — offline-write-path, sw-offline, offline-status-badge,
  offline-shell-wiring all green.
- tsc/typecheck + eslint + depcruise clean on changed files.
- `make ci-gate` green (SW /api NetworkOnly denylist intact — tenant isolation).
- Served public/sw.js contains "/offline-shell.html" and the nav cache name (proves new SW shipped).
- Device acceptance (Task 4) confirms write rollback+toast, app-shell offline nav, header pill, version stamp.
</verification>

<success_criteria>

- Offline add: optimistic row rolls back + offline toast within ~6s even when the POST hangs on iOS;
  instant toast when navigator.onLine===false.
- Offline nav: visited → real cached page (header+chrome); unvisited → precached app-shell with header
  - in-app no-data note (NOT a full-page takeover); auto-recover on reconnect; Try-again works.
- Header offline indicator: small inline pill, zero added vertical height, no layout shift; online hidden.
- SwUpdateReloader island confirmed mounted; Settings footer shows a build/version string.
- KEPT: online write happy path, offline READ (cached data + staleness), PWA install, SW auto-reload,
  skipWaiting+clientsClaim, /api NetworkOnly tenant isolation.
  </success_criteria>

<output>
After completion, create
`.planning/quick/260614-rwt-offline-polish-bulletproof-write-timeout/260614-rwt-SUMMARY.md`.
</output>
