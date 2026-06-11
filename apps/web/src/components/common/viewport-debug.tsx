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
const BUILD_MARKER = "SHELL-R10";

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
      const spacer = document.querySelector<HTMLElement>(
        "[data-shell-bottom-spacer]",
      );
      // offsetHeight = real layout truth (computed style lied on iOS ::after)
      return spacer ? `${spacer.offsetHeight}px` : "no-spacer";
    })(),
    mainClientH: main?.clientHeight ?? -1,
    mainScrollH: main?.scrollHeight ?? -1,
    mainScrollTop: Math.round((main as HTMLElement)?.scrollTop ?? -1),
    lastRowGap,
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
    </div>
  );
}
