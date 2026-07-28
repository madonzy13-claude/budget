/**
 * asset-nav-dom.ts — tiny DOM helpers for the assets-tab roving highlight,
 * shared by the keyboard-nav hook, the hover handler, and the post-mutation
 * refocus (create / delete). Keeps the `data-nav-highlighted` bookkeeping in one
 * place so every path resets the previous highlight the same way.
 */

/** All roving nav items in DOM order (wallets, invest rows, possessions, adds). */
export function navItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-nav-item]"));
}

/** Drop every highlight + field ring under `root`. */
export function clearNavMarkers(root: HTMLElement): void {
  root
    .querySelectorAll("[data-nav-highlighted],[data-nav-field-active]")
    .forEach((el) => {
      el.removeAttribute("data-nav-highlighted");
      el.removeAttribute("data-nav-field-active");
    });
}

/**
 * Whether the assets-tab keyboard-nav should pull focus into its root on mount
 * (260724, task 1). Arriving at the tab via a BDP pill CLICK leaves focus ON the
 * pill button, so the old "only grab from <body>" rule skipped the grab and ↑/↓
 * did nothing until the user clicked the dark background. Grab whenever focus is
 * outside the tab and not committed to real input — i.e. not a text field, not
 * an open dialog/menu/listbox, and not already inside the tab.
 */
export function shouldGrabAssetFocus(
  active: Element | null,
  root: Element,
): boolean {
  if (!active) return true;
  const tag = active.tagName;
  if (tag === "BODY" || tag === "HTML") return true;
  if (tag === "INPUT" || tag === "TEXTAREA") return false;
  if ((active as HTMLElement).isContentEditable) return false;
  if (
    active.closest(
      "[role='dialog'],[role='menu'],[role='listbox'],[data-editing='true']",
    )
  )
    return false;
  if (root.contains(active)) return false; // focus already within the tab
  return true;
}

/** Reset the previous highlight and move it to `el` (null just clears). */
export function highlightNavItem(
  root: HTMLElement,
  el: HTMLElement | null,
): void {
  clearNavMarkers(root);
  if (el) {
    el.setAttribute("data-nav-highlighted", "true");
    el.scrollIntoView({ block: "nearest" });
  }
}
