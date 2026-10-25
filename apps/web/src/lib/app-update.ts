/**
 * app-update.ts — keeping the installed app on the latest build (user, 261023).
 *
 * Every build bakes its id into the bundle (NEXT_PUBLIC_BUILD_ID, next.config).
 * The server answers /version.json with the id of the build it serves NOW, so
 * comparing the two says whether this tab runs old code. Code can't be swapped
 * in place, so a stale app reloads — at a moment nobody loses anything.
 */
import { useSyncExternalStore } from "react";

/** The build this bundle came from (inlined at build time). */
export const RUNNING_BUILD = process.env["NEXT_PUBLIC_BUILD_ID"] ?? "dev";
/** The release number shown in Settings (root package.json). */
export const APP_VERSION = process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0";

/** How long without a tap or key before a reload can't interrupt anyone. */
export const QUIET_MS = 60_000;

export function readyToReload(s: {
  stale: boolean;
  /** A field has focus, a sheet is open, or a save hasn't finished. */
  busy: boolean;
  /** Last tap/key since open or resume; null = untouched. */
  lastInputAt: number | null;
  now: number;
}): boolean {
  if (!s.stale || s.busy) return false;
  return s.lastInputAt === null || s.now - s.lastInputAt >= QUIET_MS;
}

/** What was last tried for which build, kept across reloads. */
export type UpdateAttempt = { target: string; step: "reload" | "clean" };

/**
 * A plain reload first. If the same old build comes back (the service worker
 * or cache served it), a clean reload — the swipe-out equivalent. After that,
 * stop: Settings still offers "Update now".
 */
export function nextUpdateStep(
  last: UpdateAttempt | null,
  latest: string,
): "reload" | "clean" | "stop" {
  if (!last || last.target !== latest) return "reload";
  return last.step === "reload" ? "clean" : "stop";
}

/** The build the server serves now, or null when it can't be asked. */
export async function fetchLatestBuild(): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { buildId?: string };
    return body.buildId ?? null;
  } catch {
    return null;
  }
}

/**
 * Reload from scratch: drop the service worker and the cached app files so
 * nothing old can answer, then reload. Data lives in IndexedDB and stays; the
 * pending push deep-link is kept too.
 */
export async function cleanReload(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // no service worker — nothing to drop
  }
  try {
    for (const key of await caches.keys())
      if (key !== "budget-deeplink") await caches.delete(key);
  } catch {
    // Cache Storage unavailable
  }
  window.location.reload();
}

// ── Latest-build store: written by AppUpdater, read by Settings ──
let latestBuild: string | null = null;
const listeners = new Set<() => void>();

export function setLatestBuild(id: string | null): void {
  latestBuild = id;
  listeners.forEach((l) => l());
}

export function useLatestBuild(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => latestBuild,
    () => null,
  );
}

// ── The attempt record: survives the reload it triggers ──
const ATTEMPT_KEY = "app-update-attempt";

export function readAttempt(): UpdateAttempt | null {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY);
    return raw ? (JSON.parse(raw) as UpdateAttempt) : null;
  } catch {
    return null;
  }
}

export function writeAttempt(a: UpdateAttempt | null): void {
  try {
    if (a) localStorage.setItem(ATTEMPT_KEY, JSON.stringify(a));
    else localStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // storage blocked — the update still happens, just unannounced
  }
}

/** Settings' "Update now": straight to the clean reload. */
export function updateNow(latest: string): Promise<void> {
  writeAttempt({ target: latest, step: "clean" });
  return cleanReload();
}

/**
 * The build stamp for people: "23 Oct 2026, 18:21" in their locale. The id
 * keeps seconds so every build is unique; nobody needs to read them. The id
 * is UTC; it shows in the viewer's zone. A git sha stays as it is.
 */
export function formatBuild(
  buildId: string,
  locale: string,
  timeZone?: string,
): string {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/.exec(buildId);
  if (!m) return buildId;
  const at = new Date(`${m[1]}T${m[2]}:00Z`);
  if (Number.isNaN(at.getTime())) return buildId;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone,
  }).format(at);
}
