/**
 * ios-install.ts — iOS detection for PWA install guidance.
 *
 * iOS WebKit has no `beforeinstallprompt`; the only install path is the
 * manual Share → Add to Home Screen flow, so the UI must show instructions
 * instead of a programmatic prompt.
 */

export function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS 13+ reports as MacIntel but is touch-capable
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}
