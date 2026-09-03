/**
 * scroll-to-draft — bring a draft row into view and mark it for a moment.
 *
 * The CONFIRM_DRAFT task names its draft ("Confirm 29.99 zł (Surfr)"), but the
 * user still had to find that row by eye: the spendings grid is a horizontal
 * scroller of category columns, so the draft is usually both below the fold and
 * off to one side. Clicking the name jumps to it.
 *
 * DOM lookup rather than a React ref because the two ends live in different
 * trees — the task banner is above the grid, and the aggregate page renders the
 * same task with no grid at all. A miss is normal (different month, other page)
 * and is reported, not thrown.
 *
 * WHY NOT `el.scrollIntoView({behavior:"smooth"})`: that is ONE animation over
 * the whole ancestor chain, and WebKit animates only the nearest ancestor when
 * there is more than one. The installed PWA has more than one — the spendings
 * grid becomes its own scroller in standalone (spendings-grid-client.tsx:613) —
 * which is why the reported symptom ("first tap moves it about a pixel, the
 * second works") showed up on a phone and not in a desktop browser. Driving
 * each scroller ourselves keeps the smooth animation and makes the chain
 * explicit.
 */

/** How long the arrival highlight stays on. Long enough to catch the eye
 *  after the scroll settles, short enough not to linger as decoration. */
const FLASH_MS = 1600;

const flashTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/**
 * Scroll the draft row with this id into view and flash it.
 * @returns true if the row was on the page, false if there was nothing to do.
 */
export function scrollToDraft(draftId: string): boolean {
  if (typeof document === "undefined" || !draftId) return false;

  const selector = `[data-draft-id="${cssEscape(draftId)}"]`;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;

  scrollAncestorsTo(el);
  flash(el);
  return true;
}

/**
 * Wait for the draft row to exist, then jump to it.
 *
 * A CONFIRM_DRAFT task can name a payment in a month the grid is not showing.
 * Clicking it switches the month first, and the row only exists once that
 * month's data has loaded — so the plain call would report "not on the page"
 * and do nothing, which is exactly what the user saw.
 *
 * Polls frames rather than observing: the grid mounts its columns over several
 * commits, and a MutationObserver would fire on every one of them for the same
 * answer. Bounded, because the draft may never arrive — confirmed on another
 * device, deleted, or a month that genuinely has no such row — and a wait that
 * never ends is a leak.
 *
 * @returns a cancel function, for a caller that navigates away mid-wait.
 */
export function scrollToDraftWhenReady(
  draftId: string,
  opts: { timeoutMs?: number } = {},
): () => void {
  const timeoutMs = opts.timeoutMs ?? 4000;
  if (typeof document === "undefined" || !draftId) return () => {};

  // Already there: no reason to wait a frame first.
  if (scrollToDraft(draftId)) return () => {};

  let cancelled = false;
  const started = Date.now();
  const tick = () => {
    if (cancelled) return;
    if (scrollToDraft(draftId)) return;
    if (Date.now() - started > timeoutMs) return;
    raf(tick);
  };
  raf(tick);
  return () => {
    cancelled = true;
  };
}

/** rAF where it exists, a timer where it does not (tests, SSR-adjacent code). */
function raf(fn: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

/**
 * Scroll every scrollable ancestor so `el` is centred horizontally and just
 * inside the edge vertically.
 *
 * Horizontal is centred because the category columns are wide and a column
 * flush against the edge reads as "next to the one you wanted". Vertical is
 * "nearest" — the smallest move that reveals it — so the jump cannot drag the
 * page out from under the sticky header.
 *
 * Every target offset is computed BEFORE anything moves. That is safe because a
 * scroller's own scrollLeft/scrollTop is measured against its own content, not
 * against where its parent happens to be scrolled, so an outer scroll cannot
 * invalidate an inner one's target. It also matters: the scrolls are animations
 * that run concurrently, so re-measuring between them would read positions
 * mid-flight.
 */
function scrollAncestorsTo(el: HTMLElement): void {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  const target = el.getBoundingClientRect();

  const moves: Array<[Element | Window, ScrollToOptions]> = [];

  for (
    let node = el.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (!isScrollable(node)) continue;
    const box = node.getBoundingClientRect();
    const opts: ScrollToOptions = { behavior };

    if (canScrollX(node)) {
      const centred =
        node.scrollLeft +
        (target.left - box.left) -
        (node.clientWidth - target.width) / 2;
      opts.left = clamp(centred, node.scrollWidth - node.clientWidth);
    }
    if (canScrollY(node)) {
      const delta = nearestDelta(
        target.top,
        target.bottom,
        box.top,
        box.top + node.clientHeight,
      );
      if (delta !== 0) {
        opts.top = clamp(
          node.scrollTop + delta,
          node.scrollHeight - node.clientHeight,
        );
      }
    }
    if (opts.left !== undefined || opts.top !== undefined) {
      moves.push([node, opts]);
    }
  }

  // The page itself, last: vertical only, and only as far as needed.
  const pageDelta = nearestDelta(
    target.top,
    target.bottom,
    0,
    viewportHeight(),
  );
  if (pageDelta !== 0) {
    moves.push([
      window,
      { top: Math.max(0, window.scrollY + pageDelta), behavior },
    ]);
  }

  for (const [node, opts] of moves) node.scrollTo?.(opts);
}

/** How far to move so [start,end] sits inside [lo,hi]; 0 if it already does. */
function nearestDelta(
  start: number,
  end: number,
  lo: number,
  hi: number,
): number {
  if (start < lo) return start - lo;
  if (end > hi) return end - hi;
  return 0;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, Math.max(0, max)));
}

function isScrollable(el: Element): boolean {
  return canScrollX(el) || canScrollY(el);
}

/** A scroller has both the overflow style AND content that overflows. The
 *  style alone matches every `overflow:hidden` wrapper in the tree. */
function canScrollX(el: Element): boolean {
  const s = getComputedStyle(el);
  return (
    /auto|scroll/.test(s.overflowX || s.overflow || "") &&
    el.scrollWidth > el.clientWidth + 1
  );
}

function canScrollY(el: Element): boolean {
  const s = getComputedStyle(el);
  return (
    /auto|scroll/.test(s.overflowY || s.overflow || "") &&
    el.scrollHeight > el.clientHeight + 1
  );
}

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Ring the row briefly. Restarts if it is already lit — a second click should
 *  read as a second flash, not as nothing happening. */
function flash(el: HTMLElement): void {
  const running = flashTimers.get(el);
  if (running) clearTimeout(running);
  el.setAttribute("data-draft-flash", "");
  flashTimers.set(
    el,
    setTimeout(() => {
      el.removeAttribute("data-draft-flash");
      flashTimers.delete(el);
    }, FLASH_MS),
  );
}

/** CSS.escape where it exists (happy-dom does not always provide it). Draft
 *  ids are UUIDs, so the fallback only has to survive, not be complete. */
function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  return css?.escape ? css.escape(value) : value.replace(/["\\]/g, "\\$&");
}
