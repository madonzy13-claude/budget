"use client";
/**
 * offline-resilience.tsx — single client island that wires the app's offline
 * resilience into the (app) tree.
 *
 * The (app) layout is a Server Component, so React hooks cannot run there.
 * This "use client" leaf renders <SwUpdateReloader/> — reloads once when a new
 * deploy's SW takes control so installed PWAs pick up new builds without a
 * force-close.
 *
 * Robust-minimal offline (260614-q1v): the offline write QUEUE and its
 * reconnect-replay (useOnlineSync) were removed — offline writes now roll back
 * with an honest toast instead of queueing, so there is nothing to drain.
 *
 * Mounted once next to <OfflineStatusBadge/> in the (app) layout.
 */
import { SwUpdateReloader } from "@/components/common/sw-update-reloader";

export function OfflineResilience() {
  return <SwUpdateReloader />;
}
