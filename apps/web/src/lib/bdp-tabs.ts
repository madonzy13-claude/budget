/**
 * bdp-tabs.ts — shared BDP tab constants/types, safe to import from BOTH server
 * and client modules. These previously lived in budget-detail.tsx ("use client"),
 * but the server catch-all page calls isBdpTab() during render — a client
 * function can't be invoked from the server, so they live here (no "use client").
 */
export const TAB_ORDER = [
  "overview",
  "wallets",
  "spendings",
  "reserves",
  "settings",
] as const;

export type BdpTab = (typeof TAB_ORDER)[number];

export function isBdpTab(s: string | undefined | null): s is BdpTab {
  return !!s && (TAB_ORDER as readonly string[]).includes(s);
}

/**
 * Same-pill budget switch: keep the tab the user is currently on (parsed from
 * the current pathname) when jumping to another budget, so they land on the same
 * pill. Unknown / absent pill (bare budget path, home, null) → overview. The
 * reserves pill is dropped to overview when the DESTINATION budget has reserves
 * disabled — that pill doesn't exist there. `reservesEnabled` undefined means
 * "unknown" → carry the pill (default is enabled; the page guards direct loads).
 */
export function budgetSwitchPath(
  locale: string,
  destination: { id: string; reservesEnabled?: boolean },
  currentPathname: string | null,
): string {
  const seg = currentPathname?.match(/\/budgets\/[^/]+\/([^/?#]+)/)?.[1];
  let tab: BdpTab = isBdpTab(seg) ? seg : "overview";
  if (tab === "reserves" && destination.reservesEnabled === false) {
    tab = "overview";
  }
  return `/${locale}/budgets/${destination.id}/${tab}`;
}
