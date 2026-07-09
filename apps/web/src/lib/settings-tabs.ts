/**
 * settings-tabs.ts — shared USER-settings pill constants/types, safe to import
 * from BOTH server and client modules (parallel to lib/bdp-tabs.ts). The server
 * catch-all page calls isSettingsTab() during render, so these live in a plain
 * module with NO "use client".
 *
 * Two pills: General (display language + currency) · User (Profile / Security /
 * Danger Zone accordion). "general" is the canonical default at /settings.
 */
export const SETTINGS_TAB_ORDER = ["general", "user"] as const;

export type SettingsTab = (typeof SETTINGS_TAB_ORDER)[number];

export function isSettingsTab(s: string | undefined | null): s is SettingsTab {
  return !!s && (SETTINGS_TAB_ORDER as readonly string[]).includes(s);
}
