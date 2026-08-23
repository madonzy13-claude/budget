"use client";

/**
 * viewport-debug.tsx — UAT-08 on-device viewport diagnostics.
 *
 * Renders only when the URL contains ?vpdbg=1. Shows the numbers needed to
 * diagnose iOS bottom-clipping from a user screenshot: viewport heights,
 * env(safe-area-inset-*) as actually resolved by the engine, display-mode,
 * the shell scroll metrics, and a build marker that exposes stale caches.
 */

import { useEffect, useState } from "react";
import { computeScreenExtension } from "@/lib/grid-screen-anchor";

// Bump per deploy round — a screenshot showing an old marker means the
// device is still serving cached assets, not that the fix failed.
const BUILD_MARKER = "ASSETSALIGN-R1";

const FLAG_KEY = "vpdbg";

// Peak black-gap seen since the overlay turned on. The bug is TRANSIENT —
// the black band flashes for a few frames while the Safari toolbar collapses
// during a range-strip swipe, then heals. A 700ms poll snapshot almost never
// lands on that frame, so we also track the worst gap ever observed. A large
// peakGap with a currently-small live gap is the signature of the bug.
let peakBottomGap = 0;
let peakShellGap = 0;

/**
 * Persist the vpdbg flag from a URL search string. Standalone PWA has no URL
 * bar and its localStorage is separate from Safari's — the only way in is a
 * deep link (e.g. a push notification url) carrying ?vpdbg=1. Persisting means
 * the overlay is already on at the NEXT cold start, which is required to
 * observe first-touch-after-reload bugs. ?vpdbg=0 switches it back off.
 */
export function persistVpdbgFromUrl(search: string): void {
  try {
    const v = new URLSearchParams(search).get(FLAG_KEY);
    if (v === "1" || v === "0") localStorage.setItem(FLAG_KEY, v);
  } catch {
    /* storage unavailable — overlay just won't persist */
  }
}

export function isVpdbgEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("vpdbg=1")) return true;
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleVpdbg(): boolean {
  try {
    const next = localStorage.getItem(FLAG_KEY) === "1" ? "0" : "1";
    localStorage.setItem(FLAG_KEY, next);
    return next === "1";
  } catch {
    return false;
  }
}

interface SheetMetrics {
  rectTop: number;
  rectBottom: number;
  rectHeight: number;
  vvOffsetTop: number;
  vvHeight: number;
  vvScale: number;
  safeTop: number;
  safeBottom: number;
  activeElement: string;
  ancestorTransforms: string;
}

interface GridMetrics {
  gridTop: number;
  gridClientH: number;
  gridScrollH: number;
  gridScrollTop: number;
  gridMaxH: string;
  gridToEnd: number;
  gridLastRowGap: number;
  // SHELL-R14 new metrics
  pageWrapPadBottom: string;
  gridBoxVvDelta: number;
  gridSpacerH: number;
  // SHELL-R15: box-bottom − vv-bottom. >0 in Safari bar-shown (box extends
  // under the bar — lvh anchor working), 0 in PWA standalone and Chromium.
  gridBoxBeyondVv: number;
  // SHELL-R17: screen-anchor extension fields.
  screenH: number;
  lvhPx: number;
  screenExt: number;
  spacerDynH: number;
}

/**
 * The OVERVIEW's own inner scroller (`data-testid="overview-tab"`), which the
 * grid probe never saw. Every black-band round on this box has been diagnosed
 * from a device screenshot, and until R2 the screenshot said nothing about it.
 */
interface OverviewMetrics {
  ovTop: number;
  ovMaxH: string;
  ovClientH: number;
  ovScrollH: number;
  /** window bottom − box bottom. >0 = black strip under the box (the bug). */
  ovBoxGap: number;
  /** …the same against the VISUAL viewport, which is the one that disagreed. */
  ovBoxVvGap: number;
  /** The two candidate fills, side by side: layout vs visual. */
  ovLayoutH: number;
  ovVisualH: number;
  ovSpacerH: number;
}

/**
 * The Assets tab's currency column: where the section header's code sits versus
 * the first row's. They measured identical in Chromium touch emulation and were
 * visibly apart on device — the real picker renders a native <select> whose
 * min-content width can push its cell wider than the class says, and only the
 * device shows that. Reports both text origins and both cell widths so the
 * difference is a number, not a guess (260823).
 */
interface AssetsMetrics {
  ccyHeaderX: number;
  ccyRowX: number;
  ccyDelta: number;
  ccyHeaderW: number;
  ccyRowW: number;
}

interface Metrics {
  innerH: number;
  vvH: number;
  docH: number;
  bodyH: number;
  safeTop: number;
  safeBottom: number;
  displayMode: string;
  afterH: string;
  mainClientH: number;
  mainScrollH: number;
  mainScrollTop: number;
  lastRowGap: number;
  // SHELL-R16: clip-chain probes — shell root + ptr-blur ancestor heights
  shellRootClientH: number;
  shellRootMinH: string;
  ptrBlurClientH: number;
  // SHELL-R18: scroll-root diagnostics (browser vs standalone)
  winScrollY: number;
  scrollingElTop: number;
  // SHELL-R19: visual-viewport pan + focused-element probes (wallet-edit jump)
  vvOff: number;
  activeTag: string;
  activeTop: number;
  // SHELL-R18: month-nav vs sticky band occlusion probe
  monthNavTop: number;
  bandBottom: number;
  monthNavUnderBand: number; // >0 = OCCLUDED (the bug); <=0 = clear
  // BLACKAREA-R1: bottom-of-screen black band probe (range-strip swipe bug).
  // bottomGap = innerH − vvH: dead space left when the Safari toolbar collapses
  //   (visual viewport grows past the layout viewport the fixed shell is sized to).
  // shellGap = vvBottom − shellRoot.bottom: black canvas visible BELOW the app's
  //   painted content. >0 means the shell falls short of the viewport = black band.
  // peak* : worst value seen since the overlay turned on (catches the flash).
  bottomGap: number;
  shellGap: number;
  peakBottomGap: number;
  peakShellGap: number;
  sheet: SheetMetrics | null;
  grid: GridMetrics | null;
  overview: OverviewMetrics | null;
  assets: AssetsMetrics | null;
}

/** x of the first non-empty TEXT inside an element — the glyph origin the eye
 *  compares, not the box the class asks for. */
function textX(el: Element | null): number {
  if (!el) return -1;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null = walk.nextNode();
  while (n && !n.textContent?.trim()) n = walk.nextNode();
  if (!n) return -1;
  const r = document.createRange();
  r.selectNodeContents(n);
  return Math.round(r.getBoundingClientRect().x);
}

function probeAssetsMetrics(): AssetsMetrics | null {
  const header = document.querySelector<HTMLElement>(
    '[data-testid^="section-total-currency-"]',
  );
  if (!header) return null;
  const type = header
    .getAttribute("data-testid")!
    .replace("section-total-currency-", "");
  const rowCell = document.querySelector<HTMLElement>(
    `[data-testid="wallet-section-${type}"] [data-nav-field="currency"]`,
  );
  const h = textX(header);
  const r = textX(rowCell);
  return {
    ccyHeaderX: h,
    ccyRowX: r,
    ccyDelta: h >= 0 && r >= 0 ? h - r : -1,
    ccyHeaderW: Math.round(header.getBoundingClientRect().width),
    ccyRowW: rowCell ? Math.round(rowCell.getBoundingClientRect().width) : -1,
  };
}

function probeOverviewMetrics(): OverviewMetrics | null {
  const box = document.querySelector<HTMLElement>(
    '[data-testid="overview-tab"]',
  );
  if (!box) return null;
  const rect = box.getBoundingClientRect();
  const vv = window.visualViewport;
  const vvBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
  const spacer = box.querySelector<HTMLElement>("[data-grid-tail-spacer]");
  return {
    ovTop: Math.round(rect.top),
    // Consumed as a FIXED height (h-, not max-h-), so computed maxHeight reads
    // "none" — report the var the effect actually wrote.
    ovMaxH: box.style.getPropertyValue("--grid-max-h") || "(unset)",
    ovClientH: box.clientHeight,
    ovScrollH: box.scrollHeight,
    ovBoxGap: Math.round(window.innerHeight - rect.bottom),
    ovBoxVvGap: Math.round(vvBottom - rect.bottom),
    ovLayoutH: document.documentElement.clientHeight,
    ovVisualH: Math.round((vv?.height ?? 0) * (vv?.scale || 1)),
    ovSpacerH: spacer ? spacer.offsetHeight : -1,
  };
}

function probeEnvInset(side: "top" | "bottom"): number {
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.paddingTop = `env(safe-area-inset-${side})`;
  document.body.appendChild(el);
  const v = parseFloat(getComputedStyle(el).paddingTop) || 0;
  el.remove();
  return v;
}

function probeOpenSheet(): SheetMetrics | null {
  const sheetEl = document.querySelector<HTMLElement>("[data-sheet-content]");
  if (!sheetEl) return null;

  const rect = sheetEl.getBoundingClientRect();
  const vv = window.visualViewport;

  // Walk ancestor chain to collect any non-none transform/filter/contain.
  const transforms: string[] = [];
  let el: HTMLElement | null = sheetEl.parentElement;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const t = cs.transform;
    const f = cs.filter;
    const c = cs.contain;
    if (t && t !== "none") transforms.push(`transform:${t}`);
    if (f && f !== "none") transforms.push(`filter:${f}`);
    if (c && c !== "none") transforms.push(`contain:${c}`);
    el = el.parentElement;
  }

  return {
    rectTop: Math.round(rect.top),
    rectBottom: Math.round(rect.bottom),
    rectHeight: Math.round(rect.height),
    vvOffsetTop: Math.round(vv?.offsetTop ?? -1),
    vvHeight: Math.round(vv?.height ?? -1),
    vvScale: vv?.scale ?? -1,
    safeTop: probeEnvInset("top"),
    safeBottom: probeEnvInset("bottom"),
    activeElement: document.activeElement?.tagName ?? "none",
    ancestorTransforms: transforms.join("; ") || "none",
  };
}

function probeGridMetrics(): GridMetrics | null {
  const gridEl = document.querySelector<HTMLElement>(
    '[data-testid="spendings-grid"]',
  );
  if (!gridEl) return null;

  const rect = gridEl.getBoundingClientRect();
  const vvBottom =
    (window.visualViewport?.offsetTop ?? 0) +
    (window.visualViewport?.height ?? window.innerHeight);

  // Walk interactive elements inside the grid to find the deepest one visible.
  // Transaction AND draft rows are div[role="row"] (NOT button/li/a) — without
  // [role="row"] the probe only sees the sticky header band (~215px).
  let deepestBottom = -1;
  gridEl.querySelectorAll('button, li, a, [role="row"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom > deepestBottom) deepestBottom = r.bottom;
  });
  const gridLastRowGap =
    deepestBottom >= 0 ? Math.round(vvBottom - deepestBottom) : -1;

  // SHELL-R14: page-wrapper computed padding-bottom (nearest .pb-shell-safe
  // or [data-no-page-clearance] ancestor).
  let pageWrapPadBottom = "n/a";
  let el2: HTMLElement | null = gridEl.parentElement;
  while (el2 && el2 !== document.body) {
    const cs = getComputedStyle(el2);
    if (
      el2.classList.contains("pb-shell-safe") ||
      el2.hasAttribute("data-no-page-clearance")
    ) {
      pageWrapPadBottom = cs.paddingBottom;
      break;
    }
    el2 = el2.parentElement;
  }

  // SHELL-R14: vvBottom − grid box bottom (≈0 = box not falling short).
  const gridBoxVvDelta = Math.round(vvBottom - rect.bottom);

  // SHELL-R15: box bottom − vvBottom (positive = box extends UNDER the bar).
  const gridBoxBeyondVv = Math.round(rect.bottom - vvBottom);

  // SHELL-R14: height of the in-flow tail spacer inside the grid.
  const spacerEl = gridEl.querySelector<HTMLElement>("[data-grid-tail-spacer]");
  const gridSpacerH = spacerEl ? spacerEl.offsetHeight : -1;

  // SHELL-R17: screen-anchor diagnostics — probe lvhPx and compute the exact
  // extension the effect is using so the overlay shows the REAL value.
  function probeLvhPxDebug(): number {
    const p = document.createElement("div");
    p.style.position = "fixed";
    p.style.top = "0";
    p.style.left = "0";
    p.style.height = "100lvh";
    p.style.width = "0";
    p.style.visibility = "hidden";
    document.body.appendChild(p);
    const v = Math.round(p.getBoundingClientRect().height) || 0;
    p.remove();
    return v;
  }
  const lvhPx = probeLvhPxDebug();
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  const screenH = portrait ? window.screen.height : window.screen.width;
  const screenExt = computeScreenExtension({
    screenH,
    lvhPx,
    isCoarsePointer: isCoarse,
    isIOS,
  });
  // spacerDynH == gridSpacerH (both read spacerEl.offsetHeight); kept as
  // a named alias so R7-I regex matches the field name in the interface.
  const spacerDynH = gridSpacerH;

  return {
    gridTop: Math.round(rect.top),
    gridClientH: gridEl.clientHeight,
    gridScrollH: gridEl.scrollHeight,
    gridScrollTop: Math.round(gridEl.scrollTop),
    // SHELL-R14: the var is consumed as FIXED height (h-, not max-h-), so
    // computed maxHeight is "none" — report the effect-written var instead.
    gridMaxH: gridEl.style.getPropertyValue("--grid-max-h") || "(unset)",
    gridToEnd: gridEl.scrollHeight - gridEl.clientHeight - gridEl.scrollTop,
    gridLastRowGap,
    pageWrapPadBottom,
    gridBoxVvDelta,
    gridSpacerH,
    gridBoxBeyondVv,
    screenH,
    lvhPx,
    screenExt,
    spacerDynH,
  };
}

function readMetrics(): Metrics {
  const main = document.querySelector("main[data-shell-scroll]");
  let lastRowGap = NaN;
  if (main) {
    let deepest = -1;
    main.querySelectorAll("button, li, a").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.bottom > deepest) deepest = r.bottom;
    });
    lastRowGap = Math.round(window.innerHeight - deepest);
  }
  // SHELL-R16: clip-chain probes
  const shellRootEl = document.querySelector<HTMLElement>("[data-shell-root]");
  const ptrBlurEl = document.querySelector<HTMLElement>(
    "[data-ptr-blur-target]",
  );

  // SHELL-R18: scroll-root diagnostics — which root holds scroll in each mode.
  const winScrollY = Math.round(window.scrollY);
  const scrollingElTop = Math.round(
    (document.scrollingElement as HTMLElement | null)?.scrollTop ?? -1,
  );

  // SHELL-R19: is the jump a visual-viewport PAN (vvOff > 0) or a real scroll
  // of <main> (mainScrollTop grows)? Plus where the focused element actually
  // sits — activeTop far outside [0, vvH] means the edited input left the view.
  const vvOff = Math.round(window.visualViewport?.offsetTop ?? -1);
  const activeEl = document.activeElement as HTMLElement | null;
  const activeTag =
    activeEl && activeEl !== document.body ? activeEl.tagName : "none";
  const activeTop =
    activeEl && activeEl !== document.body
      ? Math.round(activeEl.getBoundingClientRect().top)
      : NaN;

  // SHELL-R18: month-nav vs sticky band occlusion probe.
  // monthNavUnderBand > 0 means the nav is hidden under the band (the bug).
  // Reports -1 when elements are absent (e.g. not on the spendings tab).
  let monthNavTop = -1;
  let bandBottom = -1;
  let monthNavUnderBand = -1;
  const monthNavEl = document.querySelector<HTMLElement>(
    '[data-testid="month-navigator-label"]',
  );
  const bandEl = document.querySelector<HTMLElement>("[data-bdp-tabs]");
  if (monthNavEl && bandEl) {
    monthNavTop = Math.round(monthNavEl.getBoundingClientRect().top);
    bandBottom = Math.round(bandEl.getBoundingClientRect().bottom);
    monthNavUnderBand = bandBottom - monthNavTop; // >0 = occluded
  }

  // BLACKAREA-R1: bottom black-band probe. Works on ANY page (overview,
  // all-budgets, spendings) — probes the outermost shell wrapper, not a
  // tab-specific element.
  const innerHNow = window.innerHeight;
  const vvHNow = Math.round(window.visualViewport?.height ?? innerHNow);
  const vvBottomNow =
    Math.round(window.visualViewport?.offsetTop ?? 0) + vvHNow;
  const bottomGap = innerHNow - vvHNow; // >0 = toolbar collapsed, dead space
  const shellEl =
    document.querySelector<HTMLElement>("[data-shell-root]") ??
    document.querySelector<HTMLElement>("main[data-shell-scroll]");
  const shellGap = shellEl
    ? Math.round(vvBottomNow - shellEl.getBoundingClientRect().bottom)
    : -1;
  if (bottomGap > peakBottomGap) peakBottomGap = bottomGap;
  if (shellGap > peakShellGap) peakShellGap = shellGap;

  return {
    innerH: window.innerHeight,
    vvH: Math.round(window.visualViewport?.height ?? -1),
    docH: document.documentElement.clientHeight,
    bodyH: Math.round(document.body.getBoundingClientRect().height),
    safeTop: probeEnvInset("top"),
    safeBottom: probeEnvInset("bottom"),
    vvOff,
    activeTag,
    activeTop,
    shellRootClientH: shellRootEl?.clientHeight ?? -1,
    shellRootMinH: shellRootEl
      ? getComputedStyle(shellRootEl).minHeight
      : "n/a",
    ptrBlurClientH: ptrBlurEl?.clientHeight ?? -1,
    winScrollY,
    scrollingElTop,
    monthNavTop,
    bandBottom,
    monthNavUnderBand,
    bottomGap,
    shellGap,
    peakBottomGap,
    peakShellGap,
    displayMode:
      ["standalone", "browser", "minimal-ui", "fullscreen"].find(
        (m) => window.matchMedia(`(display-mode: ${m})`).matches,
      ) ??
      ((window.navigator as { standalone?: boolean }).standalone
        ? "legacy-standalone"
        : "none"),
    afterH: (() => {
      const padded = document.querySelector<HTMLElement>(".pb-shell-safe");
      return padded
        ? getComputedStyle(padded).paddingBottom
        : "no-pb-shell-safe";
    })(),
    mainClientH: main?.clientHeight ?? -1,
    mainScrollH: main?.scrollHeight ?? -1,
    mainScrollTop: Math.round((main as HTMLElement)?.scrollTop ?? -1),
    lastRowGap,
    sheet: probeOpenSheet(),
    grid: probeGridMetrics(),
    overview: probeOverviewMetrics(),
    assets: probeAssetsMetrics(),
  };
}

export function ViewportDebug() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [enabled, setEnabled] = useState(false);

  // Hidden toggle: 1.2s hold on an EMPTY spot of the <header> flips the
  // persisted flag (push deep-links proved unreliable on device; standalone
  // has no URL bar). Interactive children (links, buttons, inputs) are
  // excluded so normal header use can never trigger it.
  // Hidden toggle: 13 RAPID taps on the profile-menu trigger flip the
  // persisted flag (push deep-links proved unreliable on device; standalone
  // has no URL bar). Gap > 800ms between taps resets the chain — the count is
  // deliberately absurd so it can never fire accidentally.
  useEffect(() => {
    let count = 0;
    let lastTap = 0;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('[data-testid="profile-menu-trigger"]')) return;
      const now = Date.now();
      count = now - lastTap <= 800 ? count + 1 : 1;
      lastTap = now;
      if (count >= 13) {
        count = 0;
        const on = toggleVpdbg();
        setEnabled(on);
        if (!on) setMetrics(null);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    // Runs unconditionally so a deep link carrying ?vpdbg=1/0 flips the
    // persisted flag even while the overlay is currently off.
    persistVpdbgFromUrl(window.location.search);
    if (isVpdbgEnabled()) setEnabled(true);
  }, []);

  // Polling runs whenever the overlay is on — including when the long-press
  // gesture enables it long after mount.
  useEffect(() => {
    if (!enabled) return;
    // Fresh peak baseline per recording session.
    peakBottomGap = 0;
    peakShellGap = 0;
    const update = () => setMetrics(readMetrics());
    update();
    const id = setInterval(update, 700);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled || !metrics) return null;

  const m = metrics;
  return (
    <div
      data-testid="viewport-debug"
      // pointer-events-none: the overlay is read-only — every tap falls
      // through to the UI beneath, so it can never block navigation.
      // top-32 clears the header (64px) + BDP pill band so both stay tappable
      // visually too.
      className="pointer-events-none fixed left-1 top-32 z-[9999] rounded bg-black/85 p-2 font-mono text-[10px] leading-snug text-yellow-300"
    >
      <div>{BUILD_MARKER}</div>
      <div
        className="my-1 rounded border border-red-400/60 bg-red-500/20 px-1 py-0.5 text-red-200"
        data-testid="viewport-debug-blackarea"
      >
        <div className="font-bold">[black-area]</div>
        <div>
          gap {m.bottomGap} (peak {m.peakBottomGap})
        </div>
        <div>
          shellGap {m.shellGap} (peak {m.peakShellGap})
        </div>
      </div>
      <div>
        innerH {m.innerH} · vvH {m.vvH}
      </div>
      <div>
        docH {m.docH} · bodyH {m.bodyH}
      </div>
      <div>
        safeTop {m.safeTop} · safeBottom {m.safeBottom}
      </div>
      <div>
        mode {m.displayMode} · afterH {m.afterH}
      </div>
      <div>
        main {m.mainClientH}/{m.mainScrollH} top {m.mainScrollTop}
      </div>
      <div>
        toEnd {m.mainScrollH - m.mainClientH - m.mainScrollTop} · lastRowGap{" "}
        {m.lastRowGap}
      </div>
      <div>
        winY {m.winScrollY} · seTop {m.scrollingElTop} · mainTop{" "}
        {m.mainScrollTop}
      </div>
      <div>
        vvOff {m.vvOff} · active {m.activeTag} top {m.activeTop}
      </div>
      <div>
        navTop {m.monthNavTop} · bandBot {m.bandBottom} · under{" "}
        {m.monthNavUnderBand}
      </div>
      <div>
        shellRootClientH {m.shellRootClientH} · shellRootMinH {m.shellRootMinH}
      </div>
      <div>ptrBlurClientH {m.ptrBlurClientH}</div>
      {m.assets && (
        <>
          <div className="mt-1 border-t border-yellow-600/40 pt-1 text-yellow-200">
            [assets ccy]
          </div>
          <div>
            headerX {m.assets.ccyHeaderX} · rowX {m.assets.ccyRowX} · delta{" "}
            {m.assets.ccyDelta}
          </div>
          <div>
            headerW {m.assets.ccyHeaderW} · rowW {m.assets.ccyRowW}
          </div>
        </>
      )}
      {m.overview && (
        <>
          <div className="mt-1 border-t border-yellow-600/40 pt-1 text-yellow-200">
            [overview]
          </div>
          <div>
            top {m.overview.ovTop} · maxH {m.overview.ovMaxH}
          </div>
          <div>
            client {m.overview.ovClientH} / scroll {m.overview.ovScrollH} ·
            spacer {m.overview.ovSpacerH}
          </div>
          <div>
            boxGap {m.overview.ovBoxGap} · boxVvGap {m.overview.ovBoxVvGap}
          </div>
          <div>
            layoutH {m.overview.ovLayoutH} · visualH {m.overview.ovVisualH}
          </div>
        </>
      )}
      {m.grid && (
        <>
          <div className="mt-1 border-t border-yellow-600/40 pt-1 text-yellow-200">
            [grid]
          </div>
          <div>
            top {m.grid.gridTop} · maxH {m.grid.gridMaxH}
          </div>
          <div>
            client {m.grid.gridClientH} / scroll {m.grid.gridScrollH} st{" "}
            {m.grid.gridScrollTop}
          </div>
          <div>
            toEnd {m.grid.gridToEnd} · gridLastRowGap {m.grid.gridLastRowGap}
          </div>
          <div>
            boxVvΔ {m.grid.gridBoxVvDelta} · beyondVv {m.grid.gridBoxBeyondVv} ·
            spacer {m.grid.gridSpacerH}
          </div>
          <div>wrapPad {m.grid.pageWrapPadBottom}</div>
          <div>
            screenH {m.grid.screenH} · lvh {m.grid.lvhPx} · ext{" "}
            {m.grid.screenExt} · dynH {m.grid.spacerDynH}
          </div>
        </>
      )}
      {m.sheet && (
        <>
          <div className="mt-1 border-t border-yellow-600/40 pt-1 text-yellow-200">
            [sheet open]
          </div>
          <div>
            rect {m.sheet.rectTop}↑ {m.sheet.rectBottom}↓ h{m.sheet.rectHeight}
          </div>
          <div>
            vv offset {m.sheet.vvOffsetTop} h {m.sheet.vvHeight} scale{" "}
            {m.sheet.vvScale}
          </div>
          <div>
            safe ↑{m.sheet.safeTop} ↓{m.sheet.safeBottom} · active{" "}
            {m.sheet.activeElement}
          </div>
          <div>anc: {m.sheet.ancestorTransforms}</div>
        </>
      )}
    </div>
  );
}
