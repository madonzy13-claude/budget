/**
 * restore-scroll.ts — re-apply a saved scroll offset once the content is tall
 * enough to reach it (UAT round 16 item 4). Restoring on mount often lands 0
 * because the pane's data (charts / grid columns) hasn't laid out yet, so
 * `scrollTop = saved` clamps to the current (small) max. This polls a few frames
 * until `scrollHeight` can hold the target, applies it once, then stops — with a
 * timeout that best-effort clamps so it never spins forever.
 */
export function restoreScroll(
  el: HTMLElement,
  target: { top?: number; left?: number; timeoutMs?: number },
): () => void {
  const top = target.top ?? 0;
  const left = target.left ?? 0;
  const timeoutMs = target.timeoutMs ?? 1500;
  if (top <= 0 && left <= 0) return () => {};
  if (typeof requestAnimationFrame !== "function") {
    el.scrollTop = top;
    el.scrollLeft = left;
    return () => {};
  }
  const now = () =>
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const start = now();
  let raf = 0;
  let done = false;
  const tick = () => {
    if (done) return;
    const maxTop = el.scrollHeight - el.clientHeight;
    const reachable = top <= 0 || maxTop >= top - 1;
    if (reachable || now() - start > timeoutMs) {
      if (top > 0) el.scrollTop = reachable ? top : Math.max(0, maxTop);
      if (left > 0) el.scrollLeft = left;
      done = true;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
  };
}
