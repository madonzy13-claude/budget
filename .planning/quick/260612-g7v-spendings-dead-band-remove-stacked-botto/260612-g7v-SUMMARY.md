---
phase: quick-260612-g7v
plan: 01
subsystem: shell-safe-area
tags: [ios, pwa, shell, spendings-grid, viewport, dead-band, geometry-e2e]
requires:
  - quick-260612-e82 (SHELL-R13 ResizeObserver --grid-max-h architecture)
provides:
  - SHELL-R15 box-under-bar architecture (measured top + 100lvh bottom anchor; in-flow tail spacer is the ONLY clearance source — browser floor env+96px, standalone env+64px)
  - data-no-page-clearance per-tab opt-out from page-level bottom clearance
  - bounded geometry e2e (box shortfall to vv bottom <= 4px at rest + after scroll, box may extend below; last-row gap in [8,128])
affects:
  - any future tab that owns its own inner scroller (must add data-no-page-clearance)
key-files:
  modified:
    - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
    - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
    - apps/web/src/app/global.css
    - apps/web/src/components/common/viewport-debug.tsx
    - apps/web/test/shell-safe-area.test.ts
    - apps/web/e2e/features/bdp-tab-frame.feature
    - apps/web/e2e/steps/bdp-shell-geometry.steps.ts
decisions:
  - "R15: box bottom anchors to 100lvh (not visualViewport.height px) — vv-height clips at the Safari bar's top edge leaving a black under-bar zone; lvh extends the box under the translucent bar so content paints beneath it like native page scroll; standalone/Chromium unchanged (lvh == screen/vvh)"
  - "R15: tail-spacer height is display-mode-scoped — browser env+96px (global.css unlayered override; bar ~50px + indicator zone, env≈0 with bar shown), standalone keeps user-approved env+64px JSX fallback (R5-C guard forbids overriding it)"
  - "Grid box consumes --grid-max-h as FIXED height (h-[var(--grid-max-h)]), not max-h: with max-h the box stops short of the vv bottom whenever content < available space — the dead band reappears with short content"
  - "All bottom clearance lives in the in-flow tail spacer inside the scroller (iOS honors in-flow blocks, ignores container end-of-scroll padding — SHELL-R8..R10); content sliding under the translucent bar mid-scroll is native + desired"
  - "Per-tab opt-out via [data-no-page-clearance] + global.css :has() — pb-shell-safe stays on the BDP wrapper for page-scrolling tabs, the inner attr zeroes it only for the spendings subtree"
  - "Geometry probes select [role=row]: seeded ledger rows render as draft-row-* divs in To-confirm, so button/li/a and txn-row- selectors measured the sticky header band instead of the last row"
metrics:
  duration: "~4h (11:46Z first commit -> 15:20Z R15 verification)"
  completed: "2026-06-12T15:20:00Z"
  tasks_completed: 2 of 3 + R5 device-feedback round (Task 3 device re-check pending; PWA standalone already user-approved on R14)
  files_modified: 7
---

# Quick Task 260612-g7v: Spendings Dead Band — Remove Stacked Clearances Summary

One-liner: SHELL-R14 kills the ~160px black band between the spendings grid and the Safari bottom bar by removing three stacked clearances (72px browser page floor, 88px double-subtraction in the box formula, standalone pb-shell-safe) and making the grid box a fixed-height surface that reaches the visual-viewport bottom — the in-flow tail spacer is the only clearance left.

## Root Causes (verified clearance stack)

The band was the SUM of independent clearances applied around a non-page-scrolling tab whose inner grid scroller owns all vertical scroll:

| #   | Source                                                                              | file:line (pre-fix)                                                                | Mode       | Effect                                                                                                   | Action taken                                                                                             |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `main[data-shell-scroll]` browser floor `padding-bottom: calc(env+72px)`            | apps/web/src/app/global.css:484-493                                                | browser    | ~72px permanent dead strip below the grid box                                                            | Zeroed for spendings via `main[data-shell-scroll]:has([data-no-page-clearance])`                         |
| 2   | `BOTTOM_CLEARANCE=88` subtracted in box formula: `maxH = vv.height − rect.top − 88` | apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx:317,325 | both       | iOS `vv.height` ALREADY excludes the bar → double subtraction shrank the box ~88px (biggest contributor) | Removed: `maxH = floor(vv.height − rect.top)`                                                            |
| 3   | `.pb-shell-safe { padding-bottom: calc(env+64px) }` on BDP content wrapper          | apps/web/src/app/global.css:518-522 + budgets/[id]/layout.tsx:94                   | standalone | Smaller standalone band (matches user report)                                                            | Zeroed for spendings subtree via `[data-no-page-clearance]` standalone rule; kept on page-scrolling tabs |
| 4   | In-flow tail spacer `h-[calc(env+64px)]` inside the scroller                        | spendings-grid-client.tsx:576-580                                                  | both       | Correct clearance — extends scrollHeight so the last row scrolls above the bar                           | KEPT (sole clearance source)                                                                             |

Sum (browser) = #1 + #2 ≈ 160px → matches the decoded ~10.5%-of-screen band.

**Discovered during execution (5th cause):** the grid consumed `--grid-max-h` as `max-h` — with content shorter than the available space the box stopped at content height, leaving a residual band (live geom-390: clientH 639 < maxH 666 → 27px). Fixed by switching to fixed `h-[var(--grid-max-h)]` (d97ada6).

## Commits

| Commit  | Type         | What it did                                                                                                                                                                                                                                                                                                                                               |
| ------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 63f07db | test (RED)   | Round 4 SHELL-R14 Vitest source guards — box formula without clearance term, opt-out mechanism, marker bump, overlay metrics                                                                                                                                                                                                                              |
| 44fa4a6 | feat (GREEN) | SHELL-R14: dropped `BOTTOM_CLEARANCE` from the maxH formula; wrapped spendings page content in `data-no-page-clearance`; global.css zeroes the browser 72px floor (`:has()`) + standalone 64px clearance for the opted-out subtree; viewport-debug marker → SHELL-R14 + new `pageWrapPadBottom`/`gridBoxVvDelta`/`gridSpacerH` overlay metrics            |
| 6e47a69 | test         | Tightened geometry e2e: replaced loose `gap>=48` (false-passed at ~160px) with two-part proof — `                                                                                                                                                                                                                                                         | boxVvDelta | <4` at rest AND after scroll; last-row gap in [8,96] when overflowing. New at-rest scenario under @tasks-geometry; seeds 12 txns/category for deterministic overflow. RED proof: boxVvDelta=27px at 390x844 caught by the new bound, passed by the old one |
| d97ada6 | fix          | `max-h-[var(--grid-max-h)]` → `h-[var(--grid-max-h)]` (fixed height): box bottom == vv bottom regardless of content height. Vitest Test C updated + new R4-J guard forbids the max-h form (38/38 green)                                                                                                                                                   |
| 3e79abc | fix          | Overlay `gridMaxH` reads the `--grid-max-h` CSS var — computed `maxHeight` is now `'none'` after the fixed-height change                                                                                                                                                                                                                                  |
| 855c71a | fix          | e2e + overlay deepest-row probes only matched `button/li/a` — measured the sticky header band (gap=630px, not the last row). Added `[data-testid^="txn-row-"]` to both probes                                                                                                                                                                             |
| 83abed2 | fix          | Live probe showed `txnRowCount=0, roleRowCount=144` — seeded ledger rows render as `draft-row-*` divs in the To-confirm section, so the txn-row prefix matched nothing. Probes switched to `[role=row]` (covers txn + draft rows); gap now measures the true last row (64px = spacer). Diagnostics (`deepestId/txnRowCount/roleRowCount`) logged per step |

## Round 5 — SHELL-R15: Safari browser residual band (device round 5 feedback)

Device checkpoint on R14: **PWA standalone = perfect (user-approved — frozen)**; Safari browser = residual black area exactly at/below the bottom bar (IMG_2787: grid content ends precisely at bar top).

**Root cause:** R14 box bottom = `visualViewport.height − top` lands at the bar's TOP edge — the overflow container CLIPS content there. Native page-scrolling pages paint content under Safari's translucent floating bar (canvas extends to the physical screen bottom); the clipped box left bare black page background in the under-bar zone.

**Fix:**

- `--grid-max-h: max(160px, calc(100lvh - <measuredTop>px))` — measured top kept (ResizeObserver/vv listeners unchanged), bottom anchors to the large viewport. Bar shown: box extends under the bar → content scrolls beneath it like native. Bar collapsed: lvh == visible viewport → exact fit. Standalone: lvh == screen → identical to R14. Chromium: lvh == vvh → e2e geometry unchanged.
- Browser-mode tail-spacer floor `env+96px` (`[data-grid-tail-spacer]` override inside the unlayered `@media (display-mode: browser)` block in global.css — bar ~50px + indicator zone). Standalone keeps the user-approved JSX fallback `env+64px` (R5-C guard forbids a standalone override).
- Marker `SHELL-R15`; overlay adds `gridBoxBeyondVv` (box-bottom − vv-bottom: expected >0 Safari bar-shown, 0 PWA/Chromium).
- e2e bounds loosened: box shortfall (vvBottom − boxBottom) <= 4px (box may extend below); last-row gap upper bound 96 → 128 (spacer floor is now 96px in Chromium browser mode).

### R5 Commits

| Commit  | Type         | What it did                                                                                                                                                                                                            |
| ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 186bc1a | test (RED)   | R5 Vitest guards: lvh bottom anchor, 96px browser spacer floor, standalone untouched, SHELL-R15 marker, gridBoxBeyondVv. R4-A amended (px formula superseded), R4-H relaxed to chain marker. RED: 4 failed / 39 passed |
| 9c291c1 | feat (GREEN) | lvh box anchor + global.css browser spacer override + marker/metric. GREEN: 43/43                                                                                                                                      |
| 3eb96e2 | test         | e2e geometry bounds for the lvh anchor (shortfall <= 4, gap <= 128)                                                                                                                                                    |

## Verification (post-R15, real numbers)

| Check                                                                  | Result                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest `shell-safe-area` (Rounds 1-5 source guards)                    | PASS — 43/43                                                                                      | Run 2026-06-12T13:55Z after GREEN commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Served bundle SHELL-R15                                                | PASS                                                                                              | Fresh image (built 14:0xZ), `budget-web-1` healthy. Container chunks: `layout-fe51295375552a89.js` has `SHELL-R15` + `gridBoxBeyondVv`, zero `SHELL-R14` hits; `spendings/page-354201e16824ab28.js` contains the `100lvh -` calc; `css/24bfd844cd1c63af.css` has `data-grid-tail-spacer]{height:calc(env(safe-area-inset-bottom,0px) + 96px)}` INSIDE `@media (display-mode:browser)`. Live fetch of the layout chunk from https://budget-dev.madonzy.com: marker `SHELL-R15` only                                                                                          |
| Geometry e2e `@tasks-geometry`, 4 viewports, live (post-fix)           | PASS — 20/20 (19 passed + 1 flaky-passed-on-retry), exit 0, 3.2m                                  | /tmp/pw-g7v-r15-geometry.log. All 4 viewports (320x568/390x844/430x932/1280x800): at-rest `boxVvDelta=0`, after-scroll `boxVvDeltaAfterScroll=0`, last-row `gap=96` (== new spacer floor, within [8,128]), `maxHVar="max(160px, calc(100lvh - 178px))"`. Flaky = geom-320 box-at-rest first attempt hit the generic 30s test timeout (tunnel latency); its geometry probe logged `boxVvDelta=0` before the timeout, retry passed in 5.2s                                                                                                                                    |
| Subset sweep `--grep "spendings\|tab frame"` (chromium + mobile, live) | 56 passed / 6 skipped / 13 flaky-passed-on-retry / 3 failed — **all 3 failures unrelated to R15** | /tmp/pw-g7v-r15-subset.log, 16.8m. Failures: (a) onboarding-wizard @phase6 on chromium+mobile — wizard gained a phase-8 "Push" step, the test still walks 4 steps and never reaches Review (stale test; error-context snapshot shows `Push step active`); (b) mobile-scroll @phase4 on chromium — died in the fresh-user SIGN-UP fixture (URL stuck on /sign-up), never reached the grid; same scenario passed on mobile. Both logged to `.planning/phases/08-pwa-offline-push-i18n-e2e-hardening/deferred-items.md`. No grid/scroller assertion failed anywhere in the run |
| `@tasks-redesign` full regression sweep on R14                         | PASS — 41 passed (orchestrator-run)                                                               | R15 diff is geometry-only on the same surfaces; the spendings + tab-frame subset above re-proves the scroller post-R15                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Box used max-h, leaving a dead band with short content**

- **Found during:** Task 2 live geometry run (geom-390: boxVvDelta=27px)
- **Issue:** plan's formula fix (`vv − rect.top`, no clearance term) was correct, but the box consumed `--grid-max-h` as `max-h` — when content height < available space the box stopped at content height, short of the vv bottom
- **Fix:** fixed height `h-[var(--grid-max-h)]`; whole area below the band is scroll surface (nothing in-flow renders below the grid — sliders/dialogs are overlays). Vitest Test C updated + R4-J guard added
- **Files:** spendings-grid-client.tsx, test/shell-safe-area.test.ts
- **Commit:** d97ada6

**2. [Rule 1 - Bug] Overlay gridMaxH read computed maxHeight (now 'none')**

- **Found during:** Task 2 live overlay check after d97ada6
- **Fix:** read the `--grid-max-h` CSS var directly
- **Files:** viewport-debug.tsx
- **Commit:** 3e79abc

**3. [Rule 1 - Bug] Deepest-row probes measured the sticky header band, not the last row**

- **Found during:** Task 2 — e2e gap=630px and live overlay gridLastRowGap stuck at 215px
- **Issue:** probes selected only `button/li/a`; transaction rows are divs. First fix added `[data-testid^="txn-row-"]` (855c71a), but live diagnostics showed `txnRowCount=0, roleRowCount=144` — seeded rows render as `draft-row-*` (To-confirm section)
- **Fix:** probes use `[role=row]` (covers both row kinds); diagnostics logged
- **Files:** bdp-shell-geometry.steps.ts, viewport-debug.tsx
- **Commits:** 855c71a, 83abed2

## Device Checkpoint (Task 3 — blocking, PENDING — R15 re-check)

Round-4 device result: **standalone PWA approved by user** (item 3 done — do not re-litigate). Remaining = Safari browser mode on R15:

1. Safari browser: hard-refresh https://budget-dev.madonzy.com, add `?vpdbg=1` — overlay must show `SHELL-R15` (R14 = stale cache), `beyondVv > 0` while the bar is shown (box extends under the bar), `spacer ≈ 96`
2. Spendings, browser: NO black area at/below the bar; content paints UNDER the translucent bar while scrolling (native behavior, expected); after full scroll the last transaction row sits fully visible above the bar
3. Standalone PWA spot-check only: still pixel-identical to the approved R14 state (`lvh == screen`, spacer stays 64+env)
4. Regression sweep: Wallets + Home bottom clearance; pinned header, sticky column headers, PTR, horizontal column scroll, sheet X alignment intact

Resume signal: "approved", or a `?vpdbg=1` screenshot with `beyondVv` / `spacer` / `gridLastRowGap` in browser mode.

## Known Stubs

None — no placeholder data or unwired components introduced.

## Self-Check: PASSED

- All 10 commits present on `tasks-redesign` (R1-4: 63f07db, 44fa4a6, 6e47a69, d97ada6, 3e79abc, 855c71a, 83abed2; R5: 186bc1a, 9c291c1, 3eb96e2 — verified via git log)
- All 7 modified files exist in the working tree
- Vitest 43/43 (13:55Z); served bundle SHELL-R15 verified in container chunks AND via live fetch from budget-dev.madonzy.com; 96px spacer rule confirmed inside @media (display-mode:browser) in served CSS
- Geometry e2e 20/20 post-fix (exit 0); subset sweep 56 passed with zero grid/scroller failures
