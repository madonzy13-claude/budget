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
      // A zero reading means one of two opposite things, and they have to be
      // told apart:
      //
      //  • PORTRAIT — iOS has not resolved the inset yet (the cold-launch
      //    frames this island exists for). Writing the 0 would produce the
      //    exact 0→59 header drop it was written to kill, so it is ignored.
      //  • LANDSCAPE — the notch is on the SIDE, so 0 is the truth. Ignoring
      //    it left the header padded by the PORTRAIT notch after a rotation:
      //    a ~59px empty band above the app (user, 260823).
      //
      // Orientation is the discriminator, and a physical one: a top inset that
      // large cannot exist on a landscape phone.
      const landscape = window.innerWidth > window.innerHeight;
      if (h > 0 || landscape) {
        document.documentElement.style.setProperty("--safe-top", `${h}px`);
      }
      // Only ever PERSIST a real inset. The stored value pre-paints the next
      // cold launch, which is overwhelmingly portrait; storing a landscape 0
      // would reintroduce the drop on the launch after.
      if (h > 0) {
        try {
          window.localStorage.setItem(SAT_KEY, String(h));
        } catch {
          /* private mode / storage disabled — env() fallback still applies */
        }
      }
    };

    // Measure now and after a frame (the inset can resolve a tick after mount),
    // then keep it current across orientation / viewport changes. iOS does not
    // reliably settle the inset by the time `resize` fires on a rotation, so
    // orientationchange re-measures again a beat later.
    measure();
    const raf = requestAnimationFrame(measure);
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onOrientation = () => {
      measure();
      clearTimeout(settle);
      settle = setTimeout(measure, 300);
    };
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", onOrientation);
    };
  }, []);

  return null;
}
