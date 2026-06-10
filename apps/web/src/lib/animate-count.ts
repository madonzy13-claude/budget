/**
 * animate-count.ts — tiny rAF tween for the reserve "cover" reveal (no dep).
 *
 * When an adjust's added reserve is partly consumed covering this month's
 * overspend, the reserves tab counts three integer-cents values from their
 * pre-settle (`from`) to their settled (`to`) values so the user SEES the
 * reduction instead of a silent snap:
 *   available      — the category's Available cell        (counts DOWN by cover)
 *   totalAvailable — the TOTAL AVAILABLE footer total      (counts DOWN by cover)
 *   totalUsed      — the TOTAL USED (THIS MONTH) total     (counts UP by cover)
 *
 * `onFrame` fires each animation frame; `onDone` fires exactly once at the end.
 * Returns a cancel fn (call it on unmount / when superseded). When rAF is
 * unavailable (SSR or a bare test env) or duration ≤ 0, it jumps straight to
 * `to` and calls `onDone` so callers never get stuck mid-tween.
 */
export interface CountTriple {
  available: number;
  totalAvailable: number;
  totalUsed: number;
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function animateCountTriple(
  from: CountTriple,
  to: CountTriple,
  durationMs: number,
  onFrame: (v: CountTriple) => void,
  onDone: () => void,
): () => void {
  const raf =
    typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null;
  const caf =
    typeof globalThis.cancelAnimationFrame === "function"
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : null;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? () => performance.now()
      : () => Date.now();

  if (!raf || durationMs <= 0) {
    onFrame(to);
    onDone();
    return () => {};
  }

  const lerp = (a: number, b: number, e: number): number =>
    Math.round(a + (b - a) * e);
  const start = now();
  let handle = 0;
  let cancelled = false;

  const tick = (): void => {
    if (cancelled) return;
    const p = Math.min(1, (now() - start) / durationMs);
    const e = easeOutCubic(p);
    onFrame({
      available: lerp(from.available, to.available, e),
      totalAvailable: lerp(from.totalAvailable, to.totalAvailable, e),
      totalUsed: lerp(from.totalUsed, to.totalUsed, e),
    });
    if (p < 1) {
      handle = raf(tick);
    } else {
      onDone();
    }
  };
  handle = raf(tick);

  return () => {
    cancelled = true;
    if (caf && handle) caf(handle);
  };
}
