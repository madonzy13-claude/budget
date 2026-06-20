/**
 * install-detect.ts — heuristic detection of an already-installed PWA.
 *
 * Chromium browsers fire `beforeinstallprompt` when the app is installable
 * but NOT installed. On a page already controlled by our service worker
 * (i.e. not a first visit, so install criteria have long been met), silence
 * from that event means the app is almost certainly installed.
 *
 * Scope-limited on purpose:
 * - non-Chromium (Firefox/Safari): no signal either way → never assume
 * - first visit (no SW controller): the event may simply be late → skip
 * - iOS: no detection API exists at all; handled by manual dismiss instead
 *
 * The result is session-only (see markSessionInstalled) — a later
 * beforeinstallprompt reverses a wrong guess.
 */

type NavigatorLike = Navigator & {
  userAgentData?: { brands?: { brand: string; version: string }[] };
};

export function isChromium(nav: Navigator = window.navigator): boolean {
  const n = nav as NavigatorLike;
  const brands = n.userAgentData?.brands;
  if (brands?.some((b) => /Chromium|Google Chrome|Brave|Edge/i.test(b.brand))) {
    return true;
  }
  const ua = n.userAgent;
  // iOS browsers are all WebKit regardless of branding — exclude
  if (/iPhone|iPad|iPod/.test(ua)) return false;
  return /Chrome\//.test(ua);
}

export interface AssumeInstalledInput {
  nav?: Navigator;
  swControlled: boolean;
  hasPrompt: boolean;
}

export function shouldAssumeInstalled({
  nav,
  swControlled,
  hasPrompt,
}: AssumeInstalledInput): boolean {
  if (hasPrompt) return false;
  if (!swControlled) return false;
  return isChromium(nav ?? window.navigator);
}
