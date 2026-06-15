# Offline-render investigation — 260615-e8s

Read-only. Branch `tasks-redesign`. App: `apps/web` (Next.js 16 App Router PWA, Serwist).

Confirms the hypothesis: the IndexedDB read cache is **never populated** for the
routes the user visits, because the only writer (`useBudgetData`) is **never
mounted**, and there is **no read-back path** even if it were. Symptom A and
Symptom B share this single root cause.

---

## Root cause

`cacheBudgetSnapshot()` — the sole function that writes budget/wallet/category/
transaction rows AND the `__global__` / per-budget `sync-meta` timestamps into
IndexedDB — is called from **exactly one place**: the `useBudgetData` hook
(`apps/web/src/hooks/use-budget-data.ts:111`). That hook is **defined but never
imported or mounted by any page, component, or test** — the only match for
`useBudgetData` in the entire `apps/web` tree is its own `export` at
`use-budget-data.ts:83`. The real routes render via RSC `initialData` +
per-entity hooks (`useWallets`, `useTransactions`, `spendings-grid-client`,
`bdp-tabs`), none of which touch the offline cache. Therefore the `budgets`/
`wallets`/`categories`/`transactions` IDB stores AND the `sync-meta` store stay
**permanently empty**. Nothing is ever dated → indicator shows "unknown" (B);
nothing is ever stored AND no query reads back from IDB → after a full offline
reload the pages have no data to render and fall through to the app-shell
"wasn't preloaded" note (A). The SW nav layer is wired correctly; the data
layer behind it is dead.

---

## SW nav handling

`apps/web/sw.ts` (the navigation matcher) delegates to the pure strategy in
`apps/web/sw-offline.ts` → `handleNavigationRequest()`. Strategy =
**network-first WITH WRITE** (correctly implemented):

`sw.ts` nav handler wiring:

```ts
{
  matcher: ({ request }) => request.mode === "navigate",
  handler: ({ request }) =>
    handleNavigationRequest(
      request,
      (req) => fetch(req),
      (req) => caches.match(req, { ignoreSearch: true }),   // matchCache  → NAV_CACHE
      (req, res) => caches.open(NAV_CACHE).then((c) => c.put(req, res)),
      () => caches.match(OFFLINE_SHELL_URL)
              .then((hit) => hit ?? serwist.matchPrecache(OFFLINE_SHELL_URL)), // matchShell
    ),
}
```

`sw-offline.ts` offline branch (when `unreachable` = thrown fetch or 5xx):

```ts
if (unreachable) {
  const cached = await matchCache(request); // HIT → real cached page (header+chrome)
  if (cached) return cached;
  const shell = await matchShell(); // MISS → /offline-shell.html app-shell
  if (shell) return shell;
  return new Response("<!doctype html>…Offline. Reconnect…", { status: 503 });
}
```

- Strategy: network-first; a successful **2xx** navigation is written to
  `NAV_CACHE = "nav-docs-v1"` (`sw.ts`), so a route's HTML document is cached
  **only after the first online visit to that exact route**. 3xx/4xx pass
  through uncached. Precache holds static assets + `offline-shell.html` (from
  `public/**`), **not** app-route documents.
- Offline + cache HIT → serves the real cached document (header + chrome). But
  the document's data rows are client-fetched/hydrated and there is no IDB
  read-back, so rows are empty on a cold reload.
- Offline + cache MISS → serves `/offline-shell.html` ("wasn't preloaded"
  shell) = **Symptom A** when the user hasn't previously online-visited that
  exact URL while this `nav-docs-v1` cache generation was live.
- `skipWaiting: true`, `clientsClaim: true`, `navigationPreload: true` — all
  present (`sw.ts`, Serwist constructor).

Note: the home/`/budgets/[id]` pages are RSC `dynamic = "force-dynamic"` server
components whose data comes from a server-side `fetchActiveBudgets()` /
upstream API fetch. Even on a nav-cache HIT, that server render cannot run
offline; the cached HTML is the last successful render's shell, and its
client islands have nothing in IDB to rehydrate from.

---

## IDB data write path (route → writes table)

`cacheBudgetSnapshot()` (`apps/web/src/hooks/use-cache-on-fetch.ts:29`) writes
each populated entity array via `setCachedEntities`, then — **only if at least
one entity was written AND `iso` present** — writes both sync-meta keys:

```ts
if (wrote && iso) {
  await setSyncMeta(budgetId, iso);
  await setSyncMeta("__global__", iso); // 260615-d76 global fallback key
}
```

Its single call site is `useBudgetData` (`use-budget-data.ts:99-121`, inside a
`useEffect` gated on all four queries succeeding).

`useBudgetData` mount audit (`grep -rn useBudgetData apps/web`): **one hit
only — the definition at `use-budget-data.ts:83`.** No page, component, or test
mounts it.

| Route (what the user visits)          | Mounts `useBudgetData`? | Writes IDB data? | Writes sync-meta (incl. `__global__`)? |
| ------------------------------------- | ----------------------- | ---------------- | -------------------------------------- |
| `/` (home / budget-list)              | No                      | **No**           | **No**                                 |
| `/budgets/[id]` (redirect → /wallets) | No                      | **No**           | **No**                                 |
| `/budgets/[id]/wallets`               | No                      | **No**           | **No**                                 |
| `/budgets/[id]/spendings`             | No                      | **No**           | **No**                                 |
| `/budgets/[id]/reserves`              | No                      | **No**           | **No**                                 |
| any other route                       | No                      | **No**           | **No**                                 |

Net: **no route triggers any IDB data write or any sync-meta write.** The
`budgets`/`wallets`/`categories`/`transactions`/`sync-meta` stores are always
empty in practice. (Auto-memory observation 12985, 2026-06-15 08:29, already
flagged: "useBudgetData hook defined but never called; offline cache never
populated.")

---

## RQ offline read-back

**None — there is no read-back path.** `offline-cache.ts` exports a reader
`getCachedBudget(budgetId)` (line 50), but `grep` shows it has **zero
consumers** anywhere in `apps/web/src`. There is no `getCachedEntities`/
`getAllCached` reader at all. No `useQuery` uses an IDB value as `initialData`,
`placeholderData`, a persister, or a `queryFn` fallback. All `initialData` in
the app comes from RSC props (server-rendered), never from IndexedDB
(`use-wallets.ts`, `use-transactions.ts`, `use-spendings-summary.ts`,
`spendings-grid-client.tsx`, `bdp-tabs.tsx`, etc.).

Consequence: in-memory React Query cache is the only data store, and it is lost
on a full reload. After a cold offline reload there is no mechanism to feed
cached rows back into the rendered queries — so even if the write path were
fixed, pages still could not render data offline until a read-back path is
added.

(There is also no React Query persister — no `persistQueryClient` /
`createSyncStoragePersister` anywhere.)

---

## Sync-meta / `__global__` guard (why cache-age is empty)

The indicator's fallback chain is correct and exhaustive
(`offline-status-badge.tsx:` resolveAge effect):

```ts
let iso = budgetId ? await getSyncMeta(budgetId) : null;
if (!iso) iso = await getSyncMeta("__global__");
if (!iso) iso = await getMostRecentSyncMeta();
setLastSyncedAt(iso ? new Date(iso) : null); // null → tooltipUnknown
```

All three readers query the `sync-meta` object store. But that store is **only
ever written inside `cacheBudgetSnapshot`'s `if (wrote && iso)` block** (above),
which never executes because `useBudgetData` never mounts. So `getSyncMeta`,
`getSyncMeta("__global__")`, and `getMostRecentSyncMeta()` all return `null`,
`lastSyncedAt` stays `null`, and the tooltip resolves to
`t("indicator.tooltipUnknown")` = **Symptom B**. The guard itself is not the
bug; the writer that would satisfy it is dead code.

---

## Indicator component facts

File: `apps/web/src/components/common/offline-status-badge.tsx`

- **Icon**: `import { CloudOff } from "lucide-react";` (line ~46). Rendered at
  the `<button>` body: `<CloudOff data-testid="offline-cloud-off"
className="h-4 w-4 shrink-0 animate-pulse" />` — already `CloudOff` + pulse;
  no swap needed for the icon.
- **Tooltip primitive**: Radix Tooltip, via
  `apps/web/src/components/ui/tooltip.tsx` (wraps `@radix-ui/react-tooltip`).
  The badge uses controlled `open`/`onOpenChange={setOpen}` plus an
  `onClick={() => setOpen((o) => !o)}` toggle on the trigger — the
  documented tap-toggle-vs-Radix-reopen race. Markup: online state returns an
  `sr-only` `<span data-testid="offline-status-badge" aria-hidden>` (zero
  header height); offline returns an `inline-flex h-6 shrink-0` pill.
- **Popover availability for swap**: **YES** — `apps/web/src/components/ui/
popover.tsx` exists and exports `Popover`, `PopoverTrigger`, `PopoverContent`,
  `PopoverAnchor` (wraps `@radix-ui/react-popover`). Radix Popover has native
  tap-to-open/close, so swapping Tooltip→Popover removes the manual
  `open`/`onClick` race entirely. Content classes already mirror tooltip
  (`side=bottom` supported via `data-[side=bottom]:slide-in-from-top-2`).
- **Cache-age text** computed at the `tooltipText` ternary:
  `lastSyncedAt !== null ? t("indicator.tooltip", { relativeTime:
fmt.relativeTime(lastSyncedAt, now) }) : t("indicator.tooltipUnknown")`.
- **i18n keys present in all three locales** (`offline.indicator.*`):
  - `en.json`: `tooltip`, `tooltipUnknown`, `ariaLabel` ✓
  - `pl.json`: `tooltip`, `tooltipUnknown`, `ariaLabel` ✓ (`_machineTranslated`)
  - `uk.json`: `tooltip`, `tooltipUnknown`, `ariaLabel` ✓ (`_machineTranslated`)

  Also present: `offline.badge.*` and `offline.unavailable.{heading,body,retry}`.

Mount: `<OfflineStatusBadge budgetId={activeBudgetId} />` in
`apps/web/src/components/budgeting/top-nav.tsx:64`.

---

## Precache / route list

Serwist config: `apps/web/next.config.mjs` — `withSerwistInit({ swSrc:
"sw.ts", swDest: "public/sw.js", disable: dev|DISABLE_SW })`. **No custom
`additionalPrecacheEntries` / `globPatterns`** → defaults: Serwist precaches
the Next.js build output (static `_next/**` assets) plus `public/**`
(which is how `/offline-shell.html` becomes precached/`matchPrecache`-able).
**App-route HTML documents are NOT precached.** A real route document only
enters the cache via the runtime `NAV_CACHE` write, and only after a successful
online visit to that exact URL under the current `nav-docs-v1` generation.
Bumping `NAV_CACHE` or `OFFLINE_SHELL_URL`'s precache hash invalidates prior
nav-cache entries.

---

## Minimal-change fix surface

Smallest set to make home + budget-list render cached page **and data**
instantly offline, **without** reintroducing an offline write-queue/replay
(read-only offline only):

1. **Mount the existing writer (fixes B + half of A).** Wire
   `useBudgetData({ budgetId, month })` (or a slimmer snapshot-writer) into the
   real visited routes so `cacheBudgetSnapshot` actually runs on each online
   visit. Cheapest landing spot: the client island that already holds the
   per-entity data on the budget pages (`spendings-grid-client.tsx` /
   `bdp-tabs.tsx`) and a home/budget-list client island for `/`. This alone
   makes `sync-meta` non-empty → indicator shows a real cache age (Symptom B
   fixed). NOTE: current `cacheBudgetSnapshot` keys data per `budgetId` and has
   no "active budgets list" store, so the home/budget-list page needs at least
   the `__global__` sync-meta write to date the indicator; rendering the home
   _list_ offline (see #3) needs a small budget-list cache too.

2. **Add a read-back path (fixes the data half of A).** Feed IDB into the
   rendered queries when the network value is absent — e.g. an async
   `initialData`/`placeholderData` (or a `queryFn` catch-fallback) in the
   per-entity hooks (`use-wallets.ts`, `use-transactions.ts`, the categories/
   budget queries in `use-budget-data.ts`, `use-spendings-summary.ts`) that
   reads `getCachedBudget` / new `getCachedEntities(store, budgetId)` from
   `offline-cache.ts`. Without this, cached rows can never reach the DOM after a
   cold reload. (Requires adding reader fns to `offline-cache.ts`; `getCachedBudget`
   already exists but is unused.)

3. **Home/budget-list offline render.** `/` is an RSC `force-dynamic` server
   page fetching `fetchActiveBudgets()` server-side — it cannot run offline and
   has no client data island. To render the budget _list_ offline, either (a)
   cache the active-budgets list in IDB on online visits (new tiny store +
   write in a home client island) and have `HomeCardsGrid` read it back when
   the server list is empty/unavailable, or (b) accept the app-shell fallback
   for `/` and only guarantee instant offline render for the budget _detail_
   tabs (where snapshot data already exists per `budgetId`). Option (b) is the
   smaller change.

4. **Indicator polish (optional, sibling cleanup, independent of A/B data
   fix).** Swap Radix Tooltip→Popover in `offline-status-badge.tsx` using the
   existing `ui/popover.tsx` to drop the manual `open`/`onClick` tap race; icon
   (`CloudOff`) and i18n keys already correct — no other change needed there.

Files in scope (no new write-queue): `use-budget-data.ts` (mount + reader
fallback), `use-cache-on-fetch.ts` (optionally a list-snapshot variant),
`offline-cache.ts` (add reader fns + optional budget-list store), the budget
client islands (`spendings-grid-client.tsx` / `bdp-tabs.tsx`) and a home client
island, and optionally `offline-status-badge.tsx` (Tooltip→Popover).
