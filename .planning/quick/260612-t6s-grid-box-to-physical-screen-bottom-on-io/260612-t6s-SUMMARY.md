---
quick: 260612-t6s
plan: 01
subsystem: shell-safe-area + spendings-grid
tags:
  [
    ios,
    safari,
    browser,
    shell,
    grid,
    lvh,
    screen-anchor,
    physical-bottom,
    tdd,
    SHELL-R17,
    tab-switch,
    scroll-reset,
  ]
requires: [quick-260612-kxd (SHELL-R16)]
provides:
  - "computeScreenExtension pure gate fn (iOS-browser-only box extension past lvh to physical screen bottom)"
  - "dynamic --grid-tail-spacer-h driven by the same extension (browser-only)"
  - "ScrollResetOnMount — BDP tab-switch residual-scroll fix (Safari browser-only, no-op in standalone)"
  - "SHELL-R17 overlay diagnostics (screenH / lvhPx / screenExt / spacerDynH)"
affects:
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/app/global.css
  - apps/web/src/components/common/viewport-debug.tsx
  - apps/web/src/components/common/scroll-reset-on-mount.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
key-files:
  created:
    - apps/web/src/lib/grid-screen-anchor.ts
    - apps/web/test/grid-screen-anchor.test.ts
    - apps/web/src/components/common/scroll-reset-on-mount.tsx
  modified:
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/app/global.css
    - apps/web/src/components/common/viewport-debug.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
    - apps/web/test/shell-safe-area.test.ts
    - apps/web/e2e/features/bdp-tab-frame.feature
    - apps/web/e2e/steps/bdp-shell-geometry.steps.ts
decisions:
  - "ADD extension to lvh calc (calc(100lvh - top + ext)) rather than replace with screenH-top — preserves R15 measured-top self-correction for every band above the grid."
  - "Hard gate: computeScreenExtension returns 0 unless isIOS && isCoarsePointer, then clamps [0,140]. Desktop/Android/Chromium/standalone are bit-identical to R16."
  - "Dynamic spacer var (env+96+ext) over static floor: a static 150 would fail the Chromium e2e gap<=128 ceiling. Dynamic keeps ext==0 -> env+96 in Chromium."
  - "Tab-switch scroll reset targets main[data-shell-scroll] (the single shared scroll container in BOTH modes). Reset-to-0 is idempotent, so harmless/no-op in PWA standalone; only fixes the Safari-browser month-occlusion."
commits:
  - 3ff4d82 feat(260612-t6s): SHELL-R17 pure screen-anchor gate fn + exhaustive unit matrix
  - 21763a9 feat(260612-t6s): SHELL-R17 wire screen-anchor + dynamic tail spacer into grid effect
  - 153171a fix(260612-t6s): reset shell scroll on BDP tab switch (Safari browser-only month occlusion)
metrics:
  vitest: "73 passed (shell-safe-area + grid-screen-anchor)"
  tsc: "clean (0 errors, full apps/web)"
---

# Quick 260612-t6s: Grid box to physical screen bottom on iOS Safari (SHELL-R17) Summary

Round 7 of the iOS shell saga. Closes the last proven gap: in iOS **Safari browser
mode** a bare black strip painted from the spendings grid box bottom (100lvh) down to
the physical screen bottom, because the inner-scroll grid box is capped at
`calc(100lvh - top)` so its bottom == lvh < screen. Fix: an iOS-browser-only clamped
extension `screenH - lvhPx` added to the box height + a dynamic tail spacer so the last
scrolled row still clears the visible viewport. Desktop / Android / standalone / Chromium
stay bit-identical to R16 by hard gate (extension == 0). Also fixes an added issue —
BDP tab-switch residual scroll that hid the month navigator under the pills band, a
Safari-browser-only bug made harmless in the user-approved PWA by an idempotent
reset-to-0.

## What shipped

### SHELL-R17 screen-anchor (the box)

- `apps/web/src/lib/grid-screen-anchor.ts` — pure `computeScreenExtension({screenH, lvhPx, isCoarsePointer, isIOS})`. Gate: 0 unless `isIOS && isCoarsePointer`; clamp `[0,140]`; `Number.isFinite` guard.
- `spendings-grid-client.tsx` `updateMaxH` (single existing effect, not a new one):
  - keyboard-editing freeze stays FIRST (early-return before any setProperty);
  - one-shot 100lvh probe (`probeLvhPx`) for deterministic `lvhPx`;
  - per-call iOS/coarse/portrait/screenH detection (orientation-safe);
  - `--grid-max-h: max(160px, calc(100lvh - ${top}px + ${ext}px))`;
  - dynamic `--grid-tail-spacer-h: calc(env(safe-area-inset-bottom,0px) + ${96+ext}px)`, written ONLY when `!isStandalone`;
  - `orientationchange` listener added + removed in cleanup.
- `global.css` browser block: `[data-grid-tail-spacer]` consumes `var(--grid-tail-spacer-h, calc(env(...)+96px))` — the 96 literal is now the fallback only. Standalone block untouched.
- `viewport-debug.tsx`: `BUILD_MARKER = "SHELL-R17"`; overlay reports `screenH / lvhPx / screenExt / spacerDynH` (imports the pure fn so the overlay shows the EXACT value the effect uses).

### Tab-switch scroll reset (added issue)

- `scroll-reset-on-mount.tsx` — `ScrollResetOnMount` zeroes `main[data-shell-scroll].scrollTop` on mount via one rAF. `main[data-shell-scroll]` is the single shared scroll container in BOTH browser and standalone (`overflow-y-auto`, layout.tsx:244). Reset-to-0 is idempotent → no-op/harmless in PWA standalone (the user confirmed the bug does not occur there), fixes the Safari-browser case where a scrolled wallets tab left the month navigator under the pills band and skewed `--grid-max-h`'s `rect.top` measurement.
- Wired into the spendings RSC page (the inner-scroll tab that must start at top).

## Tests

- `grid-screen-anchor.test.ts` — exhaustive gate matrix (iOS browser / iOS browser collapsed / iOS standalone / iOS clamp-hi / iOS negative / desktop / desktop-touch / Android / Chromium-ish / iPadOS desktop-UA) + boundaries (140 / 141 / 0). RED first (file/fn absent) → GREEN.
- `shell-safe-area.test.ts` Round 7 block (R7-A..I): import+call of `computeScreenExtension`; `+ext` term in the lvh calc; 100lvh probe present; browser-only spacer var; **keyboard freeze gates the WHOLE updateMaxH** (R7-E asserts `freezeIdx < setPropIdx` — positional, robust to comment distance); orientationchange listener; global.css var-with-fallback; standalone invariants frozen (JSX env+64, standalone @media block does not reference the spacer); BUILD_MARKER == SHELL-R17. Superseded R5-B (spacer literal → var form) and R6-D (marker R16 → R17); R5-C / R6-B / keyboard-freeze guards left intact.
- e2e `bdp-tab-frame.feature` + `bdp-shell-geometry.steps.ts`: `@tasks-geometry` scenario "switching from scrolled wallets to spendings resets page scroll and shows month nav" — scrolls `main[data-shell-scroll]` to 300, switches tab, asserts `scrollTop == 0` and `month-navigator-label` top >= band bottom (HARD assert on the real test-id, no soft-skip). Runs in browser-mode geom-320/390/430/1280 (Chromium; no engine emulates standalone, which stays Vitest-guarded).

**Vitest:** `shell-safe-area grid-screen-anchor --run` → **73 passed**.
**tsc:** `bunx tsc --noEmit` → **clean** (0 errors, full apps/web).

## Deviations from Plan

- **[Rule 1 - Bug] e2e month-nav assertion was a no-op.** The WIP step probed `[data-testid="month-nav"]` / `[data-spendings-month-nav]` (neither exists) and soft-returned when not found, so the geometry assertion never ran. Fixed to `getByTestId("month-navigator-label")` (the real id, month-navigator.tsx:105) with `waitFor` + hard `boundingBox` failure — the assertion now actually proves the fix. Folded into commit 153171a.

## Threat surface

No new threats beyond the plan's `<threat_model>`. T-t6s-01/02/03 mitigations are in place and unit-proven: hard gate (non-iOS → 0), `[0,140]` clamp + `Number.isFinite` guard (max blast radius 140px), standalone never writes the spacer var and extension clamps to 0.

## Deploy (DONE)

- `make build` (infisical-wrapped) → `budget-web:latest` rebuilt fresh (image created 42s before restart, NOT a cache no-op; `next build` re-ran on the changed `apps/web/src` layer). No `--no-cache` needed.
- `make restart-web` → `budget-web-1` recreated; `docker compose ps web` → **Up (healthy)**.
- **Served-bundle check (authoritative):** the running container's on-disk served chunk
  `/app/apps/web/.next/static/chunks/app/[locale]/(app)/layout-aa2d1fff47998d83.js`
  greps **1× SHELL-R17, 0× SHELL-R16**. (Same chunk hash as the built image → served == built.) Public CDN fetch of the parenthesized-route-group URL 404s on URL-encoding only; the device receives this exact on-disk chunk when it loads the authenticated (app) route.

## Live E2E (DONE) — `@tasks-geometry` against https://budget-dev.madonzy.com

`infisical run --env=dev -- PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx bddgen && bunx playwright test --grep @tasks-geometry --project=geom-320/390/430/1280`

**Result: 22 passed, 2 flaky (both recovered on retry #1), 0 failed. exit 0. (5.1m)** Log: `/tmp/t6s-e2e.log`.

- New **tab-switch** scenario "switching from scrolled wallets to spendings resets page scroll and shows month nav": PASS geom-320 / 390 / 430; geom-1280 failed once (33.5s tunnel-latency timeout) then **passed retry #1** (one retry allowed, used). Probe `month-nav-vs-band`: `monthNavTop 127.5 >= bandBottom 114` — navigator clears the band; `scrollTop == 0` asserted.
- **No regression in the gap<=128 ceiling:** `grid-clearance gap: 96` at every viewport.
- **Chromium ext==0 proof:** `grid-box-vv-at-rest-step maxHVar: "max(160px, calc(100lvh - 178px + 0px))"` — the `+ 0px` confirms `computeScreenExtension` gates to 0 on browser-non-iOS → box bit-identical to R16.
- **boxVvDelta == 0** at rest and after scroll (<= 4 ceiling holds) across all four viewports.

## Status

Steps 1-6 complete (code + tests + tsc + atomic commits + deploy + live e2e). Remaining: the **blocking device checkpoint** (iOS Safari browser red-strip-gone + last-row-clears-bar + keyboard freeze + PWA-standalone-unregressed) — unemulatable, requires the user on a physical iPhone via `?vpdbg=1` (overlay must read SHELL-R17, ext≈90 bar-shown, spacer≈136). This SUMMARY is intentionally left uncommitted per the task instruction.
