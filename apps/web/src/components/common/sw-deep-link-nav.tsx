"use client";
/**
 * SwDeepLinkNav — delivers a push-notification tap to the correct in-app route.
 *
 * WHY a Cache + foreground-poll instead of SW navigation (260618, Test 8):
 * on a standalone iOS PWA the Service Worker CANNOT route the open window from
 * `notificationclick` — `clients.matchAll()` is frequently EMPTY (the PWA window
 * isn't reported as a controllable client), and both `WindowClient.navigate()`
 * and `clients.openWindow()` merely REFOCUS the existing window without changing
 * the route. So every SW-driven attempt left the user on the budget list.
 *
 * Reliable channel: the SW writes the pending deep-link URL into a Cache entry
 * (see sw.ts notificationclick). Tapping the notification brings the PWA to the
 * foreground; we read the pending URL and navigate the PAGE (where navigation IS
 * allowed). Works identically on iOS, Android, desktop, and on cold start.
 *
 * WHY POLL (260618 round 4): the SW `notificationclick` and the page's
 * `visibilitychange` race — on iOS the app is frequently ALREADY visible by the
 * time the SW finishes writing the cache, so a single read on `visible` saw an
 * EMPTY cache and never retried. After each foreground transition we poll the
 * cache a few times over ~2s and stop as soon as we consume an entry.
 *
 * Mounted in [locale]/layout so it runs on every route the user might already
 * have open. Uses a full-document `location.assign` for the most reliable iOS
 * navigation + a fresh load of the deep-linked tab / ?task= highlight.
 */
import { useEffect } from "react";

const DEEPLINK_CACHE = "budget-deeplink";
const DEEPLINK_KEY = "/__pending_deeplink__";
const POLL_TRIES = 8;
const POLL_INTERVAL_MS = 300;

export function SwDeepLinkNav() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let consuming = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    // Returns true once a pending entry has been found + consumed (whether it
    // navigated or was skipped as same-route) so the poller can stop.
    async function consumePending(): Promise<boolean> {
      if (consuming || typeof caches === "undefined") return false;
      consuming = true;
      try {
        const cache = await caches.open(DEEPLINK_CACHE);
        const hit = await cache.match(DEEPLINK_KEY);
        if (!hit) return false;
        const url = (await hit.text()).trim();
        await cache.delete(DEEPLINK_KEY); // consume-once
        if (!url) return true;

        // Skip if we're already on the exact target — avoids a needless reload.
        try {
          const target = new URL(url, window.location.origin);
          if (
            target.pathname === window.location.pathname &&
            target.search === window.location.search
          ) {
            return true;
          }
        } catch {
          // malformed url — fall through and let assign surface it
        }

        window.location.assign(url);
        return true;
      } catch {
        return false; // cache unavailable / quota — non-fatal, allow retry
      } finally {
        consuming = false;
      }
    }

    // Poll briefly after a foreground event to win the SW-write vs page-visible
    // race. Stops as soon as something is consumed, or after POLL_TRIES.
    function poll(triesLeft: number) {
      if (disposed) return;
      void consumePending().then((done) => {
        if (done || disposed || triesLeft <= 0) return;
        pollTimer = setTimeout(() => poll(triesLeft - 1), POLL_INTERVAL_MS);
      });
    }

    function startPoll() {
      if (pollTimer) clearTimeout(pollTimer);
      poll(POLL_TRIES);
    }

    function onVisible() {
      if (document.visibilityState === "visible") startPoll();
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | undefined;
      if (data?.type === "DEEP_LINK") startPoll();
    }

    // Mount (cold-start openWindow lands here) + every foreground transition
    // (the iOS notification-tap path) + an explicit SW ping (Android/desktop).
    startPoll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", startPoll);
    const sw =
      typeof navigator !== "undefined" && "serviceWorker" in navigator
        ? navigator.serviceWorker
        : null;
    sw?.addEventListener("message", onMessage);

    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", startPoll);
      sw?.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
