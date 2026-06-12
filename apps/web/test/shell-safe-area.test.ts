/**
 * shell-safe-area.test.ts — UAT-08 regression guard: iOS Safari's floating
 * bottom bar overlays the page; without env(safe-area-inset-bottom) padding
 * on the shell's scroll surface the last rows are unreachable behind the bar
 * (browser only — standalone has no bar, just the home indicator).
 * Same source-grep style as offline-shell-wiring.test.ts: layout is a server
 * component with session logic, so mounting it in jsdom is not practical.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const layout = readFileSync(
  resolve(__dirname, "../src/app/[locale]/(app)/layout.tsx"),
  "utf8",
);
const globalCss = readFileSync(
  resolve(__dirname, "../src/app/global.css"),
  "utf8",
);
const rootLayout = readFileSync(
  resolve(__dirname, "../src/app/layout.tsx"),
  "utf8",
);
const sheetTsx = readFileSync(
  resolve(__dirname, "../src/components/ui/sheet.tsx"),
  "utf8",
);

describe("(app) shell clears iOS bottom UI", () => {
  it("marks the <main> scroll surface for the browser-only bottom clearance rule", () => {
    const mainTag = layout.match(/<main[^>]*className=[^>]*>/)?.[0] ?? "";
    expect(mainTag).toContain("data-shell-scroll");
  });

  it("standalone clearance lives INSIDE page content (.pb-shell-safe) — every shell-level mechanism failed on iOS", () => {
    // Device-verified SHELL-R8..R10: scroll-container padding ignored;
    // ::after computes height but never enters the scroll flow; a real
    // sibling spacer lands at the flex-basis-0 box edge while content
    // overflows past it. Padding inside in-flow page content is the only
    // engine-agnostic placement.
    const standaloneBlock = globalCss.match(
      /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(standaloneBlock).toBeTruthy();
    expect(standaloneBlock).toMatch(
      /\.pb-shell-safe[^}]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*64px\)/,
    );
    // Applied where it covers all mobile surfaces:
    const bdpLayout = readFileSync(
      resolve(__dirname, "../src/app/[locale]/(app)/budgets/[id]/layout.tsx"),
      "utf8",
    );
    expect(bdpLayout).toMatch(/pb-shell-safe/);
    const homePage = readFileSync(
      resolve(__dirname, "../src/app/[locale]/(app)/page.tsx"),
      "utf8",
    );
    expect(homePage).toMatch(/pb-shell-safe/);
  });

  it("browser display-mode unlocks native page scroll (bar collapse needs PAGE scroll)", () => {
    // iOS Safari only collapses its bottom bar and extends the viewport
    // edge-to-edge (google.com behavior) when the page itself scrolls.
    // The locked-body + inner-scroll architecture is standalone-only.
    const browserBlock = globalCss.match(
      /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(browserBlock).toBeTruthy();
    expect(browserBlock).toMatch(/height:\s*auto/);
    expect(browserBlock).toMatch(/overflow:\s*visible/);
    expect(browserBlock).toMatch(/data-shell-scroll[^}]*overflow-y:\s*visible/);
  });

  it("browser mode pins the header and offsets the BDP tab band below it", () => {
    // Native page scroll would carry the header away; UAT feedback wants it
    // pinned like standalone. The tab band (sticky top-0) must then stick
    // BELOW the 65px header (h-16 + 1px border) instead of sliding under it.
    const browserBlock = globalCss.match(
      /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
    )?.[1];
    expect(browserBlock).toMatch(
      /data-shell-header[^}]*position:\s*sticky[^}]*top:\s*0/,
    );
    expect(browserBlock).toMatch(
      /data-bdp-tabs[^}]*top:\s*calc\(4rem \+ 1px\)/,
    );
    expect(layout).toMatch(/<header[^>]*data-shell-header/);
    const bdpLayout = readFileSync(
      resolve(__dirname, "../src/app/[locale]/(app)/budgets/[id]/layout.tsx"),
      "utf8",
    );
    expect(bdpLayout).toMatch(/data-bdp-tabs/);
  });

  it("right-side Sheet variant is decoupled from .pb-shell-safe page padding (quick-260612-a0c R1)", () => {
    // Sheets portal to document.body and use `position:fixed` anchored to the
    // Initial Containing Block (ICB). The right/left full-height variant uses
    // `inset-y-0 h-full` — it already reaches the ICB bottom. The HOME INDICATOR
    // inset must be absorbed INSIDE the sheet content via safe-area bottom padding,
    // NOT via .pb-shell-safe (which is page-content padding inside the scroll
    // surface and must not influence portaled fixed elements).
    //
    // Assert: right variant carries safe-area-inset-bottom compensation.
    expect(sheetTsx).toMatch(/safe-area-inset-bottom/);
    // Assert: sheet.tsx CODE does NOT reference .pb-shell-safe (blast-radius
    // boundary). Comments are allowed to mention it — the explanatory comment
    // in SheetContent is required — so strip comments before matching.
    const sheetCode = sheetTsx
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(sheetCode).not.toMatch(/pb-shell-safe/);
    // Assert: right variant keeps inset-y-0 (ICB-anchored top+bottom via fixed).
    const rightVariant = sheetTsx.match(/right:\s*["']([^"']+)["']/)?.[1] ?? "";
    expect(rightVariant).toContain("inset-y-0");
  });

  it("custom pull-to-refresh stays standalone-only (browser gets native PTR)", () => {
    const ptr = readFileSync(
      resolve(__dirname, "../src/components/common/pull-to-refresh.tsx"),
      "utf8",
    );
    expect(ptr).toMatch(/display-mode:\s*standalone/);
  });

  it("html/body and the shell are sized to the large viewport (100lvh)", () => {
    // iOS Safari never resizes the viewport when only an INNER container
    // scrolls (page scroll is locked for the custom PTR), so a dvh/svh-sized
    // shell leaves a permanent dead band where the expanded bar was. lvh
    // paints edge-to-edge; content slides under the translucent bar like a
    // native list. In standalone lvh == screen height — no change there.
    expect(globalCss).toMatch(/height:\s*100lvh/);
    expect(layout).toMatch(/h-lvh/);
  });

  it("viewport-fit=cover is set so env(safe-area-inset-*) resolves on iOS", () => {
    expect(rootLayout).toMatch(/viewportFit:\s*["']cover["']/);
  });

  it("header compensates the top inset once viewport-fit=cover activates it", () => {
    const headerTag = layout.match(/<header[^>]*>/)?.[0] ?? "";
    expect(headerTag).toContain("safe-area-inset-top");
  });
});

describe("PWA sheet displacement fixes (SHELL-R12)", () => {
  const categorySlider = readFileSync(
    resolve(__dirname, "../src/components/budgeting/category-slider.tsx"),
    "utf8",
  );
  const transactionSlider = readFileSync(
    resolve(__dirname, "../src/components/budgeting/transaction-slider.tsx"),
    "utf8",
  );
  const recurringRuleForm = readFileSync(
    resolve(__dirname, "../src/components/budgeting/recurring-rule-form.tsx"),
    "utf8",
  );
  const viewportDebug = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );

  it("sheet.tsx compensates env(safe-area-inset-top) in standalone (top inset, root cause a)", () => {
    // In standalone with viewport-fit=cover the sheet top renders under the
    // Dynamic Island / status bar. An in-flow top spacer scoped to
    // @media(display-mode:standalone) pushes the title/X below the inset.
    expect(sheetTsx).toMatch(/safe-area-inset-top/);
    // Standalone-scoped so browser mode is unchanged.
    expect(sheetTsx).toMatch(/display-mode:\s*standalone/);
  });

  it("sheet.tsx carries data-sheet-content on SheetPrimitive.Content for overlay targeting", () => {
    // The diagnostics overlay and future tests locate the open sheet via
    // [data-sheet-content]. Stable selector decoupled from Radix internals.
    expect(sheetTsx).toMatch(/data-sheet-content/);
  });

  it("category-slider SheetContent has onOpenAutoFocus preventDefault (root cause b)", () => {
    // Radix auto-focuses the first focusable element on open. In standalone
    // the soft keyboard pans the layout viewport up — no browser chrome to
    // absorb it — shifting the sheet up and hiding the title/X. Preventing
    // default stops the pan; the user taps to focus.
    expect(categorySlider).toMatch(/onOpenAutoFocus/);
    // Must be on the SheetContent, not any inner dialog.
    const sheetContentBlock =
      categorySlider.match(/<SheetContent[\s\S]*?>/)?.[0] ?? "";
    expect(sheetContentBlock).toMatch(/onOpenAutoFocus/);
  });

  it("transaction-slider SheetContent has onOpenAutoFocus preventDefault (root cause b)", () => {
    expect(transactionSlider).toMatch(/onOpenAutoFocus/);
    // The sheet-level SheetContent is the first <SheetContent in the file.
    const firstSheetContent =
      transactionSlider.match(/<SheetContent[\s\S]*?>/)?.[0] ?? "";
    expect(firstSheetContent).toMatch(/onOpenAutoFocus/);
  });

  it("recurring-rule-form SheetContent has onOpenAutoFocus preventDefault (root cause b)", () => {
    expect(recurringRuleForm).toMatch(/onOpenAutoFocus/);
    const sheetContentBlock =
      recurringRuleForm.match(/<SheetContent[\s\S]*?>/)?.[0] ?? "";
    expect(sheetContentBlock).toMatch(/onOpenAutoFocus/);
  });

  it("viewport-debug BUILD_MARKER has been bumped past SHELL-R11", () => {
    // A screenshot showing R11/R12/R13 means stale cached assets.
    expect(viewportDebug).not.toMatch(/SHELL-R11/);
    expect(viewportDebug).not.toMatch(/SHELL-R12/);
    expect(viewportDebug).not.toMatch(/SHELL-R13/);
    // R14+ accepted (chain advances each round)
    expect(viewportDebug).toMatch(/SHELL-R1[4-9]/);
  });

  it("viewport-debug overlay probes open sheet geometry (data-sheet-content selector)", () => {
    // When a sheet is open the overlay reports rect, visualViewport,
    // env insets, ancestor transforms, and activeElement — needed for
    // device-only diagnosis of the keyboard-pan residue.
    expect(viewportDebug).toMatch(/data-sheet-content/);
    expect(viewportDebug).toMatch(/activeElement/);
  });
});

describe("Round 3 sheet X alignment + banner trim (SHELL-R13)", () => {
  const pillTaskSlider = readFileSync(
    resolve(
      __dirname,
      "../src/components/budgeting/tasks/pill-task-slider.tsx",
    ),
    "utf8",
  );
  const viewportDebugR3 = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );

  it("Test A: SheetClose top offset tracks env(safe-area-inset-top) — no bare top-4", () => {
    // Root cause #1: bare `top-4` anchors X to Content box top, ABOVE the R2 top spacer
    // and ABOVE the px-6 py-4 title row. Fix: offset = env(safe-area-inset-top,0px)+22px
    // so X aligns with the title vertical center in both browser (env→0) and standalone.
    // Strip comments before matching so the explanatory comment doesn't false-match.
    const sheetCode = sheetTsx
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Must NOT use bare top-4
    expect(sheetCode).not.toMatch(/\btop-4\b/);
    // Must use env(safe-area-inset-top in the top offset
    expect(sheetCode).toMatch(/top-\[calc\(env\(safe-area-inset-top/);
  });

  it("Test B: PillTaskSlider wrapper uses mb-1.5 (not mb-3) — gutter halved", () => {
    // Root cause #3: mb-3 (12px) reported too big; halved to mb-1.5 (6px).
    // mt-3 (top gutter below band) is unchanged.
    const pillCode = pillTaskSlider
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(pillCode).not.toMatch(/\bmb-3\b/);
    expect(pillCode).toMatch(/\bmb-1\.5\b/);
    // mt-3 stays
    expect(pillCode).toMatch(/\bmt-3\b/);
  });

  it("Test C: spendings grid uses ResizeObserver + getBoundingClientRect (not 100dvh-128px)", () => {
    // Root cause #2a: viewport-unit math cannot know scroller top offset → constant rots.
    // Architecture (a): ResizeObserver measures rect.top → computes maxH → writes --grid-max-h.
    const spendingsGrid = readFileSync(
      resolve(
        __dirname,
        "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
      ),
      "utf8",
    );
    // Old constant must be gone
    expect(spendingsGrid).not.toMatch(/100dvh-128px/);
    // Runtime measurement present
    expect(spendingsGrid).toMatch(/ResizeObserver/);
    expect(spendingsGrid).toMatch(/getBoundingClientRect/);
    // CSS var driven bound
    expect(spendingsGrid).toMatch(/--grid-max-h/);
    // CSS var consumed in className — SHELL-R14: FIXED height (h-, not max-h-)
    // so the box reaches vv bottom even with short content (see R4-F).
    expect(spendingsGrid).toMatch(/(?<!max-)h-\[var\(--grid-max-h/);
  });

  it("Test D: grid measured bound uses visualViewport height (not just innerHeight)", () => {
    // Root cause #2b: measurement uses visualViewport.height so the box tracks
    // the actual visual viewport. SHELL-R14 removes the BOTTOM_CLEARANCE
    // subtraction (box now reaches vv bottom; clearance moves to tail spacer).
    // The BOTTOM_CLEARANCE assertion is superseded by R4-A in the Round 4 block.
    const spendingsGrid = readFileSync(
      resolve(
        __dirname,
        "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
      ),
      "utf8",
    );
    expect(spendingsGrid).toMatch(/visualViewport/);
    // Tail spacer with env(safe-area-inset-bottom) still present (existing assertion #3)
    expect(spendingsGrid).toMatch(/env\(safe-area-inset-bottom/);
    expect(spendingsGrid).toMatch(/aria-hidden/);
  });

  it("Test E: viewport-debug BUILD_MARKER is >= SHELL-R13 and grid block is present", () => {
    // SHELL-R13 introduced grid-scroller metrics; R14+ continues the chain.
    // Accept R13 OR any later marker (chain advances each round).
    expect(viewportDebugR3).toMatch(/SHELL-R1[3-9]/);
    // Grid scroller probed
    expect(viewportDebugR3).toMatch(/spendings-grid/);
    // Grid metrics surfaced
    expect(viewportDebugR3).toMatch(/gridMaxH|gridScrollH|gridClientH/);
    // Grid last-row gap metric
    expect(viewportDebugR3).toMatch(/gridLastRowGap/);
  });
});

describe("Round 4 — box reaches vv bottom, no stacked clearance (SHELL-R14)", () => {
  const spendingsGrid = readFileSync(
    resolve(
      __dirname,
      "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
    ),
    "utf8",
  );
  const spendingsGridCode = spendingsGrid
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const viewportDebugR4 = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );
  const bdpLayoutR4 = readFileSync(
    resolve(__dirname, "../src/app/[locale]/(app)/budgets/[id]/layout.tsx"),
    "utf8",
  );
  const homePageR4 = readFileSync(
    resolve(__dirname, "../src/app/[locale]/(app)/page.tsx"),
    "utf8",
  );
  const spendingsPageR4 = readFileSync(
    resolve(
      __dirname,
      "../src/app/[locale]/(app)/budgets/[id]/spendings/page.tsx",
    ),
    "utf8",
  );
  const spendingsPageCode = spendingsPageR4
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("R4-A: updateMaxH formula is vh - rect.top with NO clearance subtraction", () => {
    // The box must now extend to vv bottom. BOTTOM_CLEARANCE must NOT appear
    // in the maxH assignment line. Strip comments so the guard comment doesn't
    // false-match.
    // The line must match: Math.max(160, Math.floor(vh - rect.top))
    expect(spendingsGridCode).toMatch(
      /Math\.max\(160,\s*Math\.floor\(vh\s*-\s*rect\.top\s*\)\)/,
    );
    // The maxH assignment must NOT subtract BOTTOM_CLEARANCE
    const maxHLine =
      spendingsGridCode.match(/const maxH\s*=\s*[^;]+;/)?.[0] ?? "";
    expect(maxHLine).not.toMatch(/BOTTOM_CLEARANCE/);
  });

  it("R4-B: in-flow tail spacer still present (aria-hidden + env(safe-area-inset-bottom))", () => {
    // All clearance lives in the spacer, not the box formula.
    expect(spendingsGrid).toMatch(/data-grid-tail-spacer/);
    expect(spendingsGrid).toMatch(/aria-hidden/);
    expect(spendingsGrid).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("R4-C: spendings page wrapper uses data-no-page-clearance to opt out of page-level clearance", () => {
    // The spendings page content must carry data-no-page-clearance so the
    // browser floor + pb-shell-safe do NOT dead-strip the inner-scrolling tab.
    expect(spendingsPageCode).toMatch(/data-no-page-clearance/);
    // The wrapper must NOT carry pb-shell-safe (inner scroller, not page scroll).
    expect(spendingsPageCode).not.toMatch(/pb-shell-safe/);
  });

  it("R4-D: global.css zeros page clearances for data-no-page-clearance subtrees in both modes", () => {
    // Standalone: [data-no-page-clearance] or its .pb-shell-safe descendant gets padding-bottom:0
    const standaloneBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(standaloneBlock).toMatch(/data-no-page-clearance/);
    // Browser: main[data-shell-scroll]:has([data-no-page-clearance]) { padding-bottom: 0 }
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).toMatch(/data-no-page-clearance/);
  });

  it("R4-E: browser floor rule still present for non-opted-out pages", () => {
    // The main[data-shell-scroll] floor must still exist.
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).toMatch(
      /main\[data-shell-scroll\][^}]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*(?:6[4-9]|7[0-9]|80)px\)/,
    );
  });

  it("R4-F: home page still has pb-shell-safe (page-scrolling tab clearance retained)", () => {
    expect(homePageR4).toMatch(/pb-shell-safe/);
  });

  it("R4-G: bdp layout.tsx still carries pb-shell-safe on the content wrapper", () => {
    // The wrapper covers ActivePillTaskSlider + page-scrolling tab children.
    expect(bdpLayoutR4).toMatch(/pb-shell-safe/);
  });

  it("R4-H: BUILD_MARKER is SHELL-R14 (not R11/R12/R13)", () => {
    expect(viewportDebugR4).not.toMatch(/SHELL-R11/);
    expect(viewportDebugR4).not.toMatch(/SHELL-R12/);
    expect(viewportDebugR4).not.toMatch(/SHELL-R13/);
    expect(viewportDebugR4).toMatch(/SHELL-R14/);
  });

  it("R4-I: viewport-debug overlay reports pageWrapPadBottom, gridBoxVvDelta, gridSpacerH", () => {
    expect(viewportDebugR4).toMatch(/pageWrapPadBottom/);
    expect(viewportDebugR4).toMatch(/gridBoxVvDelta/);
    expect(viewportDebugR4).toMatch(/gridSpacerH/);
  });

  it("R4-J: grid consumes --grid-max-h as FIXED height (h-, not max-h-)", () => {
    // Live geometry proof (geom-390): with max-h- the box stops short of the
    // vv bottom whenever content height < available space (clientH 639 <
    // maxH 666 → 27px dead band below the box). FIXED height guarantees
    // box bottom == vv bottom regardless of content height — the entire
    // area below the band is the scroll surface.
    expect(spendingsGridCode).toMatch(/(?<!max-)h-\[var\(--grid-max-h/);
    expect(spendingsGridCode).not.toMatch(/max-h-\[var\(--grid-max-h/);
  });
});

describe("Banner placement, grid tail, browser bottom clearance (SHELL-R12 issues #2-5)", () => {
  const bdpLayout = readFileSync(
    resolve(__dirname, "../src/app/[locale]/(app)/budgets/[id]/layout.tsx"),
    "utf8",
  );
  const spendingsGrid = readFileSync(
    resolve(
      __dirname,
      "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
    ),
    "utf8",
  );

  // ── Issue #2: Banner below band ──────────────────────────────────────────
  it("#2: ActivePillTaskSlider is NOT inside [data-bdp-tabs] wrapper", () => {
    // User wants the banner as normal page content BELOW the sticky band,
    // not occluded inside it. Extract the data-bdp-tabs block and assert
    // ActivePillTaskSlider does not appear in it.
    const dataBdpTabsBlock =
      bdpLayout.match(/data-bdp-tabs[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(dataBdpTabsBlock).not.toMatch(/ActivePillTaskSlider/);
  });

  it("#2: ActivePillTaskSlider IS inside the pb-shell-safe content wrapper", () => {
    // After the move it renders as the first child of the content wrapper
    // so it scrolls with the page content, fully visible at rest under the band.
    // Match from the JSX opening tag of the pb-shell-safe div.
    const pbShellBlock =
      bdpLayout.match(/<div className="pb-shell-safe">[\s\S]*?<\/div>/)?.[0] ??
      "";
    expect(pbShellBlock).toMatch(/ActivePillTaskSlider/);
  });

  // ── Issue #3: Grid tail spacer ───────────────────────────────────────────
  it("#3: spendings grid scroll container has an in-flow bottom spacer with env(safe-area-inset-bottom)", () => {
    // iOS WebKit ignores pb-* on scroll containers at end-of-scroll (SHELL-R8..R10).
    // A real aria-hidden sibling spacer child extends scrollHeight.
    expect(spendingsGrid).toMatch(/env\(safe-area-inset-bottom/);
    // Must be an in-flow element, not a container class.
    expect(spendingsGrid).toMatch(/aria-hidden/);
  });

  it("#3: spendings grid no longer uses the stale 176px magic constant", () => {
    // The -176px constant tracked the old band height before the banner moved;
    // replaced with dvh-based formula or a less brittle constant.
    expect(spendingsGrid).not.toMatch(/-176px/);
  });

  // ── Issue #4: Browser bottom clearance ──────────────────────────────────
  it("#4: browser-mode main[data-shell-scroll] padding-bottom floor is >=64px", () => {
    // Safari's bottom bar is ~50px; env≈0 when bar visible → need explicit floor.
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).toMatch(
      /main\[data-shell-scroll\][^}]*padding-bottom:\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*(?:6[4-9]|7[0-9]|80)px\)/,
    );
  });

  // ── Issue #5: Black band ─────────────────────────────────────────────────
  it("#5: browser-mode [data-shell-root] uses 100dvh (not 100lvh) to track dynamic viewport", () => {
    // 100lvh = large viewport (bar hidden); when bar shown the shell extends
    // past the visible area → dead band. 100dvh tracks the small/visible area.
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).not.toMatch(
      /\[data-shell-root\][^}]*min-height:\s*100lvh/,
    );
    expect(browserBlock).toMatch(
      /\[data-shell-root\][^}]*min-height:\s*100dvh/,
    );
  });

  it("#5: standalone base 100lvh rule is untouched (dead-band fix must stay)", () => {
    // The standalone locked-body 100lvh is the deliberate dead-band fix — do not touch.
    expect(globalCss).toMatch(/height:\s*100lvh/);
  });
});
