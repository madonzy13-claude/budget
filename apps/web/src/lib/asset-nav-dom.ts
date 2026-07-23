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
