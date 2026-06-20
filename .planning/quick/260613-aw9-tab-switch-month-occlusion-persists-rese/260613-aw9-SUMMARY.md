---
quick: 260613-aw9
plan: 01
subsystem: shell-scroll-reset
tags:
  [
    ios,
    safari,
    browser,
    shell,
    scroll-reset,
    tab-switch,
    month-occlusion,
    window-scroll,
    tdd,
    SHELL-R18,
  ]
key-files:
  created:
    - apps/web/test/scroll-reset-on-mount.test.ts
  modified:
    - apps/web/src/components/common/scroll-reset-on-mount.tsx
    - apps/web/src/components/common/viewport-debug.tsx
    - apps/web/e2e/steps/bdp-shell-geometry.steps.ts
    - apps/web/e2e/features/bdp-tab-frame.feature
decisions:
  - "Reset ALL scroll roots (window + scrollingElement + main) idempotently in one rAF, keyed on pathname — not just main (the round-6 miss)"
  - "useLayoutEffect keyed on usePathname() beats Next scroll-restoration; rAF defers write past paint"
  - "E2E scrolls the RESERVES tab (12 rows, genuinely taller than 568px) not wallets (too short on a fresh user); window.scrollTo + assert window.scrollY moved; Vitest unit is the authoritative WebKit guard"
  - "SHELL-R18 overlay: winScrollY + scrollingElTop + monthNavUnderBand fields so device screenshot proves root + occlusion"
metrics:
  completed_date: "2026-06-13"
---

# Quick 260613-aw9: Tab-Switch Month Occlusion — Round 7 (SHELL-R18)

**One-liner:** Pathname-keyed `window.scrollTo(0,0)` + scrollingElement + main reset (useLayoutEffect + rAF) fixes browser-mode month-nav occlusion after wallets→spendings tab switch; SHELL-R18 overlay proves it; Vitest unit guards the window write round 6 lacked.

## Scroll-Root Truth Table (confirmed SHELL-R18)

| display-mode | element that holds scrollY                                                       | what round 6 reset                                     | what SHELL-R18 resets                                |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| browser      | window / html (document scroll) — body overflow:visible (global.css:468-491)     | main.scrollTop (overflow-y:visible → always 0 → no-op) | window.scrollTo(0,0) + se.scrollTop + main.scrollTop |
| standalone   | main[data-shell-scroll] (overflow-y:auto, layout.tsx:246) — body overflow:hidden | main.scrollTop ✓ worked                                | same + window (already 0 → no-op)                    |

## Why Round 6 Missed

1. **Wrong element reset:** `ScrollResetOnMount` (scroll-reset-on-mount.tsx round 6) reset only `main[data-shell-scroll].scrollTop`. In browser mode that element is `overflow-y:visible` (global.css:491) — its `scrollTop` is structurally always 0. The real scroll lives on `window` (html/body document scroll). Reset was a no-op on device.

2. **Tautological e2e:** The scroll step set `main.scrollTop = 300`; the assert step read `main.scrollTop`. Same non-scrolling element, so the reset always passed. Never reproduced the actual window scroll the device held. The month-nav-vs-band assert then ran against an already-at-top page (vacuously).

## The Fix

**`scroll-reset-on-mount.tsx`** — pathname-keyed `useLayoutEffect` + one `requestAnimationFrame`:

```typescript
useLayoutEffect(() => {
  const raf = requestAnimationFrame(() => {
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
    const se = document.scrollingElement as HTMLElement | null;
    if (se && se.scrollTop !== 0) se.scrollTop = 0;
    const main = document.querySelector<HTMLElement>("main[data-shell-scroll]");
    if (main && main.scrollTop !== 0) main.scrollTop = 0;
  });
  return () => cancelAnimationFrame(raf);
}, [pathname]);
```

All three writes are idempotent: no-op in standalone (window already 0, se already 0), no-op in browser for main (always 0).

## Vitest Unit Results

`apps/web/test/scroll-reset-on-mount.test.ts` — **4/4 passed**

| Test                   | What it proves                                                              |
| ---------------------- | --------------------------------------------------------------------------- |
| Test 1 (round-6 guard) | `window.scrollTo` called with (0,0) after rAF                               |
| Test 2                 | `main[data-shell-scroll].scrollTop` zeroed (standalone belt-and-suspenders) |
| Test 3                 | `document.scrollingElement.scrollTop` zeroed (html/body fallback)           |
| Test 4 (idempotent)    | No throw when no main present + window already at 0                         |

tsc: clean (0 errors).

## SHELL-R18 Overlay

New fields added to `viewport-debug.tsx`:

- `winScrollY` — `Math.round(window.scrollY)`
- `scrollingElTop` — `document.scrollingElement.scrollTop`
- `monthNavTop` / `bandBottom` / `monthNavUnderBand` — occlusion probe (`>0` = bug, `<=0` = fixed)

New overlay lines rendered:

```
winY 0 · seTop 0 · mainTop 0
navTop 142 · bandBot 128 · under -14
```

`under <= 0` = nav clears band = fixed. `under > 0` = still occluded.

## E2E Rewrite (de-tautologized) — Round 7 → Round 8

### Round 7 (commit 987f9cb) — correct direction, wrong tab

Round 7 de-tautologized the scroll/assert but scrolled the **wallets** tab.
A fresh user's wallets tab renders only the default Reserve/Cushion
sections — SHORTER than the shortest geometry viewport (320×568). So
`window.scrollTo(0, 300)` had nothing to scroll: `document.documentElement
.scrollHeight <= innerHeight` → `window.scrollY` stayed 0. The anti-tautology
guard (`win > 50 || main > 50`) then HARD-FAILED loud on all 4 viewports:

```
Error: page did not scroll — win=0, main=0 (both <= 50px);
       step cannot reproduce the device scenario
```

This is the guard working as designed (fails honest instead of false-pass)
— but it proved nothing because the precondition could never hold.

### Round 8 (commit 43777e6) — tall content via the reserves tab

The user's device repro is the **reserves** tab (many rows in the
screenshots). The reserves table renders one `ReservesTableRow` per
category. With the existing `12 seeded categories` Given, the reserves tab
is genuinely taller than every geometry viewport. Changes:

1. **Scenario** opens the reserves tab (not wallets) before scrolling —
   `When I open the reserves tab for "My E2E Budget"`.
2. **New precondition step** `the reserves tab content is taller than the
viewport` waits for `reserves-balance-*` rows to mount and asserts
   `scrollHeight − innerHeight > 80px` — proves real scroll room BEFORE
   scrolling, with exact heights in the failure message.
3. **Generic scroll step** `I scroll the page down on the current tab`
   scrolls `window` + `document.scrollingElement` (the REAL browser-mode
   root — `main[data-shell-scroll]` is `overflow:visible` and never scrolls,
   the round-6 mistake) to 60% of the real scroll extent (capped 300px),
   then asserts `win > 60 || se > 60`. `main` staying 0 is EXPECTED.
4. **Assert step** unchanged: `window.scrollY`, `scrollingElement.scrollTop`,
   `main.scrollTop` all `<= 1` after the switch; month-nav `boundingBox.top
   > = bandBottom`.

The scenario GENUINELY reproduces — no skip needed. Headless Chromium
page-scrolls in browser-mode emulation fine once the content is tall enough.

### Verified E2E numbers (geom-320/390/430/1280, base `https://budget-dev.madonzy.com`)

New scenario — green on ALL 4 viewports, real scroll proven per viewport:

| viewport | scrollHeight | innerHeight | scroll room | win after scroll | main         | month-nav vs band            |
| -------- | ------------ | ----------- | ----------- | ---------------- | ------------ | ---------------------------- |
| 320×568  | 1336         | 568         | 768         | 300              | 0 (expected) | navTop 127.5 ≥ bandBot 114 ✓ |
| 390×844  | (>844)       | 844         | tall        | >60              | 0 (expected) | 127.5 ≥ 114 ✓                |
| 430×932  | 1320         | 932         | 388         | 232              | 0 (expected) | 127.5 ≥ 114 ✓                |
| 1280×800 | 1176         | 800         | 376         | 225              | 0 (expected) | 127.5 ≥ 114 ✓                |

`win > 60, main = 0` on every viewport proves the window is the real
browser-mode scroll root and `ScrollResetOnMount` zeroes it after the switch.

Full `@tasks-geometry` sweep (6 scenarios × 4 viewports = 24):
**23 passed, 1 flaky** (`spendings grid last row clears the bottom bar`
geom-1280 — a transient `networkidle` timeout in `common-steps.ts:141`
during page nav, NOT geometry; the `retries: 1` re-run passed). Exit code 0.

### Carry-forward: commit 9d12a32 (do NOT revert)

Between round 7 and this round, `9d12a32` bumped two stale Vitest assertions
(R6-D, R7-I) from `SHELL-R17` to `SHELL-R18` (the overlay marker is R18; the
tests were still pinned to R17 → 2 failures). With that commit the full
Vitest suite is green. This round's e2e-only change preserves it.

Full Vitest suite (this round, post-9d12a32): **693 passed, 43 skipped,
0 failed** (79 files passed, 3 skipped) — confirms the e2e change introduced
no regression and the R18 marker bump holds.

## Deploy

- `docker compose build --no-cache web && make restart-web`
- SHELL-R18 confirmed in served bundle: `/app/apps/web/.next/static/chunks/app/[locale]/(app)/layout-c2c3135f12c3ff1e.js`

## Commits

| Hash      | Type               | Description                                                                                       |
| --------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `68ab261` | `test(260613-aw9)` | RED: failing unit proof — window.scrollTo(0,0) + scroll root tests                                |
| `557582e` | `fix(260613-aw9)`  | GREEN: reset window + scrollingElement + main on BDP tab switch                                   |
| `987f9cb` | `feat(260613-aw9)` | SHELL-R18 overlay + round-7 e2e rewrite (scrolled wallets — too short)                            |
| `9d12a32` | `test(260613-aw9)` | Bump stale R17 marker assertions (R6-D, R7-I) to R18 → Vitest 62/62 (carry-forward, NOT reverted) |
| `43777e6` | `test(260613-aw9)` | Round 8: reproduce on tall reserves tab; precondition + generic window-scroll step                |

## Device Checkpoint (pending)

User verifies on physical iPhone in iOS Safari browser mode at `https://budget-dev.madonzy.com?vpdbg=1`:

1. Overlay top line shows **SHELL-R18** (not R17 — stale cache otherwise)
2. Wallets/Reserves → scroll down → switch to Spendings: month-nav fully below pills band
3. Overlay after switch: `winY 0`, `seTop 0`, `under <= 0`
4. Regression: Spendings → Wallets page scrolls normally; header pinned; R16/R17 grid unchanged
5. PWA standalone: tab switch unchanged (no jump, month-nav correct)

## Deviations from Plan

None — plan executed exactly as specified.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- FOUND: apps/web/test/scroll-reset-on-mount.test.ts
- FOUND: apps/web/src/components/common/scroll-reset-on-mount.tsx
- FOUND: apps/web/src/components/common/viewport-debug.tsx
- FOUND: apps/web/e2e/steps/bdp-shell-geometry.steps.ts
- FOUND: apps/web/e2e/features/bdp-tab-frame.feature
- FOUND commit 68ab261 (RED test)
- FOUND commit 557582e (GREEN fix)
- FOUND commit 987f9cb (SHELL-R18 overlay + round-7 e2e)
- FOUND commit 9d12a32 (R17→R18 marker bump, carry-forward, NOT reverted)
- FOUND commit 43777e6 (round-8 tall-reserves e2e reproduction)
- SHELL-R18 verified in served bundle: /app/apps/web/.next/static/chunks/app/[locale]/(app)/layout-c2c3135f12c3ff1e.js
- Vitest unit (scroll-reset-on-mount.test.ts): 4/4 passed
- Vitest full suite: 693 passed / 43 skipped / 0 failed (post-9d12a32, this round)
- E2E @tasks-geometry sweep (4 viewports): 23 passed / 1 flaky (unrelated networkidle retry) / 0 failed
- New tab-switch scenario: green on geom-320/390/430/1280 with real window scroll proven (win > 60, main = 0)
- tsc: clean
