"use client";
/**
 * offline-resilience.tsx — single client island that wires the app's offline
 * resilience into the (app) tree.
 *
 * The (app) layout is a Server Component, so React hooks cannot run there.
 * This "use client" leaf renders <AppUpdater/> — keeps installed PWAs on the
 * latest build without a force-close (see app-updater.tsx).
 *
 * Robust-minimal offline (260614-q1v): the offline write QUEUE and its
 * reconnect-replay (useOnlineSync) were removed — offline writes now roll back
 * with an honest toast instead of queueing, so there is nothing to drain.
 *
 * Mounted once in the (app) layout, alongside the OfflineStaleBar.
 */
import { AppUpdater } from "@/components/common/app-updater";

export function OfflineResilience() {
  return <AppUpdater />;
}
