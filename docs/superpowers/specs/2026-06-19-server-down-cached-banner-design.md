# Server-Down → Cached-Banner (unify with Offline UX)

**Date:** 2026-06-19
**Status:** Approved design — ready for implementation plan
**Phase:** 8 (PWA / offline / i18n hardening) — UAT Test 12 follow-up

## Problem

When the API container is unreachable (down / 5xx / timeout) the app currently
**redirects to a full-page `/server-down` card** (single "Try again" button). The
user wants this to behave like **offline**: keep showing the cached app with a
red banner stating the server is down and the data is cached, and go read-only —
the same UX as losing network.

Today the offline machinery (`OfflineStaleBar`, `OfflineReadOnly`,
`OfflineNavGuard`) keys off `navigator.onLine === false`. Server-down is
`navigator.onLine === true` but the API is unreachable, so none of it triggers;
instead `(app)/layout` catches `ServerUnavailableError` from `getServerSession()`
and redirects to `/server-down`.

## Decisions (locked)

- **Auth on cold reload:** when the API is down and the layout cannot verify the
  session, render the cached authenticated shell **if a session cookie is
  present** — trusting cookie presence (already checked by edge middleware) +
  row-level security on data. This is the **same trust model offline already
  uses** (offline shows cached authed data with no server re-verification). When
  the API returns, the next fetch re-verifies and refreshes.
- **Approach:** unified **`ConnectivityProvider`** as the single source of truth
  (online / offline / server-down). Offline banner + read-only consume it. Not a
  parallel set of components (avoids drift), not a fake-offline hack.

## Architecture

### New: `ConnectivityProvider` + `useConnectivity()`

`apps/web/src/components/common/connectivity-provider.tsx`

- State: `status: "online" | "offline" | "server-down"`.
  Derived: `degraded = status !== "online"`, `reason = status`.
- **Precedence:** `offline` (no network) outranks `server-down`. If
  `navigator.onLine === false`, show offline regardless of API state.
- Inputs:
  1. `navigator.onLine` + `online`/`offline` window events (logic moved here from
     `OfflineStaleBar`). Keep the pre-paint `html.is-offline` marker → no layout
     jump on offline hard reload.
  2. `initialServerDown` prop (seed) from `(app)/layout` for the cold-reload case.
  3. Subscription to `api-unreachable-bus` (below).
- **Enter server-down** only after a `/api/health` probe **confirms** the API is
  down (`AbortSignal.timeout`). A single failing request alone does NOT flip the
  state — guards against one-off endpoint errors / 4xx.
- **Recovery:** while `server-down`, poll `/api/health` every ~7s; on `200` →
  `status = "online"` and `queryClient.invalidateQueries()` (refetch fresh).
  Mirrors offline's `online`-event recovery.

### New: `api-unreachable-bus`

`apps/web/src/lib/api-unreachable-bus.ts`

Tiny framework-free pub/sub so the fetch layer (non-React) can notify the
provider without circular imports:
`reportApiUnreachable()`, `reportApiOk()`, `subscribe(listener)`.

### Changed: `clientApiFetch`

`apps/web/src/lib/budget-fetch.ts`

On a connection-refused / network `TypeError` / timeout / **5xx** → call
`reportApiUnreachable()`. On a `2xx` → `reportApiOk()`. **4xx is NOT a
server-down signal** (auth/validation — the API is up).

### Changed: `(app)/layout.tsx`

On caught `ServerUnavailableError`:

- If a Better-Auth session cookie is present (`__Secure-better-auth.session_token`
  or `better-auth.session_token`): set `serverDown = true`, **render the shell**
  (do not redirect). Use `budget-locale` cookie (`?? "en"`) for `LocaleCookieSync`
  since `session.user` is unavailable; skip the onboarding guard (its fetches are
  already try/caught). Pass `initialServerDown` into `ConnectivityProvider`.
- If no session cookie: keep today's behaviour (redirect to `/server-down`).

Wrap the shell subtree in `<ConnectivityProvider initialServerDown={serverDown}>`.

### Changed: `OfflineStaleBar`

Consume `useConnectivity()` (drop local `navigator.onLine` state). Render `null`
when `online`. Message branches on `reason`:

- `offline` → existing `offline.staleBar.*` strings.
- `server-down` → new `serverDown.banner.*`: "Server unavailable — showing cached
  data" (+ "updated {relativeTime}" suffix when `useCacheAge` is `synced`).
  Keep the fixed-height red bar + reserved slot.

### Changed: `OfflineReadOnly`

Block write controls when `degraded` (offline **or** server-down), not only
offline. Bottom toast wording per `reason` (offline vs "server is unavailable").

### Unchanged: `OfflineNavGuard`

Stays offline-only (forced hard-nav). During server-down the web server is up, so
in-app navigation soft-navs fine and the layout renders the degraded shell — no
hard-nav needed.

## Data flow

1. **Cold reload, API down:** layout catches → `serverDown=true` → provider starts
   `server-down` → banner + read-only; client tab shells hydrate from the
   persisted React Query cache.
2. **Mid-session, API drops:** a `clientApiFetch` fails (network/5xx/timeout) →
   `reportApiUnreachable()` → provider probes `/api/health` → fails → `server-down`.
3. **API returns:** health poll `200` → `online` + `invalidateQueries()` → banner
   clears, data refetches.
4. **Truly offline:** `navigator.onLine === false` → `offline` (precedence) →
   existing offline UX.

## Error handling / edge cases

- No false-positive on `4xx` or a single endpoint blip — health-probe must confirm.
- Offline precedence over server-down.
- No session cookie + API down → existing `/server-down` redirect path (unchanged).
- Anti-flap: confirmation required to enter; debounced recovery via the poll.

## Components & boundaries

| Unit                                 | Purpose                                 | Depends on                                               |
| ------------------------------------ | --------------------------------------- | -------------------------------------------------------- |
| `connectivity-provider.tsx`          | Own connectivity status + recovery      | navigator, api-unreachable-bus, queryClient, /api/health |
| `api-unreachable-bus.ts`             | Decouple fetch layer → provider         | none                                                     |
| `budget-fetch.ts` (`clientApiFetch`) | Report reachability                     | api-unreachable-bus                                      |
| `OfflineStaleBar`                    | Banner (offline + server-down wording)  | useConnectivity, useCacheAge                             |
| `OfflineReadOnly`                    | Block writes when degraded              | useConnectivity                                          |
| `(app)/layout.tsx`                   | Seed server-down, render degraded shell | getServerSession, cookies                                |

## Testing (TDD)

- **Vitest — provider state machine:** online↔offline↔server-down; offline
  precedence; health-probe required to enter; recovery on 200 + invalidate; 4xx
  does NOT trip server-down.
- **Vitest — `OfflineStaleBar`:** server-down wording vs offline wording vs null.
- **Vitest — `OfflineReadOnly`:** blocks writes when `server-down`.
- **Vitest — layout:** `ServerUnavailableError` + cookie → renders shell (no
  redirect); without cookie → redirect to `/server-down`.
- **i18n parity test** enforces the new `serverDown.banner.*` keys in en/pl/uk.
- **Live (controlled `docker compose stop api`):** cold reload → banner + cached +
  read-only; mid-session drop → banner; restart api → banner clears + refetch.

## Out of scope (YAGNI)

- No change to the logged-out / no-cookie path (keeps `/server-down` card).
- No change to `OfflineNavGuard`.
- No offline write-queue / replay (offline stays honest-rollback per prior design).
- No change to the `/server-down` route itself (still the SW nav fallback).
