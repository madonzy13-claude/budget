---
phase: 08-pwa-offline-push-i18n-e2e-hardening
plan: "04"
subsystem: i18n / PWA resilience
tags: [i18n, pwa, offline, manifest, resilience, accept-language]
dependency_graph:
  requires: [08-01]
  provides:
    [
      accept-language-negotiation,
      offline-fallback-screens,
      pwa-manifest-installable,
      staleness-marker,
    ]
  affects: [apps/web/src/middleware.ts, apps/web/public/manifest.json]
tech_stack:
  added:
    [
      negotiate-locale,
      format-date,
      StalenessMarker,
      OfflineFallback,
      ServerDownSignedOut,
    ]
  patterns:
    [
      Accept-Language allowlist validation,
      separate maskable/any icon entries,
      Intl.NumberFormat + Intl.DateTimeFormat audit,
    ]
key_files:
  created:
    - apps/web/src/lib/negotiate-locale.ts
    - apps/web/src/lib/format-date.ts
    - apps/web/src/components/common/offline-fallback.tsx
    - apps/web/src/components/common/staleness-marker.tsx
    - apps/web/public/icons/icon-192-any.png
    - apps/web/public/icons/icon-512-any.png
    - apps/web/public/icons/icon-192-maskable.png
    - apps/web/public/icons/icon-512-maskable.png
    - apps/web/test/middleware-accept-language.test.ts
    - apps/web/test/intl-format-audit.test.ts
    - apps/web/test/staleness-marker.test.tsx
    - apps/web/test/server-down-card.test.tsx
  modified:
    - apps/web/src/middleware.ts
    - apps/web/src/components/common/server-down-card.tsx
    - apps/web/public/manifest.json
decisions:
  - "Accept-Language negotiation only redirects for non-en locales to avoid a redirect loop on en first visits (next-intl already defaults to en)"
  - "PNG icons generated from stdlib struct+zlib (no imagemagick/canvas dep) — minimal but valid, serve PWAX-01 on-disk existence requirement"
  - "ServerDownSignedOut uses window.location.reload() not assign() — reload re-runs same URL so middleware/RSC re-check session; assign() would need a target"
  - "StalenessMarker renders sr-only span when hidden so aria-live region is pre-registered in the DOM"
metrics:
  duration: "~9 minutes"
  completed_date: "2026-06-10"
  tasks_completed: 3
  files_count: 13
---

# Phase 08 Plan 04: i18n Finalization + PWA Resilience Summary

> **⚠️ PARTIAL SUPERSEDE (2026-06-16/17, `tasks-redesign` SPA/SWR refactor).**
> i18n negotiation (Task 1), `ServerDownSignedOut` (D-07/D-08), and the manifest
> audit (Task 3) are **still current**. But the **`StalenessMarker`** built in Task 2
> was **deleted** — `staleness-marker.tsx` and its `getSyncMeta(budgetId)` IndexedDB
> source no longer exist; the offline cache-age indicator is now `OfflineStaleBar`
>
> - `useCacheAge` (reads React Query `dataUpdatedAt`, 3-state synced/never/unknown).
>   `OfflineFallback` (D-04 inline empty-state) still exists, but the primary
>   cold-cache / nav-miss UX is now `offline-shell.html` with a **Back** button
>   served by the SW. Self-check line "staleness-marker.tsx: EXISTS" is stale.
>   See **08-CONTEXT.md** banner + memory `project_offline_architecture`.

i18n Accept-Language first-visit negotiation, offline/server-down/auth-failed fallback screens, staleness marker, and PWA manifest installability audit with real maskable icons on disk.

## Tasks Completed

| #   | Name                                                           | Commit  | Key Files                                                        |
| --- | -------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| 1   | Accept-Language negotiation + Intl/Temporal format audit       | b35c62a | middleware.ts, negotiate-locale.ts, format-date.ts               |
| 2   | Offline + server-down + auth-failed screens + staleness marker | 5d51536 | offline-fallback.tsx, server-down-card.tsx, staleness-marker.tsx |
| 3   | PWA manifest installability audit                              | 15836ea | manifest.json, public/icons/\*.png                               |

## What Was Built

**Task 1 — Accept-Language negotiation (D-20 gap closed)**

- Extracted `negotiateLocale()` helper in `apps/web/src/lib/negotiate-locale.ts` that validates the Accept-Language header against the `["en","pl","uk"]` allowlist (T-08-04-01 threat mitigation)
- Middleware fires negotiation only when: no `budget-locale` cookie + no session + no locale prefix in URL path
- Only redirects for `pl`/`uk` — `en` falls through to next-intl default (avoids double redirect)
- Added `format-date.ts` with `formatBudgetDate()` / `formatBudgetDateTime()` using `Intl.DateTimeFormat` (I18N-04 audit)
- Confirmed `cents-format.ts` already uses `Intl.NumberFormat` (I18N-03 audit passed)

**Task 2 — Resilience screens**

- `OfflineFallback`: inline unavailable empty-state, `data-testid="offline-unavailable"`, WifiOff icon, retry button (D-04)
- `ServerDownSignedOut`: new export on `server-down-card.tsx`, single `window.location.reload()` button, zero `<a>` tags, `data-testid="server-down-card"` (D-07/D-08)
- `StalenessMarker`: reads `getSyncMeta(budgetId)` from IndexedDB, `useFormatter().relativeTime`, `aria-live="polite"`, visible when offline or within 30s of reconnect (D-05)

**Task 3 — Manifest installability**

- Split combined `"purpose": "any maskable"` (RESEARCH Pitfall 8) into separate `"any"` and `"maskable"` icon entries
- Generated 4 real PNG files (192/512 × any/maskable) using stdlib only — dark canvas `#181a20` + yellow `#fcd535` accent
- `theme_color: "#0b0e11"` (DESIGN.md canvas), `background_color: "#181a20"`, `display: "standalone"`
- Manifest check: `MANIFEST_OK`; all 4 icon files exist on disk

## Verification

- `bun run test -- middleware-accept-language intl-format-audit staleness-marker server-down-card` → **52 tests passed**
- `bun scripts/check-i18n-completeness.ts` → **I18N_GATE_PASS**
- Manifest verification script → **MANIFEST_OK**
- `grep -q "accept-language" apps/web/src/middleware.ts` → passes
- `grep -q "Intl.NumberFormat" apps/web/src/lib/cents-format.ts` → passes
- `grep -ci 'href="/login"\|redirect.*login' apps/web/src/components/common/server-down-card.tsx` → 0

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes

- `offline.html` was NOT updated: already fully localized with EN/PL/UK copy inline (including a `pickLocale()` function reading Accept-Language). The plan said "Update offline.html copy to the offline._ EN strings" — however the existing file already contained all three locale strings, a proper reload mechanism, and matched the `offline._` key text exactly. Updating would have been a no-op or regression. Documented here as a deliberate skip.

## Known Stubs

None. All components are wired to real data sources (getSyncMeta from IndexedDB, next-intl translations).

## Self-Check: PASSED

- negotiate-locale.ts: EXISTS
- format-date.ts: EXISTS
- offline-fallback.tsx: EXISTS
- staleness-marker.tsx: EXISTS
- server-down-card.tsx (ServerDownSignedOut): EXISTS
- manifest.json with separate maskable purpose: EXISTS
- 4 icon PNG files: EXISTS (icon-192-any.png, icon-512-any.png, icon-192-maskable.png, icon-512-maskable.png)
- Commits b35c62a, 5d51536, 15836ea: FOUND in git log
