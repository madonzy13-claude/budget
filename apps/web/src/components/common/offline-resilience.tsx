"use client";
/**
 * offline-resilience.tsx — single client island that wires the app's offline
 * resilience hooks/components into the (app) tree (issue 2 mount point).
 *
 * The (app) layout is a Server Component, so React hooks cannot run there.
 * This "use client" leaf:
 *   - calls useOnlineSync() — drains the offline write queue on
 *     online / visibilitychange→visible / focus (idempotent), and
 *   - renders <SwUpdateReloader/> — reloads once when a new deploy's SW takes
 *     control so installed PWAs pick up new builds without a force-close.
 *
 * Mounted once next to <OfflineStatusBadge/> in the (app) layout, INSIDE the
 * app-wide QueryClientProvider that useOnlineSync requires.
 */
import { useOnlineSync } from "@/hooks/use-online-sync";
import { SwUpdateReloader } from "@/components/common/sw-update-reloader";

export function OfflineResilience() {
  useOnlineSync();
  return <SwUpdateReloader />;
}
