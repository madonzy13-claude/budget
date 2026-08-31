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
  el.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });

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
