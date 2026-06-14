"use client";

/**
 * offline-debug.tsx — 260614-kfw on-device offline diagnostics overlay.
 *
 * Renders ONLY when ?offdbg=1 is in the URL OR localStorage `offdbg=1` is set
 * (the flag survives PWA navigation). Mirrors viewport-debug.tsx (?vpdbg=1) —
 * same gating + interval/event-driven update approach — but is a distinct,
 * coexisting overlay (bottom-left vs vpdbg top-left).
 *
 * Purpose: ground truth on why offline write + recovery fail on the installed
 * iOS PWA. Two prior fixes passed Vitest but failed on device and we cannot see
 * what the device actually runs. This overlay is READ-ONLY instrumentation plus
 * two service-worker buttons — it changes NO offline logic.
 *
 * BUILD_ID is the PRIMARY signal: a screenshot showing an old id means the
 * device is still serving a cached bundle, not that the next fix failed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOfflineQueue,
  OFFLINE_QUEUE_CHANGED_EVENT,
} from "@/lib/offline-queue";
import {
  clearOfflineTrace,
  getOfflineTrace,
  type OfflineTraceEntry,
} from "@/lib/offline-trace";

// Bump on EVERY redeploy of this overlay. Proves the device runs the NEW build.
const BUILD_ID = "OFFDBG-3";

// How many trace lines to surface (newest first). Ring buffer holds ~12.
const TRACE_SHOWN = 8;

const FLAG_KEY = "offdbg";

export function isOffdbgEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("offdbg=1")) return true;
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleOffdbg(): boolean {
  try {
    const next = localStorage.getItem(FLAG_KEY) === "1" ? "0" : "1";
    localStorage.setItem(FLAG_KEY, next);
    return next === "1";
  } catch {
    return false;
  }
}

interface SwInfo {
  /** navigator.serviceWorker.controller present? (controls this page now) */
  hasController: boolean;
  controllerUrl: string;
  /** active registration's active worker state (activated/installing/…) */
  activeState: string;
  activeUrl: string;
  hasWaiting: boolean;
  hasInstalling: boolean;
  scope: string;
}

interface EventCounts {
  online: number;
  offline: number;
  visible: number;
  focus: number;
}

interface Snapshot {
  online: boolean;
  queueLen: number;
  /** failReason-bearing items (already moved to sync-issues) */
  queueFailed: number;
  sw: SwInfo | null;
  swSupported: boolean;
  displayMode: string;
  /** write-path telemetry ring buffer (oldest → newest) */
  trace: OfflineTraceEntry[];
}

function readDisplayMode(): string {
  return (
    ["standalone", "browser", "minimal-ui", "fullscreen"].find(
      (m) => window.matchMedia(`(display-mode: ${m})`).matches,
    ) ??
    ((window.navigator as { standalone?: boolean }).standalone
      ? "legacy-standalone"
      : "none")
  );
}

async function readSwInfo(): Promise<{
  supported: boolean;
  sw: SwInfo | null;
}> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { supported: false, sw: null };
  }
  const sw = navigator.serviceWorker;
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await sw.getRegistration();
  } catch {
    reg = undefined;
  }
  return {
    supported: true,
    sw: {
      hasController: !!sw.controller,
      controllerUrl: sw.controller?.scriptURL ?? "(none)",
      activeState: reg?.active?.state ?? "(no active)",
      activeUrl: reg?.active?.scriptURL ?? "(none)",
      hasWaiting: !!reg?.waiting,
      hasInstalling: !!reg?.installing,
      scope: reg?.scope ?? "(no reg)",
    },
  };
}

export function OfflineDebug() {
  const [enabled, setEnabled] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const counts = useRef<EventCounts>({
    online: 0,
    offline: 0,
    visible: 0,
    focus: 0,
  });
  // Mirror the ref into state so the render updates when a counter ticks.
  const [countsView, setCountsView] = useState<EventCounts>({
    online: 0,
    offline: 0,
    visible: 0,
    focus: 0,
  });

  const refresh = useCallback(async () => {
    let queueLen = -1;
    let queueFailed = -1;
    try {
      const q = await getOfflineQueue();
      queueLen = q.length;
      queueFailed = q.filter((i) => i.failReason).length;
    } catch {
      // IDB unavailable — leave -1 so the screenshot shows the failure mode.
    }
    const { supported, sw } = await readSwInfo();
    setSnap({
      online: navigator.onLine,
      queueLen,
      queueFailed,
      sw,
      swSupported: supported,
      displayMode: readDisplayMode(),
      trace: getOfflineTrace(),
    });
  }, []);

  const clearTrace = useCallback(() => {
    clearOfflineTrace();
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isOffdbgEnabled()) return;
    setEnabled(true);

    const bump = (k: keyof EventCounts) => {
      counts.current[k] += 1;
      setCountsView({ ...counts.current });
      void refresh();
    };
    const onOnline = () => bump("online");
    const onOffline = () => bump("offline");
    const onVisible = () => {
      if (document.visibilityState === "visible") bump("visible");
    };
    const onFocus = () => bump("focus");
    const onQueueChanged = () => void refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);

    void refresh();
    // Slow poll catches navigator.onLine flips that fire no event on iOS, and
    // SW state transitions (installing → waiting → activated) we don't hook.
    const id = setInterval(() => void refresh(), 1500);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, onQueueChanged);
      clearInterval(id);
    };
  }, [refresh]);

  const forceUpdate = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } catch {
      // best-effort — reload regardless to pull a fresh document
    }
    location.reload();
  }, []);

  const clearAll = useCallback(async () => {
    // Destructive to the offline CACHE only — server data is untouched.
    if (
      !window.confirm(
        "Clear all caches + unregister service workers, then reload?\n\nThis wipes the offline cache only (server data is safe).",
      )
    ) {
      return;
    }
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore — proceed to SW unregister + reload
    }
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      // ignore — proceed to reload
    }
    location.reload();
  }, []);

  if (!enabled || !snap) return null;

  const s = snap;
  const c = countsView;
  return (
    <div
      data-testid="offline-debug"
      className="fixed bottom-1 left-1 z-[9998] max-h-[45vh] w-[220px] overflow-y-auto rounded bg-black/85 p-2 font-mono text-[10px] leading-snug text-emerald-300"
    >
      <div className="font-bold text-emerald-200">{BUILD_ID}</div>
      <div>
        onLine{" "}
        <span className={s.online ? "text-emerald-300" : "text-red-400"}>
          {String(s.online)}
        </span>{" "}
        · mode {s.displayMode}
      </div>
      <div>
        queue {s.queueLen} · failed {s.queueFailed}
      </div>
      <div className="mt-1 border-t border-emerald-700/40 pt-1 text-emerald-200">
        [sw]
      </div>
      {!s.swSupported && <div className="text-red-400">unsupported</div>}
      {s.sw && (
        <>
          <div>
            ctrl{" "}
            <span
              className={
                s.sw.hasController ? "text-emerald-300" : "text-red-400"
              }
            >
              {String(s.sw.hasController)}
            </span>{" "}
            · active {s.sw.activeState}
          </div>
          <div className="break-all">ctrlUrl {s.sw.controllerUrl}</div>
          <div className="break-all">actUrl {s.sw.activeUrl}</div>
          <div>
            waiting {String(s.sw.hasWaiting)} · installing{" "}
            {String(s.sw.hasInstalling)}
          </div>
          <div className="break-all">scope {s.sw.scope}</div>
        </>
      )}
      <div className="mt-1 border-t border-emerald-700/40 pt-1 text-emerald-200">
        [events since mount]
      </div>
      <div>
        online {c.online} · offline {c.offline}
      </div>
      <div>
        visible {c.visible} · focus {c.focus}
      </div>
      <div className="mt-1 border-t border-emerald-700/40 pt-1 text-emerald-200">
        [trace]
      </div>
      {s.trace.length === 0 && <div className="text-emerald-500">(empty)</div>}
      {s.trace
        .slice(-TRACE_SHOWN)
        .reverse()
        .map((e, i) => (
          <div key={`${e.t}-${i}`} className="break-all">
            <span className="text-emerald-500">{e.t}</span> {e.step}
            {e.detail ? (
              <span className="text-emerald-200"> {e.detail}</span>
            ) : null}
          </div>
        ))}
      <div className="mt-2 flex flex-col gap-1">
        <button
          type="button"
          data-testid="offdbg-clear-trace"
          onClick={clearTrace}
          className="rounded border border-emerald-500/60 px-1 py-0.5 text-emerald-200 active:bg-emerald-900/40"
        >
          Clear trace
        </button>
        <button
          type="button"
          data-testid="offdbg-force-update"
          onClick={() => void forceUpdate()}
          className="rounded border border-emerald-500/60 px-1 py-0.5 text-emerald-200 active:bg-emerald-900/40"
        >
          Force update + reload
        </button>
        <button
          type="button"
          data-testid="offdbg-clear-all"
          onClick={() => void clearAll()}
          className="rounded border border-red-500/60 px-1 py-0.5 text-red-300 active:bg-red-900/40"
        >
          Clear caches + unregister SW
        </button>
      </div>
    </div>
  );
}
