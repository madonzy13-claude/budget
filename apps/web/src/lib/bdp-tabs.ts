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
