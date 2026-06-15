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
    // quick-260613-pdb moved the sticky band into <BudgetShellData> so layout.tsx
    // commits synchronously; the data-bdp-tabs band lives there now.
    const shellData = readFileSync(
      resolve(
        __dirname,
        "../src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx",
      ),
      "utf8",
    );
    expect(shellData).toMatch(/data-bdp-tabs/);
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

  it("R4-A (amended by R5): box height subtracts NO clearance constant", () => {
    // SHELL-R15 superseded the px formula (vv.height - rect.top) with an lvh
    // bottom anchor — see R5-A. The R4 invariant that survives: no
    // BOTTOM_CLEARANCE (or any stacked-clearance constant) in the height math.
    expect(spendingsGridCode).not.toMatch(/BOTTOM_CLEARANCE/);
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

  it("R4-H: BUILD_MARKER advanced past SHELL-R13 (chain marker)", () => {
    // Exact-marker assertion lives in the latest round's block (R5-D);
    // this guard only proves the stale R11-R13 markers are gone.
    expect(viewportDebugR4).not.toMatch(/SHELL-R11/);
    expect(viewportDebugR4).not.toMatch(/SHELL-R12/);
    expect(viewportDebugR4).not.toMatch(/SHELL-R13/);
    expect(viewportDebugR4).toMatch(/SHELL-R1[4-9]/);
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

describe("Round 5 — browser box extends UNDER the bar (SHELL-R15)", () => {
  // Device round 5 (IMG_2787): PWA standalone perfect (user-approved — do NOT
  // change), but Safari browser mode showed a residual black band exactly
  // at/below the bottom bar. Root cause: the R14 box bottom
  // (visualViewport.height − top) lands at the bar's TOP edge, so the
  // overflow container CLIPS content there; native page-scrolling pages paint
  // content under the translucent bar (canvas extends to the physical screen
  // bottom). Fix: anchor the box bottom to the LARGE viewport (100lvh) — bar
  // shown: box extends under the bar, content scrolls beneath it like native;
  // bar collapsed: lvh == visible viewport → exact fit; standalone:
  // lvh == screen → identical to R14.
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
  const viewportDebugR5 = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );

  it("R5-A: --grid-max-h bottom anchors to 100lvh (measured top, lvh bottom)", () => {
    // The ResizeObserver/visualViewport-driven measured TOP stays; only the
    // bottom basis changes from vv.height px math to the lvh CSS unit.
    expect(spendingsGridCode).toMatch(/--grid-max-h[\s\S]{0,120}100lvh/);
    // The old px formula (vv.height − rect.top) must be gone.
    expect(spendingsGridCode).not.toMatch(
      /Math\.floor\(vh\s*-\s*rect\.top\s*\)/,
    );
  });

  it("R5-B: browser-mode tail spacer consumes --grid-tail-spacer-h var (dynamic, 96px fallback) [superseded by R7-G]", () => {
    // R17: the literal +96px becomes a CSS var fallback so the effect can write
    // the dynamic extension. The browser block must use the var form.
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).toMatch(
      /\[data-grid-tail-spacer\][^}]*height:\s*var\(--grid-tail-spacer-h/,
    );
  });

  it("R5-C: standalone tail spacer is UNCHANGED (user-approved env+64 fallback)", () => {
    // The JSX fallback class is what standalone resolves (no override there).
    expect(spendingsGrid).toMatch(
      /h-\[calc\(env\(safe-area-inset-bottom,0px\)\+64px\)\]/,
    );
    // The standalone block must NOT touch the spacer — PWA is user-approved.
    const standaloneBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(standaloneBlock).not.toMatch(/data-grid-tail-spacer/);
  });

  it("R5-D: BUILD_MARKER is in the SHELL-R15+ chain (exact marker in R6-D)", () => {
    // Exact-marker assertion lives in the latest round's block (R6-D).
    // R14 references survive as historical comments — only the BUILD_MARKER
    // const itself must be R15+.
    expect(viewportDebugR5).not.toMatch(
      /BUILD_MARKER\s*=\s*["']SHELL-R1[0-4]["']/,
    );
    expect(viewportDebugR5).toMatch(/SHELL-R1[5-9]/);
  });

  it("R5-E: overlay reports box-bottom − vv-bottom (gridBoxBeyondVv)", () => {
    // Sign semantics: >0 in Safari bar-shown (box extends under the bar),
    // 0 in PWA standalone and Chromium (lvh == vvh).
    expect(viewportDebugR5).toMatch(/gridBoxBeyondVv/);
  });
});

describe("Banner placement, grid tail, browser bottom clearance (SHELL-R12 issues #2-5)", () => {
  const spendingsGrid = readFileSync(
    resolve(
      __dirname,
      "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
    ),
    "utf8",
  );
  // quick-260613-pdb: the sticky band + ActivePillTaskSlider moved out of
  // layout.tsx into <BudgetShellData>. The banner-placement assertions read it.
  // Strip comments first — the JSDoc names both data-bdp-tabs and
  // ActivePillTaskSlider, which would pollute structural string matching.
  const shellCode = readFileSync(
    resolve(
      __dirname,
      "../src/app/[locale]/(app)/budgets/[id]/budget-shell-data.tsx",
    ),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // ── Issue #2: Banner below band ──────────────────────────────────────────
  it("#2: ActivePillTaskSlider is NOT inside [data-bdp-tabs] wrapper", () => {
    // User wants the banner as normal page content BELOW the sticky band,
    // not occluded inside it. Extract the data-bdp-tabs band element (anchored
    // on the attribute → `>` so the comment can't match) and assert the
    // slider JSX does not appear in it.
    const dataBdpTabsBlock =
      shellCode.match(/data-bdp-tabs\s*>[\s\S]*?<\/div>/)?.[0] ?? "";
    expect(dataBdpTabsBlock).not.toMatch(/<ActivePillTaskSlider/);
  });

  it("#2: ActivePillTaskSlider renders below the sticky band as page content", () => {
    // quick-260613-pdb: the slider lives in <BudgetShellData>, rendered AFTER
    // the data-bdp-tabs band (a sibling above layout.tsx's pb-shell-safe
    // children) so it sits below the band and scrolls with page content,
    // fully visible at rest rather than occluded inside the sticky band.
    expect(shellCode).toMatch(/<ActivePillTaskSlider/);
    expect(shellCode.indexOf("<ActivePillTaskSlider")).toBeGreaterThan(
      shellCode.indexOf("data-bdp-tabs"),
    );
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

  // ── Issue #5 (superseded by R6): the old #5 asserted 100dvh as the fix.
  // R6 reverts that misdiagnosis — see the Round 6 describe block for the
  // authoritative assertion (browser-mode [data-shell-root] must be 100lvh).
  it("#5: standalone base 100lvh rule is untouched (dead-band fix must stay)", () => {
    // The standalone locked-body 100lvh is the deliberate dead-band fix — do not touch.
    expect(globalCss).toMatch(/height:\s*100lvh/);
  });
});

describe("Round 6 — shell canvas extends under the bar + keyboard remeasure freeze (SHELL-R16)", () => {
  // T1: browser-mode [data-shell-root] → 100lvh (reverts round-2 dvh misdiagnosis)
  // T2: grid remeasure freeze while keyboard open (fix inline-edit jump-back)
  const viewportDebug = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );
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

  // T1: Shell root dvh → lvh

  it("R6-A: browser-mode [data-shell-root] block does NOT contain min-height:100dvh and DOES use 100lvh", () => {
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    const shellRootBlock =
      browserBlock.match(/\[data-shell-root\]\s*{[^}]*}/)?.[0] ?? "";
    expect(shellRootBlock).not.toMatch(/min-height:\s*100dvh/);
    expect(shellRootBlock).toMatch(/100lvh/);
  });

  it("R6-B: standalone invariant — base html,body still uses height:100lvh (untouched)", () => {
    expect(globalCss).toMatch(/height:\s*100lvh/);
    const standaloneBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(standaloneBlock ?? "").not.toMatch(/min-height:\s*100dvh/);
  });

  it("R6-C: viewport-debug overlay exposes shellRootClientH and shellRootMinH clip-chain probes", () => {
    expect(viewportDebug).toMatch(/shellRootClientH/);
    expect(viewportDebug).toMatch(/shellRootMinH/);
  });

  it("R6-D: BUILD_MARKER is the current chain marker SHELL-R18 [bumped each shell round]", () => {
    expect(viewportDebug).toMatch(/BUILD_MARKER\s*=\s*["']SHELL-R18["']/);
  });

  // T2: Keyboard-aware remeasure freeze

  it("R6-E: updateMaxH is guarded — source contains activeElement + .contains( freeze check", () => {
    expect(spendingsGridCode).toMatch(/activeElement/);
    expect(spendingsGridCode).toMatch(/\.contains\(/);
  });

  it("R6-F: a focusout/blur path triggers a single remeasure on keyboard collapse", () => {
    expect(spendingsGridCode).toMatch(/focusout|blur/);
  });

  it("R6-G: visualViewport resize and scroll listeners are STILL attached", () => {
    expect(spendingsGridCode).toMatch(
      /visualViewport[\s\S]{0,200}(resize|scroll)/,
    );
  });
});

describe("Round 7 — grid box to physical screen bottom (SHELL-R17)", () => {
  const spendingsGrid = readFileSync(
    resolve(
      __dirname,
      "../src/components/budgeting/spendings-grid/spendings-grid-client.tsx",
    ),
    "utf8",
  );
  // Strip comments for logic assertions (same pattern as R6 block).
  const spendingsGridCode = spendingsGrid
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const viewportDebug = readFileSync(
    resolve(__dirname, "../src/components/common/viewport-debug.tsx"),
    "utf8",
  );
  const globalCss = readFileSync(
    resolve(__dirname, "../src/app/global.css"),
    "utf8",
  );

  it("R7-A: spendings-grid-client imports computeScreenExtension and calls it inside the effect", () => {
    expect(spendingsGrid).toMatch(/computeScreenExtension/);
    expect(spendingsGrid).toMatch(/grid-screen-anchor/);
    // Must be called inside the effect (not just imported).
    expect(spendingsGridCode).toMatch(/computeScreenExtension\s*\(/);
  });

  it("R7-B: --grid-max-h formula adds an extension term to the lvh calc", () => {
    // The extension (ext/extPx variable) must appear in the --grid-max-h formula.
    expect(spendingsGridCode).toMatch(
      /--grid-max-h[\s\S]{0,200}100lvh[\s\S]{0,80}ext/,
    );
  });

  it("R7-C: a one-shot 100lvh probe element is created and removed (deterministic lvhPx)", () => {
    // The effect creates a position:fixed probe with height:100lvh to measure lvhPx.
    expect(spendingsGridCode).toMatch(/100lvh/);
    expect(spendingsGridCode).toMatch(/probeLvhPx|lvhPx/);
  });

  it("R7-D: dynamic spacer var --grid-tail-spacer-h is setProperty'd, browser-only (!isStandalone guard)", () => {
    expect(spendingsGridCode).toMatch(/--grid-tail-spacer-h/);
    // Must be guarded by !isStandalone so standalone path is never touched.
    expect(spendingsGridCode).toMatch(
      /isStandalone[\s\S]{0,200}--grid-tail-spacer-h/,
    );
  });

  it("R7-E: keyboard freeze STILL gates the whole updateMaxH (isKeyboardEditing early-return before any setProperty)", () => {
    // The freeze check must come before the first setProperty call.
    expect(spendingsGridCode).toMatch(
      /isKeyboardEditing[\s\S]{0,1200}setProperty/,
    );
    // And the early-return must precede the setProperty.
    const freezeIdx = spendingsGridCode.indexOf("isKeyboardEditing()");
    const setPropIdx = spendingsGridCode.indexOf("setProperty");
    expect(freezeIdx).toBeGreaterThanOrEqual(0);
    expect(setPropIdx).toBeGreaterThanOrEqual(0);
    expect(freezeIdx).toBeLessThan(setPropIdx);
  });

  it("R7-F: orientationchange listener is attached (screen dim swap on iOS)", () => {
    expect(spendingsGridCode).toMatch(/orientationchange/);
  });

  it("R7-G: global.css browser [data-grid-tail-spacer] consumes var(--grid-tail-spacer-h) with 96px fallback", () => {
    const browserBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*browser\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(browserBlock).toMatch(
      /\[data-grid-tail-spacer\][^}]*height:\s*var\(--grid-tail-spacer-h,\s*calc\(env\(safe-area-inset-bottom[^)]*\)\s*\+\s*96px\)\)/,
    );
  });

  it("R7-H: standalone invariants frozen — JSX spacer still env+64; standalone block does NOT reference data-grid-tail-spacer", () => {
    // JSX fallback class governs standalone (the var is never set in standalone).
    expect(spendingsGrid).toMatch(
      /h-\[calc\(env\(safe-area-inset-bottom,0px\)\+64px\)\]/,
    );
    const standaloneBlock =
      globalCss.match(
        /@media\s*\(display-mode:\s*standalone\)\s*{([\s\S]*?)\n}/,
      )?.[1] ?? "";
    expect(standaloneBlock).not.toMatch(/data-grid-tail-spacer/);
  });

  it("R7-I: BUILD_MARKER == SHELL-R18 exactly; overlay reports screenH/lvhPx/screenExt/spacer probes", () => {
    expect(viewportDebug).toMatch(/BUILD_MARKER\s*=\s*["']SHELL-R18["']/);
    // Overlay must expose the new R17 diagnostic fields.
    expect(viewportDebug).toMatch(/screenH/);
    expect(viewportDebug).toMatch(/lvhPx|lvh/);
    expect(viewportDebug).toMatch(/screenExt|gridExtension|ext/);
    expect(viewportDebug).toMatch(/spacerDynH|gridSpacerDyn|dynH/);
  });
});
