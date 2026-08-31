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
 */

/** How long the arrival highlight stays on. Long enough to catch the eye
 *  after the smooth scroll settles, short enough not to linger as decoration. */
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

  // inline:"center" walks the horizontal category scroller across to the
  // draft's column; block:"nearest" scrolls vertically only as far as needed,
  // so it cannot drag the page out from under the sticky header.
  //
  // Deliberately NOT behavior:"smooth". Smooth is an animation, and anything
  // that scrolls while it runs cancels it part-way: the browser's own scroll
  // when the button takes focus, a re-render swapping the row out from under
  // it, or WebKit animating only ONE ancestor when the row sits inside nested
  // scrollers — which the installed PWA has (the grid switches to its own
  // scroller in standalone) and a desktop browser does not. That is the
  // reported "first tap moves it about a pixel, second tap works": the first
  // tap's animation was cancelled, and by the second the ancestors were
  // already where they needed to be. An instant scroll cannot land half-done,
  // and the arrival flash below already does the work smoothness was for.
  el.scrollIntoView({ block: "nearest", inline: "center" });

  // Restart the highlight if it is already lit — a second click should read as
  // a second flash, not as nothing happening.
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

  return true;
}

/** CSS.escape where it exists (happy-dom does not always provide it). Draft
 *  ids are UUIDs, so the fallback only has to survive, not be complete. */
function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  return css?.escape ? css.escape(value) : value.replace(/["\\]/g, "\\$&");
}
