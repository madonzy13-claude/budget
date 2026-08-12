"use client";
/**
 * sw-update-reloader.tsx — SW-update auto-reload client island (issue 1)
 *
 * PROBLEM: an installed PWA running an OLD build keeps its already-parsed OLD JS
 * even after a new deploy's service worker activates (sw.ts sets
 * skipWaiting+clientsClaim, so the new SW takes control under the open
 * document). The page only picks up the new build on a navigation / reload /
 * app-kill. RESULT: every deploy is invisible to installed users until a manual
 * force-close. This island closes that gap: when the controlling SW changes, it
 * reloads the page ONCE so the new build loads.
 *
 * MECHANISM DECISION — hand-rolled `controllerchange` listener, NOT
 * `@serwist/window`: `@serwist/next` already registers the SW for us.
 * Instantiating a second `@serwist/window` `Serwist` just to observe the
 * `controlling` event would risk double-registration and adds lifecycle
 * surface. The only behavior we need is "reload once when the controller CHANGES
 * after a prior controller existed" — a bare `controllerchange` listener plus a
 * sessionStorage loop-guard is the minimal robust option and is trivially
 * unit-testable with a mocked serviceWorker.
 *
 * SILENT RELOAD (not a toast): app state is server/queue-backed — offline writes
 * persist in IndexedDB via the offline queue and React Query refetches — so a
 * reload-on-update loses no user data. A silent reload avoids stranding users on
 * a stale build behind a dismissible prompt. (If a future in-edit form risk
 * emerges, swap to a toast.)
 *
 * TWO GUARDS:
 *   1. First-install guard — `controllerchange` ALSO fires the very first time a
 *      SW takes control of a never-controlled page (null→SW). That is an install,
 *      not an update, and must NOT reload. We capture `hadController` at mount;
 *      we only reload when a controller already existed when the event fires.
 *      (On the install transition we mark that a controller now exists so a
 *      SUBSEQUENT update in the same session still reloads.)
 *   2. Loop guard — a sessionStorage flag (`sw-reloaded-once`) set right before
 *      the reload ensures a single controllerchange yields exactly one reload and
 *      a fresh load after the reload never reloads again.
 */
import { useEffect, useRef } from "react";

const RELOAD_GUARD_KEY = "sw-reloaded-once";

/** How often a resume may ask the network whether there is a new build. Long
 *  enough that flicking between apps costs nothing, short enough that picking
 *  the phone back up after a deploy lands on the new build. */
const UPDATE_CHECK_MS = 60_000;

export function SwUpdateReloader() {
  useEffect(() => {
    // SSR / unsupported-browser guard.
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const sw = navigator.serviceWorker;

    // We already reloaded once in this tab session — never reload again (loop
    // guard at mount time, in case the reload re-mounted us).
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;

    // A controllerchange is an UPDATE only when a controller already existed.
    // The first install fires controllerchange transitioning null→SW.
    let hadController = !!sw.controller;

    function handler() {
      if (!hadController) {
        // First install: a SW now controls a previously-uncontrolled page.
        // Do NOT reload; remember a controller exists so a later update reloads.
        hadController = true;
        return;
      }
      // Loop guard: only ever reload once per tab session.
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
    }

    sw.addEventListener("controllerchange", handler);
    return () => sw.removeEventListener("controllerchange", handler);
  }, []);

  // Coming back to the app ASKS whether there is a new build.
  //
  // Everything above only fires once the browser has already noticed a deploy,
  // and an installed PWA resumed from the background never looks: no
  // navigation, no fetch of sw.js, no controllerchange. It keeps running the
  // build it launched with for as long as iOS keeps it alive, so a fix shipped
  // hours ago is simply not there — a corrected figure still read the old way
  // 44 minutes after the deploy (user, 260810). registration.update() is the
  // question; skipWaiting + clientsClaim in sw.ts install the answer, and the
  // listener above turns it into the one reload.
  const lastCheck = useRef(0);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const sw = navigator.serviceWorker;

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheck.current < UPDATE_CHECK_MS) return;
      lastCheck.current = now;
      // Best-effort: offline, or a registration that has gone away, is not an
      // error worth surfacing — the next resume asks again.
      void sw.ready.then((reg) => reg.update()).catch(() => {});
    }

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
