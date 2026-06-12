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

// Bump per deploy round — a screenshot showing an old marker means the
// device is still serving cached assets, not that the fix failed.
const BUILD_MARKER = "SHELL-R14";

const FLAG_KEY = "vpdbg";

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

  // SHELL-R14: vvBottom − grid box bottom (should be ≈0 after fix).
  const gridBoxVvDelta = Math.round(vvBottom - rect.bottom);

  // SHELL-R14: height of the in-flow tail spacer inside the grid.
  const spacerEl = gridEl.querySelector<HTMLElement>("[data-grid-tail-spacer]");
  const gridSpacerH = spacerEl ? spacerEl.offsetHeight : -1;

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
  return {
    innerH: window.innerHeight,
    vvH: Math.round(window.visualViewport?.height ?? -1),
    docH: document.documentElement.clientHeight,
    bodyH: Math.round(document.body.getBoundingClientRect().height),
    safeTop: probeEnvInset("top"),
    safeBottom: probeEnvInset("bottom"),
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

  useEffect(() => {
    if (!isVpdbgEnabled()) return;
    setEnabled(true);
    const update = () => setMetrics(readMetrics());
    update();
    const id = setInterval(update, 700);
    return () => clearInterval(id);
  }, []);

  if (!enabled || !metrics) return null;

  const m = metrics;
  return (
    <div
      data-testid="viewport-debug"
      className="fixed left-1 top-16 z-[9999] rounded bg-black/85 p-2 font-mono text-[10px] leading-snug text-yellow-300"
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
            boxVvΔ {m.grid.gridBoxVvDelta} · spacer {m.grid.gridSpacerH}
          </div>
          <div>wrapPad {m.grid.pageWrapPadBottom}</div>
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
