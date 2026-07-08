"use client";
/**
 * safe-area-top-sync.tsx — kills the iOS standalone cold-launch "shell drops from
 * the top" jump.
 *
 * On an installed-PWA cold launch, iOS reports `env(safe-area-inset-top)` as 0 for
 * the first frame(s), then resolves it to the real notch inset — so the shell
 * header (which pads with that inset) grows 0→~59px and shoves the whole page down
 * a beat after first paint. The blank auto-open placeholder used to hide this; the
 * Overview skeleton now paints content into that window, making the drop obvious.
 *
 * Fix (mirrors the offline/theme PRE-PAINT markers in the root layout): once the
 * inset has resolved, persist it to localStorage. The root layout's pre-paint
 * script reads it and sets `--safe-top` on <html> BEFORE first paint, so the
 * header's `padding-top: var(--safe-top, env(...))` is correct from frame 1 on the
 * next launch — no drop. First-ever launch after install still settles once
 * (nothing stored yet); every launch after is stable.
 *
 * Standalone only: browser tabs have inset 0 and must keep the env() fallback, so
 * we never persist/apply there.
 */
import { useEffect } from "react";

const SAT_KEY = "sat";

export function SafeAreaTopSync() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const measure = () => {
      // Probe the resolved inset: a fixed, invisible box sized to the inset.
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const h = Math.round(probe.getBoundingClientRect().height);
      probe.remove();
      if (h > 0) {
        document.documentElement.style.setProperty("--safe-top", `${h}px`);
        try {
          window.localStorage.setItem(SAT_KEY, String(h));
        } catch {
          /* private mode / storage disabled — env() fallback still applies */
        }
      }
    };

    // Measure now and after a frame (the inset can resolve a tick after mount),
    // then keep it current across orientation / viewport changes.
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return null;
}
