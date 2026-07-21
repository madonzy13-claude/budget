"use client";
/**
 * badge-prefs.ts — PER-DEVICE app-icon badge opt-in, stored in localStorage.
 *
 * The badge only paints THIS install's home-screen icon (navigator.setAppBadge),
 * so its opt-in must be per-device, not per-account: two phones can independently
 * choose whether a budget's pending-task count shows on the icon. Previously this
 * lived in notification_prefs (account-wide) — a two-phone user couldn't differ.
 *
 * Shape: { [budgetId]: boolean }. Absent = never chosen (opt-in default OFF).
 */
import { useEffect, useState } from "react";

const KEY = "budget:badge-prefs";
const EVENT = "badge-prefs-changed";

export function getBadgePrefs(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Whether this device has an explicit choice for a budget (for auto-enable). */
export function hasBadgePref(budgetId: string): boolean {
  return budgetId in getBadgePrefs();
}

export function setBadgePref(budgetId: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  const next = { ...getBadgePrefs(), [budgetId]: enabled };
  window.localStorage.setItem(KEY, JSON.stringify(next));
  // Notify same-tab listeners (AppBadge, the settings switch); the native
  // `storage` event only fires in OTHER tabs, so we add our own for this tab.
  window.dispatchEvent(new CustomEvent(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Live per-device badge prefs. Reads localStorage synchronously on the client
 *  (server → {}); consumers render nothing / are PWA-gated, so no hydration
 *  mismatch, and the badge paints without a one-frame empty flash. */
export function useBadgePrefs(): Record<string, boolean> {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(getBadgePrefs);
  useEffect(() => {
    setPrefs(getBadgePrefs()); // resync if it changed between render + effect
    return subscribe(() => setPrefs(getBadgePrefs()));
  }, []);
  return prefs;
}
