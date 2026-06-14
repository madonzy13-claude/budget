/**
 * offline-trace.ts — 260614-kfw write-path telemetry (instrumentation only).
 *
 * A tiny localStorage-backed ring buffer that records the steps the offline
 * write path takes on-device. localStorage is used DELIBERATELY (NOT IndexedDB):
 * IDB is the suspect for the offline-queue staying at 0 on iOS WebKit, so the
 * trace must not depend on the very subsystem under investigation.
 *
 * Every call is wrapped in try/catch — tracing must NEVER throw or alter the
 * control flow of the code it instruments. SSR-safe: guards `localStorage`.
 *
 * NOTE: Date.now()/new Date() are intentional here — this is app runtime code
 * (browser), not a build/workflow script.
 */

const TRACE_KEY = "offline-trace";
const MAX_ENTRIES = 12;

export interface OfflineTraceEntry {
  /** HH:MM:SS.mmm local time at the moment the step was recorded. */
  t: string;
  step: string;
  detail?: string;
}

function nowHHMMSSmmm(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

/**
 * Append a step to the ring buffer (last ~12 entries). Best-effort: any failure
 * (no localStorage, quota, serialization) is swallowed so instrumentation can
 * never break the flow it observes.
 */
export function traceOffline(step: string, detail?: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const entry: OfflineTraceEntry = { t: nowHHMMSSmmm(), step };
    if (detail !== undefined) entry.detail = detail;
    const buf = getOfflineTrace();
    buf.push(entry);
    while (buf.length > MAX_ENTRIES) buf.shift();
    localStorage.setItem(TRACE_KEY, JSON.stringify(buf));
  } catch {
    // tracing must never throw
  }
}

/** Read the current ring buffer (oldest → newest). Empty array on any failure. */
export function getOfflineTrace(): OfflineTraceEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(TRACE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineTraceEntry[]) : [];
  } catch {
    return [];
  }
}

/** Wipe the ring buffer. Best-effort. */
export function clearOfflineTrace(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(TRACE_KEY);
  } catch {
    // best-effort
  }
}
