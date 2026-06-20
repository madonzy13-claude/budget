"use client";
/**
 * offline-write.ts — SHARED honest-offline write wrapper.
 *
 * The spendings quick-entry (use-create-transaction) pioneered the robust-minimal
 * offline contract: there is NO queue and NO replay; an offline / unreachable /
 * hung write is honestly refused (rollback + "you're offline" message) instead of
 * silently failing or — worse — hanging forever. This module lifts that contract
 * into ONE place so EVERY data change (wallets, reserves, categories, settings,
 * drafts, …) behaves identically. Use `clientApiWrite` in any mutationFn / form
 * submit, then branch on `isOfflineWriteError(err)` to show the shared offline
 * toast (useOfflineWriteToast) vs a genuine validation error.
 *
 * Guarantees:
 *  - navigator.onLine===false → throw OfflineWriteError immediately, NO request.
 *    (onLine===false is the only RELIABLE signal on iOS — only the `true` value
 *    lies, reporting online on a dead link.)
 *  - Promise.race timeout (6s) so a hung POST that never settles — the iOS WebKit
 *    failure where AbortSignal.timeout does NOT abort the request — still rejects
 *    and the caller's onError runs (rollback + toast) instead of spinning forever.
 *  - network throw / AbortError / 5xx → OfflineWriteError (server-unreachable class).
 *  - genuine 4xx → the Response is RETURNED unchanged so the caller surfaces its
 *    own validation error (e.g. reserve_currency_mismatch) exactly as before.
 *  - 2xx → the Response is returned.
 */
import { clientApiFetch } from "./budget-fetch";

/**
 * Thrown when the server is unreachable for a write (device offline / network
 * throw / timeout / hung request / 5xx). Routes the caller to its honest
 * "you're offline" branch. A genuine 4xx is NOT this — it stays a real error.
 */
export class OfflineWriteError extends Error {
  constructor() {
    super("offline-write");
    this.name = "OfflineWriteError";
  }
}

/** Narrow an unknown error to OfflineWriteError (by instance OR by name — the
 *  name check survives cross-realm / re-thrown copies). */
export function isOfflineWriteError(err: unknown): err is OfflineWriteError {
  return (
    err instanceof OfflineWriteError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "OfflineWriteError")
  );
}

/** The manual race rejects at 6s; the best-effort AbortSignal fires slightly
 *  later so the race always wins first (and the abort is just a real cancel). */
const RACE_TIMEOUT_MS = 6000;
const ABORT_TIMEOUT_MS = 8000;

/**
 * clientApiWrite — `clientApiFetch` for mutations, with the honest-offline
 * guarantees above. Drop-in: pass the same (path, init); inspect the returned
 * Response for 4xx exactly as you would after `clientApiFetch`.
 */
export async function clientApiWrite(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // FAST-NEGATIVE: device KNOWS it is offline → instant, no doomed request.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new OfflineWriteError();
  }

  let raceTimer: ReturnType<typeof setTimeout> | undefined;
  let res: Response;
  try {
    const fetchPromise = clientApiFetch(path, {
      ...init,
      // Best-effort cancel — NOT relied upon (iOS ignores it on a hang); the
      // race below is the real guarantee. Respect a caller-supplied signal.
      signal: init.signal ?? AbortSignal.timeout(ABORT_TIMEOUT_MS),
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      raceTimer = setTimeout(
        () => reject(new OfflineWriteError()),
        RACE_TIMEOUT_MS,
      );
    });
    res = await Promise.race([fetchPromise, timeoutPromise]);
  } catch (err) {
    // Network throw (TypeError), AbortError, OR the race-timeout — all mean the
    // server was unreachable.
    if (err instanceof OfflineWriteError) throw err;
    throw new OfflineWriteError();
  } finally {
    if (raceTimer !== undefined) clearTimeout(raceTimer);
  }

  // 5xx = server-unreachable class → treat as offline. 4xx is a genuine error
  // the caller handles; 2xx is success — both returned unchanged.
  if (res.status >= 500) throw new OfflineWriteError();
  return res;
}
