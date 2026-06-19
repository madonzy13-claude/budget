/**
 * offline-readonly.ts — decision logic for the global offline READ-ONLY layer.
 *
 * While the device KNOWS it is offline (navigator.onLine===false — the only
 * reliable iOS signal), the app becomes read-only: every WRITE control is
 * blocked and a bottom toast explains, while navigation and viewing stay live
 * (user decision, 2026-06-17). This module is the pure DOM predicate the
 * OfflineReadOnly listener consults for each interaction; the component owns the
 * events + toast. Pure + DOM-only so it is unit-testable without React.
 *
 * Boundary (what counts as a WRITE control):
 *  - form FIELDS: input / textarea / select / contenteditable, and ARIA
 *    switch / checkbox / radio / slider / spinbutton.
 *  - SUBMIT buttons (`[type=submit]`) — the save/create affordance.
 *  - anything explicitly marked `[data-offline-block]` (delete buttons, drag
 *    handles, toggle buttons that mutate but aren't a standard field).
 * ALWAYS allowed (navigation + viewing): `a[href]` links, plain `type=button`
 * buttons (tab pills are links; month-nav / switch-budget / profile / open-sheet
 * are type=button), and ANYTHING inside a `[data-offline-ok]` region (e.g. the
 * spendings quick-entry, which defers to its own richer "Can't add" dialog).
 */

/** Nav / opt-out region — checked FIRST so it overrides every block rule. */
const ALLOW_SELECTOR = "a[href], [data-offline-ok]";

/**
 * Form fields + ARIA edit roles + explicit submit / block markers.
 *
 * Includes `combobox` + `option` (custom value-pickers like the currency
 * select render `role="combobox"` triggers and `role="option"` items — native
 * `<select>` covers the rest). Deliberately EXCLUDES `menuitem` /
 * `menuitemradio` — the budget switcher uses those to NAVIGATE between budgets,
 * which stays live offline.
 */
const BLOCK_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="combobox"]',
  '[role="option"]',
  '[type="submit"]',
  "[data-offline-block]",
].join(", ");

/**
 * Should this interaction target be blocked because the app is offline?
 * Returns false for null, navigation, and non-interactive (readable) targets.
 */
export function shouldBlockOfflineInteraction(target: Element | null): boolean {
  if (!target) return false;
  // Navigation / explicit opt-out wins over every block rule.
  if (target.closest(ALLOW_SELECTOR)) return false;
  return target.closest(BLOCK_SELECTOR) !== null;
}
