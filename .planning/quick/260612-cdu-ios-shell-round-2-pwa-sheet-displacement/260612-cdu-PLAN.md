---
phase: quick-260612-cdu
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [SHELL-R2-1, SHELL-R2-2, SHELL-R2-3, SHELL-R2-4, SHELL-R2-5]
files_modified:
  - apps/web/src/components/ui/sheet.tsx
  - apps/web/src/components/budgeting/category-slider.tsx
  - apps/web/src/components/budgeting/transaction-slider.tsx
  - apps/web/src/components/budgeting/recurring-rule-form.tsx
  - apps/web/src/components/common/viewport-debug.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/wallets/page.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/reserves/page.tsx
  - apps/web/src/app/[locale]/(app)/budgets/[id]/settings/page.tsx
  - apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx
  - apps/web/src/app/global.css
  - apps/web/test/shell-safe-area.test.ts
  - apps/web/playwright.config.ts
  - apps/web/e2e/features/bdp-tab-frame.feature
  - apps/web/e2e/steps/bdp-shell-geometry.steps.ts
  - apps/web/e2e/page-objects/BdpPo.ts

must_haves:
  truths:
    - "Standalone PWA: edit category / transaction / recurring-rule sheet shows its title + close (X) button at the top, fully visible and tappable, with no gap at the bottom."
    - "Tasks banner renders BELOW the pills band as normal page content — at rest it is fully visible directly under the band, never occluded."
    - "Standalone PWA spendings tab: the last (50th) transaction in a category column is reachable by scrolling, with clearance below it."
    - "Safari browser mode: the last transactions on any page are reachable above Safari's bottom search bar."
    - "Safari browser mode: no black/unpainted band at the bottom of the screen in any bar state; the whole screen is the scroll surface."
    - "?vpdbg=1 overlay reports per-open-sheet geometry (rect, visualViewport, env insets, ancestor transforms, activeElement) so device issues can be screenshot-diagnosed."
  artifacts:
    - path: "apps/web/src/components/ui/sheet.tsx"
      provides: "Sheet top safe-area compensation in standalone + autofocus-suppression hook surface"
      contains: "safe-area-inset-top"
    - path: "apps/web/src/components/common/viewport-debug.tsx"
      provides: "Sheet-aware diagnostics overlay (bumped BUILD_MARKER)"
      contains: "data-sheet"
    - path: "apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx"
      provides: "Grid inner scroller reaches its tail with clearance in both display modes"
      contains: "data-no-pull-refresh"
    - path: "apps/web/src/app/global.css"
      provides: "Browser-mode bottom clearance (explicit px) + black-band fix (min-height strategy)"
      contains: "display-mode: browser"
    - path: "apps/web/playwright.config.ts"
      provides: "Multi-viewport geometry projects (+ optional webkit for browser-mode scenarios)"
      contains: "projects"
  key_links:
    - from: "category-slider/transaction-slider/recurring-rule-form SheetContent"
      to: "Radix Dialog onOpenAutoFocus"
      via: "onOpenAutoFocus={(e) => e.preventDefault()} (standalone/touch)"
      pattern: "onOpenAutoFocus"
    - from: "bdp/[id]/layout.tsx ActivePillTaskSlider"
      to: "{children} content (below band)"
      via: "render site moved out of [data-bdp-tabs] into the pb-shell-safe content wrapper"
      pattern: "ActivePillTaskSlider"
    - from: "spendings-grid-client inner scroller"
      to: "viewport tail"
      via: "height formula + in-flow bottom spacer child (not pb-* / not container padding)"
      pattern: "max-h-\\["
---

<objective>
Round 2 on iOS shell regressions. Round 1 (quick 260612-a0c, commits da386b2/d519d15) shipped two fixes that partially failed on device and introduced one placement the user rejects. Five user-reported issues remain. This plan verifies each root cause against the CURRENT code (evidence table below), fixes what is provably wrong off-device, and wires the existing `?vpdbg=1` overlay to emit per-sheet geometry for the one issue that is device-verifiable only.

Purpose: Make the standalone PWA + Safari-browser shell behave correctly at the top (sheet headers reachable), in the middle (banner placement), and at the bottom (scroll tails + no black band) across both display modes and all phone/desktop viewports.

Output: Corrected sheet + slider + grid + global.css shell rules, a sheet-aware diagnostics overlay, and a multi-viewport Playwright geometry suite (browser-mode-honest, optionally on bundled WebKit).
</objective>

<root_cause_evidence>
Every diagnosis below was verified against the working tree on branch `tasks-redesign` (2026-06-12). File:line cited.

| #   | Issue                                                               | Verified root cause (file:line)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Off-device fixable?                                                                                                          |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | PWA sheets displaced up — title/X hidden at top, gap at bottom      | **(b) autofocus pan + (a) top inset, BOTH present.** None of the three sliders pass `onOpenAutoFocus` preventDefault on `<SheetContent>` (category-slider.tsx:352, transaction-slider.tsx:339 — its `onOpenAutoFocus` at :565 is on the _AlertDialog_, not the sheet; recurring-rule-form.tsx:299). Radix Dialog auto-focuses the first focusable element on open → iOS soft keyboard pans the layout viewport up in standalone (no browser chrome to absorb it) = whole sheet shifts up, bottom gap = panned area. Compounding (a): variant is `inset-y-0 right-0 h-full` (sheet.tsx:38-39) anchored to the ICB; with `viewportFit:"cover"` (root layout.tsx:49) the sheet TOP renders under the status bar / Dynamic Island and nothing inside the sheet compensates `env(safe-area-inset-top)` (only the page `<header>` does, app layout.tsx:222). Round-1 added only a bottom spacer (sheet.tsx:77-83) — addresses neither pan nor top inset. **(c) ruled out:** PTR sets `--ptr-filter` to keyword `none` at rest and removes the property (pull-to-refresh.tsx:199-210); no persistent transform. Portal is default `document.body` (sheet.tsx:57, no `container=` prop on any slider). **(d) partial:** html/body `100lvh`+`overflow:hidden` (global.css:208-209,198) is standalone base; relevant to top-inset only, not the dominant cause. | Partial — top-inset (a) + autofocus (b) fixable in code; final pan behavior is device-verifiable only → diagnostics overlay. |
| 2   | Tasks banner placement — user wants it BELOW pills, not inside band | **Confirmed inside band.** `ActivePillTaskSlider` renders INSIDE `[data-bdp-tabs]` sticky wrapper (bdp/[id]/layout.tsx:91-97), after `<BdpTabs>`. Slider wrapper carries `mb-3 mt-3` for in-band gutter (pill-task-slider.tsx:131). User wants it as normal page content directly under the band (in `{children}`, the `pb-shell-safe` wrapper at layout.tsx:101).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Yes — pure render-site move + verifiable rest-state geometry.                                                                |
| 3   | PWA spendings grid cannot scroll to end (~txn 10 of 50)             | **Inner scroll container with magic-number height + ignored end padding.** Grid IS its own scroller: `overflow-auto max-h-[calc(100svh-176px)] ... pb-6` (spendings-grid-client.tsx:440), `data-no-pull-refresh` (line 419). It is nested inside the BDP `pb-shell-safe` wrapper (layout.tsx:101) but the wrapper's padding sits BELOW the grid's own `max-h` scroll box — never reaches the grid tail. Three failure modes: (i) `100svh` measured small-viewport but the `-176px` constant doesn't track the now-taller band (banner moved into it in round-1, issue #2) → box taller than visible area → tail clipped; (ii) iOS WebKit ignores `pb-6` end-of-scroll padding on inner scroll containers (the project's own SHELL-R8..R10 finding, global.css:496-507); (iii) the grid bypasses `pb-shell-safe` entirely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Yes — height formula + in-flow spacer child inside the grid (not container padding).                                         |
| 4   | Safari browser: last txns hidden behind bottom search bar           | **Clearance exists but too small + env≈0 in browser.** `main[data-shell-scroll]` browser-mode rule: `padding-bottom: calc(env(safe-area-inset-bottom,0px) + 48px)` (global.css:482). In browser mode with the bar visible `env(safe-area-inset-bottom)` is ~0, so total clearance is only 48px — Safari's bottom bar is ~tall enough to overlay the last row. Needs an explicit larger px clearance (tune 64-80px). Must NOT double-pad standalone (that path uses `.pb-shell-safe` at global.css:509, not this rule).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Yes.                                                                                                                         |
| 5   | Safari browser: small black band at bottom, not scrollable          | **`min-height:100lvh` on shell root in browser mode.** Browser block sets `html,body { height:auto; overflow:visible }` (global.css:470-471) but `[data-shell-root] { height:auto; min-height:100lvh }` (global.css:474-476). `100lvh` = LARGE viewport (bar hidden); when Safari's bar IS shown the visible area is smaller than 100lvh, so the shell root extends past the visible area → unpainted region painting the page bg shows at the bottom as a dead band. Backgrounds ARE on both html+body (`--canvas-dark`, global.css:185-188) so it is the height strategy, not a missing bg. CAUTION preserved: the standalone `100lvh` (global.css:209) is the deliberate dead-band fix and must stay; only the _browser-mode_ `min-height` needs to track the dynamic/small viewport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Yes — scope to `display-mode: browser` only.                                                                                 |

Device-verifiable-only residue: the final standalone keyboard-pan behavior for issue #1 (no Playwright engine emulates `display-mode: standalone` or real `env()`/keyboard pan). Wired via the `?vpdbg=1` overlay (issue #1 diagnostics), which the user screenshots if a second pass is needed.
</root_cause_evidence>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260612-a0c-fix-shell-safe-area-regressions-pwa-popu/260612-a0c-SUMMARY.md

<deploy_and_verify>

- Stack runs from prebuilt Docker images — source edits do NOT hot-reload.
  After web edits: `docker compose build web && make restart-web`. If a change
  won't appear, `docker compose build --no-cache web` and verify the SERVED
  bundle (grep the running container's `.next` chunks / check the
  BUILD_MARKER in the `?vpdbg=1` overlay).
- Live URL: https://budget-dev.madonzy.com (Cloudflare tunnel; HTTPS required
  for SW + display-mode). Run E2E with:
  `cd apps/web && infisical run -- sh -c 'PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx bddgen && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test'`
  (or `make test-e2e` with PLAYWRIGHT_BASE_URL set).
- Vitest source/rule guards: `cd apps/web && bun run test -- shell-safe-area`.
- Chromium headless FALSE-PASSES iOS end-of-scroll padding and cannot prove
  standalone mode — geometry tests must assert boundingBox vs viewport AND run
  on multiple viewports; standalone-only behavior stays Vitest-source-guarded.
  </deploy_and_verify>

<interfaces>
<!-- Contracts the executor needs — extracted from the codebase, no exploration required. -->

sheet.tsx (apps/web/src/components/ui/sheet.tsx):

- `sheetVariants` cva: right = "inset-y-0 right-0 h-full w-3/4 border-l ... sm:max-w-sm" (line 38-39)
- `SheetContent` forwardRef renders `<SheetPortal><SheetOverlay/><SheetPrimitive.Content className={cn(sheetVariants({side}), className)} {...props}>` — props spread onto Radix Content, so `onOpenAutoFocus` passes through (line 59-63).
- Round-1 bottom spacer child for left|right, standalone-scoped (line 77-83) — KEEP, extend with top inset.

Slider SheetContent invocations (all `side="right"`, all pass `p-0` so variant pb-\* is tailwind-merge-stripped):

- category-slider.tsx:352 `<SheetContent side="right" className="... p-0 flex flex-col overflow-y-auto" data-testid="cat-slider-content" onPointerDownOutside=... >` (no onOpenAutoFocus)
- transaction-slider.tsx:339 `<SheetContent side="right" className="... p-0 flex flex-col overflow-y-auto" data-testid="txn-slider-content" ...>` (onOpenAutoFocus at :565 belongs to the delete AlertDialog, NOT the sheet)
- recurring-rule-form.tsx:299 `<SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">` (no testid, no onOpenAutoFocus)

global.css shell rules:

- base html,body: `overflow:hidden; height:100%; height:100lvh` (line 198,208-209) — standalone dead-band fix, DO NOT touch.
- `@media (display-mode: browser)` (line 467-494): html,body height:auto/overflow:visible; `[data-shell-root]{height:auto;min-height:100lvh}` (474-476) ← issue #5; `main[data-shell-scroll]{...padding-bottom:calc(env(safe-area-inset-bottom,0px)+48px)}` (478-483) ← issue #4; `[data-shell-header]{position:sticky;top:0}`; `[data-bdp-tabs]{top:calc(4rem + 1px)}`.
- `@media (display-mode: standalone)` (line 508-512): `.pb-shell-safe{padding-bottom:calc(env(safe-area-inset-bottom,0px)+64px)}` ← standalone bottom clearance, consumed by bdp/[id]/layout.tsx:101 and page.tsx (home). DO NOT touch standalone path.

spendings-grid-client.tsx:

- scroll container (line 413-441): `<div ref={gridRef} onScroll={handleGridScroll} data-testid="spendings-grid" data-no-pull-refresh="" style={{overscrollBehavior:"none"}} className="mt-4 overflow-auto max-h-[calc(100svh-176px)] px-3 sm:px-6 pb-6">`
- inner content is `<DndContext>...<div className="flex gap-2 w-fit mx-auto">` columns — a real in-flow spacer child must be the LAST child INSIDE the scroll container, after the columns flex row, to extend scrollHeight (pb-6 on the container is ignored by iOS at end-of-scroll).

bdp/[id]/layout.tsx:

- band: `<div className="sticky top-0 z-40 ... " data-bdp-tabs> <BdpTabs .../> <Suspense fallback={null}><ActivePillTaskSlider budgetId locale initialTasks/></Suspense> </div>` (line 78-98)
- content: `<div className="pb-shell-safe">{children}</div>` (line 101) ← move ActivePillTaskSlider to TOP of this wrapper, above {children}.

viewport-debug.tsx:

- `BUILD_MARKER = "SHELL-R11"` (line 16) — bump to SHELL-R12.
- `?vpdbg=1` gate via `isVpdbgEnabled()` (line 20-28); overlay reads `readMetrics()` (line 65-101) on a 700ms interval. Extend metrics with open-sheet probe.
- `probeEnvInset("top"|"bottom")` already exists (line 55-63) — reuse for safe-area readout.

e2e geometry (already present, browser-mode/Chromium):

- BdpPo.ts: `shellHeader()` → `[data-shell-header]` (line 27-28); `tasksBanner(pill)` → `[data-testid="pill-task-slider"][data-pill="${pill}"]` (line 38).
- bdp-shell-geometry.steps.ts: `assertBannerBelowHeader(page, phase)` (line 98-133) measures banner.boundingBox top vs header bottom; seeding helper `withTenantClient` + "12 seeded categories with monthly limits" Given (line 57-87).
- bdp-tab-frame.feature: existing `@tasks-geometry` scenario (banner-below-header) — this asserted the IN-BAND placement; it must be REPLACED to assert the new below-band rest-state geometry.
  </interfaces>
  </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix PWA sheet displacement (#1) + sheet-aware diagnostics overlay</name>
  <files>apps/web/src/components/ui/sheet.tsx, apps/web/src/components/budgeting/category-slider.tsx, apps/web/src/components/budgeting/transaction-slider.tsx, apps/web/src/components/budgeting/recurring-rule-form.tsx, apps/web/src/components/common/viewport-debug.tsx, apps/web/test/shell-safe-area.test.ts</files>
  <behavior>
    - shell-safe-area guard: sheet.tsx left|right variant content compensates `env(safe-area-inset-top)` in standalone (top inset), in ADDITION to the existing bottom spacer. Assert the source contains a standalone-scoped top compensation (e.g. a top spacer child mirroring the bottom one, or `pt-[env(safe-area-inset-top)]` applied to the content in standalone) — NOT via `.pb-shell-safe` (blast-radius boundary kept; existing not-match guard at test line 109-113 still passes after comment-strip).
    - shell-safe-area guard: all THREE sliders' `<SheetContent>` carry an `onOpenAutoFocus` handler that prevents the default autofocus on open (source-grep each slider for `onOpenAutoFocus` on the sheet content). Rationale comment required in each, mentioning iOS standalone keyboard pan.
    - shell-safe-area guard: viewport-debug BUILD_MARKER bumped (no longer "SHELL-R11").
    - viewport-debug overlay, when a sheet is open, reports: sheet content `getBoundingClientRect` (top/bottom/height), `visualViewport.{offsetTop,height,scale}`, `window.innerHeight`, computed `env(safe-area-inset-top/bottom)` (reuse probeEnvInset), the open sheet's ancestor-chain transform/filter/contain values, and `document.activeElement.tagName`. Assert source references a sheet selector (e.g. `[data-sheet-content]` or `[role="dialog"]`) and `activeElement`.
  </behavior>
  <action>
Fix issue #1 (root causes a + b) and extend the diagnostics overlay for the device-verifiable residue.

1. sheet.tsx — TOP inset compensation (root cause a). Keep the existing bottom spacer (line 77-83). Add standalone-scoped top compensation for left|right variants so the sheet header clears the status bar / Dynamic Island under viewport-fit=cover. Mirror the bottom-spacer mechanism: a real in-flow top spacer child rendered BEFORE `<SheetClose>`/children, `h-[env(safe-area-inset-top,0px)]`, `[@media(display-mode:standalone)]:block` (hidden otherwise so browser mode is unchanged). Add `data-sheet-content` to `SheetPrimitive.Content` (a stable selector the overlay + future tests target). Do NOT change the `inset-y-0 h-full` variant string. Keep the `.pb-shell-safe` blast-radius comment.

2. Three sliders — suppress open-autofocus (root cause b). On each `<SheetContent>` add:
   `onOpenAutoFocus={(e) => { e.preventDefault(); }}`
   with a comment: "iOS standalone PWA: Radix auto-focuses the first field on open → the soft keyboard pans the layout viewport up (no browser chrome to absorb it), shifting the whole sheet up and hiding the title/X. Prevent autofocus; the user taps to focus, and transaction-row.tsx already scrolls focused inputs into view."
   - transaction-slider.tsx:339 — ADD to the sheet content (do NOT touch the AlertDialog onOpenAutoFocus at :565).
   - category-slider.tsx:352 — ADD (preserve existing onPointerDownOutside etc.).
   - recurring-rule-form.tsx:299 — ADD.
     Do NOT gate on display-mode in JS (Radix handler can't read it cleanly per-open and suppressing autofocus on touch is harmless/desirable everywhere on mobile); preventing default unconditionally is the simplest correct fix and keeps desktop keyboard users able to Tab in.

3. viewport-debug.tsx — bump BUILD_MARKER "SHELL-R11" → "SHELL-R12". Extend `readMetrics()` (or add a sibling probe) to detect an open sheet via `document.querySelector('[data-sheet-content]')` and, when present, report: rect top/bottom/height, `visualViewport.offsetTop/height/scale`, `window.innerHeight`, `probeEnvInset("top")/("bottom")`, `document.activeElement?.tagName`, and the open sheet's ancestor-chain `transform`/`filter`/`contain` computed values (walk parentElement to body, collect any non-`none`). Add these lines to the overlay JSX, only when a sheet is open. Keep the existing fields.

4. shell-safe-area.test.ts — add the four guards listed in <behavior>. Keep all existing assertions green (the existing R1 guard's not-match on `.pb-shell-safe` in code must still pass — strip comments as it already does).

Deploy: `docker compose build web && make restart-web`; confirm the served overlay shows SHELL-R12.
</action>
<verify>
<automated>cd apps/web && bun run test -- shell-safe-area</automated>
</verify>
<done>shell-safe-area suite green with the four new guards; all three sliders' SheetContent carry onOpenAutoFocus preventDefault; sheet.tsx has standalone top + bottom safe-area compensation and data-sheet-content; overlay BUILD_MARKER=SHELL-R12 and reports per-sheet geometry; served bundle shows SHELL-R12.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Banner below band (#2) + grid tail (#3) + browser bottom clearance (#4) + black band (#5)</name>
  <files>apps/web/src/app/[locale]/(app)/budgets/[id]/layout.tsx, apps/web/src/components/budgeting/spendings-grid/spendings-grid-client.tsx, apps/web/src/app/global.css, apps/web/test/shell-safe-area.test.ts</files>
  <behavior>
    - #2: ActivePillTaskSlider no longer renders inside `[data-bdp-tabs]`; it renders as the first child of the `pb-shell-safe` content wrapper, above `{children}`. shell-safe-area guard asserts the BDP layout source has ActivePillTaskSlider OUTSIDE the data-bdp-tabs div (e.g. the `data-bdp-tabs` block no longer contains `<ActivePillTaskSlider`, and the `pb-shell-safe` wrapper does). pill-task-slider wrapper margin no longer assumes in-band placement.
    - #3: spendings grid scroll container's last in-flow child is a real spacer (not container `pb-*`, not `::after`) sized for safe-area + clearance; the `max-h` height formula tracks the actual band height (use a CSS var or dvh/visualViewport-safe expression, not the stale `-176px` constant), guaranteeing the last row + clearance are reachable.
    - #4: browser-mode `main[data-shell-scroll]` bottom clearance is an explicit px floor (tune 64-80px) on top of env, so env≈0 (bar visible) still clears Safari's bottom bar. Standalone path (`.pb-shell-safe`) unchanged → no double-pad.
    - #5: browser-mode shell does not paint a dead band — the `[data-shell-root] min-height` in browser mode tracks the small/dynamic viewport (e.g. `100dvh`/`100svh`) instead of `100lvh`. Standalone `100lvh` rules (base html,body + dead-band fix) untouched.
    - shell-safe-area guards updated for #4 (explicit px clearance present in browser block), #5 (browser-mode root no longer `min-height:100lvh`; standalone base `100lvh` still asserted), and #2 (placement).
  </behavior>
  <action>
Fix the placement + all three bottom-edge issues. Touch standalone paths only where explicitly required; preserve every existing green guard.

1. #2 — move the banner below the band. In bdp/[id]/layout.tsx: remove `<ActivePillTaskSlider>` (and its `<Suspense>`) from inside the `data-bdp-tabs` div (line 91-97). Render it as the FIRST child of the content wrapper, wrapped in the same `<Suspense fallback={null}>`:
   `<div className="pb-shell-safe"><Suspense fallback={null}><ActivePillTaskSlider .../></Suspense>{children}</div>`
   Keep all props (budgetId, locale, initialTasks). Update the layout comment (lines 24-32) to state the banner is normal page content below the band per user round-2 feedback; at rest fully visible, may scroll under the band/header on page scroll (acceptable). In pill-task-slider.tsx adjust the wrapper margin (line 131 `mb-3 mt-3`) so it reads as content directly under the band (e.g. `mt-3` top gutter; drop the in-band `mb-3` rationale) — keep `mx-auto max-w-[1280px] px-4 sm:px-8`.

2. #3 — spendings grid tail. In spendings-grid-client.tsx scroll container (line 413-441):
   - Replace the stale `max-h-[calc(100svh-176px)]` magic constant with a formula that tracks the live top chrome. Prefer measuring: set the max-height from a CSS custom property the layout exposes, OR compute via `100dvh` minus a measured offset. Simplest robust option: keep a dvh-based bound but subtract a CSS var `--bdp-top-offset` set on the grid wrapper from the band's actual height (header 64px + 1px + band). If a measured approach is over-scope, use `100dvh` (dynamic — shrinks with the bar) minus the fixed top chrome, and rely on the spacer (next bullet) for the tail. Document the choice.
   - Append a REAL in-flow spacer as the LAST child INSIDE the scroll container (after the columns flex row / DndContext), `aria-hidden`, `h-[calc(env(safe-area-inset-bottom,0px)+64px)] shrink-0`, so scrollHeight extends past the last row (iOS ignores the container's `pb-6` at end-of-scroll — same SHELL-R8..R10 finding). Keep `data-no-pull-refresh` and `overscrollBehavior:none`.
   - Keep the column `sticky top-0` add-category behavior.

3. #4 — browser bottom clearance. In global.css `@media (display-mode: browser)` `main[data-shell-scroll]` rule (line 482): raise the explicit floor from 48px to a value that clears Safari's bottom bar — `padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 72px)` (tune 64-80; 72 is the midpoint). env is additive so standalone (different code path via .pb-shell-safe) is unaffected — verify no double-pad.

4. #5 — black band. In the same browser block, change `[data-shell-root]` (line 474-476) from `min-height: 100lvh` to a dynamic-viewport-tracking value: `min-height: 100dvh` (falls to the SMALL/visible area when the bar is shown so the shell never exceeds the painted region; still fills when the bar hides because dvh grows). Keep `height: auto`. Leave the base (standalone) html,body `100lvh` (line 209) and the standalone dead-band comment intact. Add a comment: browser mode tracks the dynamic viewport so no unpainted band appears; standalone keeps 100lvh for the locked-body dead-band fix.

5. shell-safe-area.test.ts — update/extend guards:
   - #2: assert the `data-bdp-tabs` block does NOT contain `ActivePillTaskSlider` and the `pb-shell-safe` wrapper DOES (parse the BDP layout source).
   - #4: browser block `main[data-shell-scroll]` padding-bottom matches `calc(env(safe-area-inset-bottom...) + (6[4-9]|7[0-9]|80)px)` (>=64px).
   - #5: browser block `[data-shell-root]` no longer matches `min-height:\s*100lvh`; assert it matches `min-height:\s*100dvh`. Keep the base-`100lvh` standalone guard at test line 133 green.
   - #3: assert spendings-grid-client source has an in-flow spacer with `env(safe-area-inset-bottom` inside the grid AND no longer uses the literal `-176px` (or, if a var approach, asserts the var).

Deploy + re-verify the served bundle as in Task 1.
</action>
<verify>
<automated>cd apps/web && bun run test -- shell-safe-area && bunx tsc --noEmit</automated>
</verify>
<done>Banner renders below the band (source-proven); spendings grid has an in-flow bottom spacer + non-magic height; browser-mode clearance >=64px floor; browser-mode shell root uses 100dvh (no black band); standalone paths untouched; shell-safe-area green + tsc clean; served bundle SHELL-R12 reflects changes.</done>
</task>

<task type="auto">
  <name>Task 3: Multi-viewport browser-mode geometry suite + optional WebKit + live proof</name>
  <files>apps/web/playwright.config.ts, apps/web/e2e/features/bdp-tab-frame.feature, apps/web/e2e/steps/bdp-shell-geometry.steps.ts, apps/web/e2e/page-objects/BdpPo.ts</files>
  <action>
Make the geometry assertions device-agnostic (multi-viewport) and replace the now-wrong in-band banner scenario with below-band + bottom-edge proofs. These run in browser mode (Chromium can prove #2/#4/#5 geometry; standalone-only #1/#3-standalone stay Vitest-guarded — note this in the feature comments).

1. playwright.config.ts — parameterize viewports. Add geometry-targeted projects for at least 320x568, 390x844, 430x932, 1280x800 (extend the existing chromium + mobile projects, or add named projects e.g. `geom-320`, `geom-390`, `geom-430`, `geom-1280` using `devices["Desktop Chrome"]` + viewport). Keep the existing chromium + mobile projects intact (auth/other suites depend on them). WebKit: Playwright 1.55.1 bundles WebKit on Linux but `.local-browsers` is not installed in this env — add a commented `webkit` project (closest engine to Safari for flex/scroll) and, ONLY if `bunx playwright install webkit` succeeds AND the fresh-user auth flow passes on it without destabilizing the suite, enable it for the browser-mode geometry scenarios. If WebKit auth is flaky, leave it commented with a TODO; do not block the suite.

2. bdp-tab-frame.feature — REPLACE the existing `@tasks-geometry` scenario (it asserted the in-band placement, now wrong). New scenarios (browser mode):
   - Banner below band at rest: seed 12 categories + a RESERVE_TOPUP task (reuse existing Given + reserves-pill mapping); open reserves tab; assert the banner top edge is BELOW the band bottom edge AND fully within the viewport at rest (boundingBox top >= band bottom, bottom <= viewport height).
   - Bottom clearance (#4): on a seeded-tall page, scroll the relevant scroll surface to the end; assert the last interactive row's bottom is above (viewportHeight - clearanceFloor) — i.e. real clearance exists. Assert across the multi-viewport projects.
   - No dead band (#5): assert `[data-shell-root]` boundingBox height <= visualViewport height (no overflow painting a band) in browser mode.
     Keep an honesty guard (window.scrollY > 50 after scroll) so a short page can't false-pass, mirroring the existing pattern (steps line 150-157).

3. bdp-shell-geometry.steps.ts — add steps for the new Thens: a `bannerBelowBand`/within-viewport assertion (add `bdpBand()` → `[data-bdp-tabs]` to BdpPo.ts), a bottom-clearance assertion (find deepest interactive rect like viewport-debug's readMetrics, assert gap), and a shell-root-no-overflow assertion. Reuse `withTenantClient` seeding. Log geometry (header/band/banner/lastRow + viewport) for the SUMMARY proof table, as the existing helper does.

4. BdpPo.ts — add `bdpBand()` returning `[data-bdp-tabs]`; keep `shellHeader()`/`tasksBanner()`.

Run the suite live against budget-dev across all geometry viewports; capture the geometry table (per viewport: band bottom, banner top, last-row gap, shell-root vs viewport) for the SUMMARY. Do NOT mark verified until the served bundle shows SHELL-R12 and the geometry scenarios are green on every geometry viewport project.
</action>
<verify>
<automated>cd apps/web && infisical run -- sh -c 'PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx bddgen && PLAYWRIGHT_BASE_URL=https://budget-dev.madonzy.com bunx playwright test --grep @tasks-geometry'</automated>
</verify>
<done>Multi-viewport geometry projects defined; in-band banner scenario replaced by below-band + bottom-clearance + no-dead-band scenarios; all geometry scenarios green on 320/390/430/1280 against budget-dev; WebKit enabled for browser-mode geometry if stable, else commented with TODO; geometry proof table captured.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    All five issues addressed in code + a SHELL-R12 `?vpdbg=1` overlay that now reports per-open-sheet geometry. Browser-mode geometry (#2 placement, #4 clearance, #5 dead band) is proven by multi-viewport Playwright. Issue #1's final standalone keyboard-pan behavior and the standalone spendings-grid tail (#3) are NOT Playwright-emulatable (no engine does display-mode:standalone or real env()/keyboard pan) — they need a real iOS device.
  </what-built>
  <how-to-verify>
    On a real iPhone, installed PWA (standalone), against https://budget-dev.madonzy.com:
    1. Open the three edit sheets — edit category, edit transaction, edit recurring rule. For EACH: confirm the title and the close (X) button are fully visible and tappable at the top, and there is no gap at the bottom. Tapping a field should not shove the sheet up so the header is lost.
    2. Spendings tab, a category with ~50 transactions: scroll the column to the very end — confirm the 50th transaction is reachable with clearance below it (not stuck at ~10).
    3. Full-page scroll on Wallets/Reserves: confirm the last row clears the home indicator.
    If anything is still off: open the SAME page with `?vpdbg=1`, open the sheet, screenshot the SHELL-R12 overlay (it now shows sheet rect, visualViewport offsetTop/height/scale, env insets, ancestor transforms, activeElement) and the bottom-edge metrics. Also confirm in Safari BROWSER mode (not installed): last rows clear the bottom search bar (#4) and there is no black band at the bottom (#5).
  </how-to-verify>
  <resume-signal>Type "approved" if all five are correct on device, or paste the SHELL-R12 overlay screenshot(s) + which issue persists for a second pass.</resume-signal>
</task>

</tasks>

<verification>
- `cd apps/web && bun run test -- shell-safe-area` — all guards green (existing + new for #1 top-inset/autofocus, #2 placement, #3 grid spacer, #4 clearance floor, #5 dvh root, overlay marker).
- `cd apps/web && bunx tsc --noEmit` — clean.
- Geometry E2E green on 320/390/430/1280 against budget-dev (banner-below-band, bottom-clearance, no-dead-band).
- Regression sweep: `make test-e2e` (or grep the sheet/slider + bdp-tab-frame + spendings + tasks scenarios) — no new failures; round-1's @tasks-redesign slider + sheet flows still green.
- Served bundle shows BUILD_MARKER SHELL-R12 (no stale cache).
- Device checkpoint approved (issues #1 final pan + #3 standalone tail).
</verification>

<success_criteria>

- Standalone PWA edit sheets: header (title + X) reachable, no bottom gap, no autofocus-driven upward shift.
- Tasks banner is normal page content below the pills band, fully visible at rest.
- Standalone spendings grid: last transaction reachable with clearance.
- Safari browser mode: last rows clear the bottom bar; no black/dead band.
- `?vpdbg=1` SHELL-R12 overlay emits per-sheet diagnostics for any needed second pass.
- Preserved: pinned header (browser), standalone scroll clearance (.pb-shell-safe), custom PTR (standalone), 100lvh dead-band fix (standalone), all pre-existing green suites.
  </success_criteria>

<output>
After completion, create `.planning/quick/260612-cdu-ios-shell-round-2-pwa-sheet-displacement/260612-cdu-SUMMARY.md` including the live geometry proof table (per viewport: band bottom, banner top, last-row gap, shell-root vs viewport) and the SHELL-R12 served-bundle confirmation.
</output>
