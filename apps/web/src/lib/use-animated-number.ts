"use client";
/**
 * use-animated-number.ts — rAF count tween for a single value (UAT round 16 item
 * 1). When `target` changes, smoothly counts from the currently-displayed value
 * to the new one (easeOutCubic), so overview card figures roll up/down when fresh
 * data replaces the cached snapshot — mirroring the reserves "cover" reveal
 * ([[project_reserve_cover_dialog_flake]] uses animate-count.ts for a fixed
 * triple; this is the generic single-value hook).
 *
 * First render shows `target` immediately (no intro animation). SSR / no-rAF env
 * returns `target` verbatim (the effect never runs). Interrupted mid-tween it
 * re-tweens from wherever it currently is, so rapid updates stay smooth.
 */
import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function useAnimatedNumber(target: number, durationMs = 500): number {
  const safe = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(safe);
  const displayRef = useRef(safe);
  displayRef.current = display;
  const rafRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    if (from === safe) return;
    if (typeof requestAnimationFrame !== "function") {
      setDisplay(safe);
      return;
    }
    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const start = now();
    const tick = () => {
      const p = Math.min(1, (now() - start) / durationMs);
      // Float (not rounded) so callers formatting pct/months keep their decimals;
      // at p=1 easeOut=1 → returns `safe` exactly, so the final value is precise.
      setDisplay(from + (safe - from) * easeOutCubic(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [safe, durationMs]);

  return display;
}
