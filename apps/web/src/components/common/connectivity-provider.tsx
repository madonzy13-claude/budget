"use client";
/**
 * ConnectivityProvider — single source of truth for connectivity:
 *   online | offline | server-down   (offline takes precedence).
 *
 * - offline:     navigator.onLine === false.
 * - server-down: navigator.onLine true BUT the API is unreachable. Entered only
 *   after a /api/health probe CONFIRMS it (so a lone 4xx / endpoint blip doesn't
 *   trip it). Recovered by polling /api/health; on 200 we go online and refetch.
 *
 * Detection feed: api-unreachable-bus (clientApiFetch reports network/5xx as
 * "unreachable", 2xx/3xx/4xx as "ok"). On cold reload the (app) layout renders
 * <ServerDownSeed/> which calls reportApiUnreachable() once so the banner shows
 * immediately instead of waiting for the first client query to fail.
 *
 * Mirrors offline's online-event recovery (invalidateQueries) so the cached UI
 * refreshes the moment the API returns.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient, onlineManager } from "@tanstack/react-query";
import { subscribeApiReachability } from "@/lib/api-unreachable-bus";

export type ConnectivityStatus = "online" | "offline" | "server-down";

interface ConnectivityValue {
  status: ConnectivityStatus;
  degraded: boolean;
  reason: ConnectivityStatus;
}

const ConnectivityContext = createContext<ConnectivityValue>({
  status: "online",
  degraded: false,
  reason: "online",
});

export function useConnectivity(): ConnectivityValue {
  return useContext(ConnectivityContext);
}

const HEALTH_TIMEOUT_MS = 4_000;
const RECOVERY_POLL_MS = 7_000;

async function probeHealth(): Promise<boolean> {
  try {
    // Raw fetch (NOT clientApiFetch) so the probe never feeds the bus itself.
    const res = await fetch("/api/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [networkOnline, setNetworkOnline] = useState(true);
  const [serverDown, setServerDown] = useState(false);
  const probing = useRef(false);

  // navigator.onLine + listeners.
  useEffect(() => {
    setNetworkOnline(navigator.onLine);
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // React to API reachability reports.
  useEffect(() => {
    return subscribeApiReachability(async (event) => {
      if (event === "ok") {
        setServerDown(false);
        return;
      }
      // "unreachable": confirm with a health probe before flipping.
      if (navigator.onLine === false) return; // offline owns this case
      if (probing.current) return;
      probing.current = true;
      const ok = await probeHealth();
      probing.current = false;
      setServerDown(!ok);
    });
  }, []);

  // Recovery poll while server-down.
  useEffect(() => {
    if (!serverDown) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      if (navigator.onLine === false) return;
      const ok = await probeHealth();
      if (ok && !cancelled) {
        setServerDown(false);
        void queryClient.invalidateQueries();
      }
    }, RECOVERY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [serverDown, queryClient]);

  // Reflect server-down on <html> so global.css can dim controls (parity with
  // the offline html.is-offline marker).
  useEffect(() => {
    document.documentElement.classList.toggle("is-server-down", serverDown);
    return () => document.documentElement.classList.remove("is-server-down");
  }, [serverDown]);

  const status: ConnectivityStatus = !networkOnline
    ? "offline"
    : serverDown
      ? "server-down"
      : "online";

  // Pause React Query while server-down so queries KEEP their cached data and
  // don't fire failing fetches that would flip tabs into an error/empty state —
  // exactly how offline behaves (offline pauses because navigator.onLine is
  // false; server-down has onLine true, so we pause the onlineManager manually).
  // Leaving server-down → resume, which refetches the paused queries.
  useEffect(() => {
    onlineManager.setOnline(status === "server-down" ? false : networkOnline);
  }, [status, networkOnline]);

  return (
    <ConnectivityContext.Provider
      value={{ status, degraded: status !== "online", reason: status }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
}

/**
 * ServerDownSeed — mounted by (app)/layout ONLY on a cold reload where the
 * server already knows the API is down. Pushes one "unreachable" report so the
 * provider confirms + shows the banner immediately (instead of waiting for the
 * first client query to fail).
 */
export function ServerDownSeed() {
  useEffect(() => {
    void import("@/lib/api-unreachable-bus").then((m) =>
      m.reportApiUnreachable(),
    );
  }, []);
  return null;
}
