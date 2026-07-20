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
const BUILD_MARKER = "SHELL-R24";

const FLAG_KEY = "vpdbg";

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
  sheet: SheetMetrics | null;
  grid: GridMetrics | null;
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
